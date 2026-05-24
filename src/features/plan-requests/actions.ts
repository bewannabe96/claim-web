"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { emitAdminNotification } from "@/features/notifications/emit";
import {
  findAssignmentCandidates,
  getPartnerCardsByIds,
} from "@/features/partners/queries";
import { getPriceForBudget } from "@/features/plan-request-pricing/queries";
import { newId, newToken } from "@/lib/id";
import { isAligoTestMode, sendAlimtalk, sendOtpSms } from "@/server/aligo";
import { requireAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";
import { getClientIp } from "@/server/get-client-ip";
import { buildNewAssignmentAlimtalk } from "@/server/kakao-templates";
import { getRedis } from "@/server/redis";
import {
  isAllowedExternalProposalContentType,
  isExternalProposalKey,
  presignExternalProposalUpload,
} from "@/server/s3";
import { getSettings } from "@/server/settings";

import { pickAssignedPartners } from "./auto-assignment";
import { getRequestById, hasActiveRequestForPhone } from "./queries";
import {
  notifyPartnersOfDeadlineExtension,
  sendAnalysisCompletedNotification,
} from "./state-transition";
import {
  CoverageRequestSchema,
  ExtendDeadlineSchema,
  OtpSchema,
  SendOtpSchema,
  Step1Schema,
  Step2Schema,
  Step3Schema,
  coverageRequestToText,
  deriveRrn,
  type ExtendDeadlineResult,
  type FinalizeState,
  type MedicalHistoryEntry,
  type SendOtpState,
  type Step1State,
  type Step2State,
} from "./schema";

/* ============================================================
 * Step 1 — 요청서 작성 (plan_request + medical_history + candidates 트랜잭션)
 * ============================================================
 *
 * 주의: "최종 송부"는 OTP 검증 시점 (finalize) 이지만, 후보 노출 → 선택 단계는
 * URL 기반 (/plan-request/[id]/candidates) 으로 흘러야 새로고침/뒤로가기가 자연스러움.
 * 그래서 이 시점에 status='selecting' 으로 row 생성하고, dispatched 전환은 finalize.
 */

export async function submitStep1(
  _prev: Step1State,
  formData: FormData,
): Promise<Step1State> {
  // 병력 / coverage 모두 클라가 JSON 직렬화하여 단일 hidden input 으로 전송.
  const medicalHistoryRaw = formData.get("medicalHistory");
  const medicalHistory = parseMedicalHistory(medicalHistoryRaw);
  if (medicalHistory === "INVALID") {
    return {
      ok: false,
      errors: { medicalHistory: ["병력 데이터가 올바르지 않습니다."] },
    };
  }

  const coverageRaw = formData.get("coverage");
  const coverage = parseJsonField(coverageRaw);
  if (coverage === "INVALID") {
    return {
      ok: false,
      errors: { coverage: ["보장 요청 데이터가 올바르지 않습니다."] },
    };
  }

  // 외부 설계안 키 배열 — 챗봇 v4 만 전송. 다른 진입점은 누락 → default [].
  // formData.getAll 은 누락 시 [] 반환이라 zod default 와 정합.
  const externalProposalKeys = formData
    .getAll("externalProposalKeys")
    .filter((v): v is string => typeof v === "string");

  const parsed = Step1Schema.safeParse({
    occupation: formData.get("occupation"),
    coverage,
    monthlyBudgetMin: formData.get("monthlyBudgetMin"),
    monthlyBudgetMax: formData.get("monthlyBudgetMax"),
    medicalHistory,
    externalProposalKeys,
    additionalNotes: formData.get("additionalNotes") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // 키 형식 검증 — forgery 차단 (zod 는 string 길이만 확인, prefix 패턴은 별도).
  // 한 개라도 패턴 어긋나면 전체 거부 — 챗봇이 정상 발급한 키는 항상 통과.
  if (!parsed.data.externalProposalKeys.every(isExternalProposalKey)) {
    return {
      ok: false,
      errors: { externalProposalKeys: ["올바르지 않은 첨부 파일이 포함되어 있어요."] },
    };
  }

  // 요청서 가격 snapshot — admin 이 이후 tier 가격/구성을 바꿔도 이 요청에는 영향 X.
  // step1-wizard chip 은 server component 가 listPriceTiers() 로 내려준 동일 row
  // 에서 만들어지므로 tier lookup 은 정상 흐름에선 항상 hit. 동시 삭제 등 race 시
  // throw → 사용자에게 generic 에러.
  const price = await getPriceForBudget(parsed.data.monthlyBudgetMin);

  // 배정 후보 산출 (DB) — 가격을 넘겨 자격 미달 파트너 (잔액 < 가격) 자동 제외.
  const settings = await getSettings();
  const candidates = await findAssignmentCandidates(
    settings.candidateCount,
    price,
  );

  // 부모 (plan_request) → 자식 (medical_history, candidates) 순서로 트랜잭션.
  // FK 무결성 보장 + 일부만 들어가는 부분 실패 방지.
  const id = newId();
  await prisma.$transaction([
    prisma.planRequest.create({
      data: {
        id,
        // 성별은 Step3 finalize 에서 주민번호로 set. 여기서는 비워둠.
        occupation: parsed.data.occupation,
        monthlyBudgetMin: parsed.data.monthlyBudgetMin,
        monthlyBudgetMax: parsed.data.monthlyBudgetMax,
        coverage: parsed.data.coverage,
        additionalNotes: parsed.data.additionalNotes ?? null,
        externalProposalKeys: parsed.data.externalProposalKeys,
        status: "selecting",
        price,
      },
    }),
    prisma.planRequestMedicalHistory.createMany({
      data: parsed.data.medicalHistory.map((h, i) => ({
        id: newId(),
        requestId: id,
        diagnosis: h.diagnosis,
        treatmentPeriod: h.treatmentPeriod,
        treatmentStartDate: new Date(h.treatmentStartDate),
        hospitalizationDays: h.hospitalizationDays,
        outpatientVisits: h.outpatientVisits,
        hadSurgery: h.hadSurgery,
        position: i,
      })),
    }),
    prisma.planRequestAssignmentCandidate.createMany({
      data: candidates.map((c, i) => ({
        requestId: id,
        partnerId: c.id,
        candidateRank: i,
        selected: false,
      })),
    }),
    // 배정 후보로 노출된 partner 들의 카운트 +1 — candidate row 와 같은 트랜잭션에
    // 묶어 atomicity 보장. stats row 누락된 레거시 partner 는 silent skip (시더 백필
    // 이 catch-all). exposureCount 정의: PlanRequestAssignmentCandidate INSERT = 후보 카드 등장.
    prisma.partnerAssignmentStats.updateMany({
      where: { partnerId: { in: candidates.map((c) => c.id) } },
      data: { exposureCount: { increment: 1 } },
    }),
  ]);

  revalidatePath("/admin/requests");
  return { ok: true, requestId: id };
}

/**
 * 클라이언트가 보낸 medicalHistory JSON 문자열을 배열로 풀어냄.
 * 빈 입력 → 빈 배열, JSON 파싱 실패 → "INVALID" 마커. zod 가 각 원소 검증.
 */
function parseMedicalHistory(
  raw: FormDataEntryValue | null,
): MedicalHistoryEntry[] | "INVALID" {
  if (!raw || typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return "INVALID";
    if (!parsed.every((e) => typeof e === "object" && e !== null)) {
      return "INVALID";
    }
    return parsed as MedicalHistoryEntry[];
  } catch {
    return "INVALID";
  }
}

/**
 * JSON 단일 객체용 — coverage 같은 구조화 필드를 hidden input 으로 받을 때.
 * 비어있거나 깨졌으면 "INVALID", zod 가 이후 정형/제약 검증.
 */
function parseJsonField(raw: FormDataEntryValue | null): unknown | "INVALID" {
  if (!raw || typeof raw !== "string" || raw.trim() === "") return "INVALID";
  try {
    return JSON.parse(raw);
  } catch {
    return "INVALID";
  }
}

/* ============================================================
 * 외부 설계안 PDF — 챗봇 변형 v4 Q4_8 전용 presign action
 * ============================================================
 *
 * 가입자가 다른 곳에서 받아온 PDF 를 챗봇 안에서 첨부할 때 사용. 호출 → S3
 * 키 + presigned PUT URL 받음 → 브라우저가 그 URL 로 PDF 직접 PUT → 업로드된
 * 키만 submitStep1 의 externalProposalKeys 폼 필드로 전달.
 *
 * 비인증 라우트 (랜딩 챗봇) 에서 호출하므로 세션 검증 없음. forgery 보호는
 * 키 자체가 nanoid 라 추측 불가능 + submit 단계 prefix 패턴 검증이 책임.
 * 키 발급 빈도 abuse 방지는 별도 레이트리밋 도입 시점에 (현재는 미적용).
 */

export type ExternalProposalPresignResult =
  | { ok: true; url: string; s3Key: string }
  | { ok: false; message: string };

/**
 * @param contentType — 클라이언트가 업로드할 파일의 MIME (file.type). 허용
 *   화이트리스트 (PDF + 이미지 5종) 통과 후 presign — presigned URL 의
 *   ContentType 서명에 그대로 박혀 클라가 다른 타입 PUT 시 signature mismatch.
 */
export async function presignExternalProposal(
  contentType: string,
): Promise<ExternalProposalPresignResult> {
  if (!isAllowedExternalProposalContentType(contentType)) {
    return {
      ok: false,
      message: "PDF 또는 사진 파일만 첨부할 수 있어요.",
    };
  }
  try {
    const { url, s3Key } = await presignExternalProposalUpload(contentType);
    return { ok: true, url, s3Key };
  } catch (err) {
    console.error("[presignExternalProposal] failed", err);
    return {
      ok: false,
      message: "파일 업로드 준비에 실패했어요. 잠시 후 다시 시도해주세요.",
    };
  }
}

/* ============================================================
 * Step 2 — 후보 선택
 * ============================================================ */

export async function submitStep2(
  requestId: string,
  _prev: Step2State,
  formData: FormData,
): Promise<Step2State> {
  const parsed = Step2Schema.safeParse({
    partnerIds: formData.getAll("partnerIds"),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const settings = await getSettings();
  if (parsed.data.partnerIds.length > settings.selectLimit) {
    return {
      ok: false,
      errors: {
        partnerIds: [`최대 ${settings.selectLimit}명까지 선택 가능합니다.`],
      },
    };
  }

  const persist = await persistStep2Selection(requestId, parsed.data.partnerIds);
  if (!persist.ok) {
    return {
      ok: false,
      errors: {
        _form: [
          persist.reason === "not_selecting"
            ? "요청을 찾을 수 없습니다."
            : "잘못된 설계사 선택입니다.",
        ],
      },
    };
  }

  redirect(`/plan-request/${requestId}/confirm`);
}

/**
 * Step2 의 트랜잭션 부분 — 후보 유효성 확인 + selected 토글 + status 전환.
 *
 * submitStep2 (URL 기반 선택 흐름) 와 autoSelectAndAdvance (챗봇 변형 v4 의
 * 백그라운드 자동 배정) 두 진입점이 공유. selectLimit 가드는 호출자 책임 —
 * submitStep2 는 zod + selectLimit 직접 검증, autoSelectAndAdvance 는
 * pickAssignedPartners 가 slice(0, selectLimit) 로 보장.
 */
async function persistStep2Selection(
  requestId: string,
  partnerIds: string[],
): Promise<
  | { ok: true }
  | { ok: false; reason: "not_selecting" | "invalid_candidates" }
> {
  const req = await prisma.planRequest.findUnique({
    where: { id: requestId },
    include: { candidates: { select: { partnerId: true } } },
  });
  if (!req || req.status !== "selecting") {
    return { ok: false, reason: "not_selecting" };
  }
  const candidateIds = new Set(req.candidates.map((c) => c.partnerId));
  if (!partnerIds.every((id) => candidateIds.has(id))) {
    return { ok: false, reason: "invalid_candidates" };
  }

  // selected 갱신 + status 전환 — 트랜잭션.
  // 1) 전체 후보 selected=false 초기화 (이전 선택 흔적 제거)
  // 2) 선택된 ID 만 selected=true
  // 3) plan_request.status = 'confirming'
  await prisma.$transaction([
    prisma.planRequestAssignmentCandidate.updateMany({
      where: { requestId },
      data: { selected: false },
    }),
    prisma.planRequestAssignmentCandidate.updateMany({
      where: { requestId, partnerId: { in: partnerIds } },
      data: { selected: true },
    }),
    prisma.planRequest.update({
      where: { id: requestId },
      data: { status: "confirming" },
    }),
  ]);

  return { ok: true };
}

/* ============================================================
 * Step 2 자동 배정 — 챗봇 변형 v4 전용
 * ============================================================
 *
 * 사용자에게 후보 선택 단계 자체를 노출하지 않는 챗봇 흐름의 백그라운드 진입점.
 * candidates URL ([src/app/(marketing)/plan-request/[id]/candidates/page.tsx]) 가
 * 하는 일과 동일한 결정성을 가지지만 redirect 없이 ok 만 반환 — 챗봇은 동일
 * 화면에 머물러야 하므로 navigation 발생 X.
 *
 * 정책: 후보 풀에서 selectLimit 명을 requestId 기준 FNV-1a 해시로 결정적 추출
 * (`pickAssignedPartners`). 같은 requestId 면 호출 반복해도 같은 조합 — candidates
 * URL 의 자동 skip 로직과 정확히 같은 partner 셋이 선택된다.
 *
 * 호출 컨텍스트: client (챗봇) 에서 startTransition + server action — 사용자
 * 매칭 로딩 화면이 노출되는 동안 한 번 호출.
 * ============================================================ */

export type AutoSelectResult =
  | { ok: true; selectedCount: number }
  | {
      ok: false;
      reason: "not_found" | "not_selecting" | "no_candidates";
    };

export async function autoSelectAndAdvance(
  requestId: string,
): Promise<AutoSelectResult> {
  const req = await getRequestById(requestId);
  if (!req) return { ok: false, reason: "not_found" };
  if (req.status !== "selecting") return { ok: false, reason: "not_selecting" };

  const candidates = await getPartnerCardsByIds(req.candidatePartnerIds);
  if (candidates.length === 0) return { ok: false, reason: "no_candidates" };

  const { selectLimit } = await getSettings();
  const picked = pickAssignedPartners(candidates, selectLimit, requestId);

  const persist = await persistStep2Selection(
    requestId,
    picked.map((p) => p.id),
  );
  if (!persist.ok) {
    // not_selecting: race — 다른 진입점이 먼저 confirming 으로 전이. 챗봇 입장에선
    //   다음 단계로 그대로 진행해도 됨 (요청 자체는 살아있으므로) 이지만 명시적으로
    //   알려 호출자가 처리.
    // invalid_candidates: pickAssignedPartners 가 req.candidatePartnerIds 에서 직접
    //   추출했고 그 사이 candidates row 가 삭제되지 않았다면 발생 불가. 정합성
    //   문제이므로 not_selecting 으로 폴백 (UI 는 "잠시 후 다시 시도해주세요").
    return { ok: false, reason: "not_selecting" };
  }

  return { ok: true, selectedCount: picked.length };
}

/* ============================================================
 * 동의 단계 — OTP 발송 + 최종 확정
 * ============================================================ */

/** 인증번호 TTL = 재전송 쿨다운. 키가 살아있는 동안 재발송 차단. */
const OTP_TTL_SECONDS = 180;
/** IP 발송 시도 카운터 윈도우. fixed window (sliding 아님). */
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function otpKey(requestId: string, phone: string): string {
  return `otp:code:${requestId}:${phone}`;
}

function rateLimitKey(ip: string): string {
  return `otp:rl:${ip}`;
}

/**
 * 인증번호 전송 — 6자리 코드 생성 → Redis 에 EX=180 으로 저장 → 알리고 SMS 발송.
 *
 * 차단 로직 (우선순위 순):
 *   1. 휴대폰 번호 zod 검증
 *   2. 같은 번호로 진행 중인 다른 요청 차단 (DB)
 *   3. IP 기반 레이트리밋 — 60분 윈도우 5회 초과 차단 (Redis INCR+EXPIRE NX)
 *   4. 재전송 쿨다운 — 기존 코드 키 TTL 살아있으면 차단 (`PTTL > 0`)
 *
 * 코드는 호출자(`finalizeRequest`) 가 GET / DEL 로 확인.
 * test mode 일 때는 코드 "000000" 고정 + 알리고 호출 생략 (dev 편의).
 */
export async function sendOtp(
  requestId: string,
  _prev: SendOtpState,
  formData: FormData,
): Promise<SendOtpState> {
  const parsed = SendOtpSchema.safeParse({
    phone: formData.get("phone"),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  if (await hasActiveRequestForPhone(parsed.data.phone, requestId)) {
    return {
      ok: false,
      errors: {
        _form: [
          "같은 번호로 진행 중인 요청이 있습니다. 완료 후 다시 시도해주세요.",
        ],
      },
    };
  }

  const redis = getRedis();
  const ip = await getClientIp();

  // 1) IP 레이트리밋. EXPIRE 의 NX 플래그로 첫 INCR 시에만 TTL 설정 → fixed 60분 윈도우.
  //    `OTP_RATE_LIMIT_DISABLED=Y` 일 땐 카운터 자체를 건드리지 않음 — load test /
  //    스테이징 디버깅 편의. prod 미설정 시 default 동작 (rate limit on).
  if (process.env.OTP_RATE_LIMIT_DISABLED !== "Y") {
    const rlKey = rateLimitKey(ip);
    const count = await redis.incr(rlKey);
    if (count === 1) {
      await redis.expire(rlKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (count > RATE_LIMIT_MAX_ATTEMPTS) {
      return {
        ok: false,
        errors: {
          _form: ["발송 시도가 너무 많습니다. 1시간 후 다시 시도해주세요."],
        },
      };
    }
  }

  // 2) 재전송 쿨다운 — 기존 코드 TTL 살아있으면 그 잔여 초 반환.
  const key = otpKey(requestId, parsed.data.phone);
  const pttl = await redis.pttl(key);
  if (pttl > 0) {
    const retryAfter = Math.ceil(pttl / 1000);
    return {
      ok: false,
      errors: { _form: [`${retryAfter}초 후 재전송 가능합니다.`] },
      retryAfterSeconds: retryAfter,
    };
  }

  // 3) 코드 생성 + 알리고 발송 (test mode 면 코드 고정 + 알리고 호출 생략).
  const testMode = isAligoTestMode();
  const code = testMode
    ? "000000"
    : randomInt(0, 1_000_000).toString().padStart(6, "0");

  if (!testMode) {
    try {
      await sendOtpSms(parsed.data.phone, code);
    } catch (err) {
      console.error("[sendOtp] aligo send failed", err);
      return {
        ok: false,
        errors: {
          _form: ["인증번호 전송에 실패했어요. 잠시 후 다시 시도해주세요."],
        },
      };
    }
  }

  // 4) Redis 에 저장 — TTL=쿨다운=만료 모두 동일 의미.
  await redis.set(key, code, { ex: OTP_TTL_SECONDS });
  return { ok: true, retryAfterSeconds: OTP_TTL_SECONDS };
}

/**
 * 동의 단계 최종 제출 — 동의 + 휴대폰 번호 + OTP 코드 한꺼번에 검증/저장.
 *
 * 검증 통과 시 status='dispatched' 로 전환, 결과 토큰 발급, 선택된 설계사
 * 각각에 plan_request_assignment 생성 (한 트랜잭션). 코드는 Redis 의 `otp:code:{id}:{phone}`
 * 키에서 GET 으로 비교, 성공 시 DEL 로 즉시 무효화 (재사용 차단).
 *
 * 알림 발송 (트랜잭션 직후):
 *   - 설계사 (2-3) 구현됨 — 선택된 각 설계사에게 일회용 token 링크 알림톡 (UI_0735).
 *   - 가입자 (1-1) TODO — 디스패치 확인 알림. 발송 매체/본문 정책 미정.
 */
export async function finalizeRequest(
  requestId: string,
  _prev: FinalizeState,
  formData: FormData,
): Promise<FinalizeState> {
  // 1) 이름 + 주민번호 + 전화번호 + 동의 검증
  const parsed = Step3Schema.safeParse({
    name: formData.get("name"),
    rrnFront: formData.get("rrnFront"),
    rrnBack1: formData.get("rrnBack1"),
    phone: formData.get("phone"),
    consentThirdParty: formData.get("consentThirdParty"),
    consentMessaging: formData.get("consentMessaging"),
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // 2) OTP 코드 검증 — Redis 의 저장된 코드와 비교.
  const codeParsed = OtpSchema.safeParse({ code: formData.get("code") });
  if (!codeParsed.success) {
    return { ok: false, errors: codeParsed.error.flatten().fieldErrors };
  }
  const redis = getRedis();
  const key = otpKey(requestId, parsed.data.phone);
  const stored = await redis.get(key);
  if (stored === null) {
    return {
      ok: false,
      errors: { code: ["인증번호가 만료되었습니다. 재전송해주세요."] },
    };
  }
  if (stored !== codeParsed.data.code) {
    return { ok: false, errors: { code: ["인증번호가 올바르지 않습니다."] } };
  }
  // 코드 일치 — 즉시 무효화. dispatched 트랜잭션 실패해도 같은 코드 재사용은 막음.
  await redis.del(key);

  // 3) 요청 상태 + 선택된 후보 확인. 요청서 본문 (budget/coverage) 과 partner
  //    이름/휴대폰까지 join — 트랜잭션 직후 설계사 알림톡 (UI_0735) 본문에 재사용
  //    (DB 재조회 회피).
  const req = await prisma.planRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      monthlyBudgetMin: true,
      monthlyBudgetMax: true,
      coverage: true,
      candidates: {
        where: { selected: true },
        select: {
          partnerId: true,
          partner: {
            select: {
              user: { select: { name: true, phone: true } },
            },
          },
        },
      },
    },
  });
  if (!req || req.status !== "confirming") {
    return { ok: false, errors: { _form: ["요청 상태가 올바르지 않습니다."] } };
  }
  if (req.candidates.length === 0) {
    return { ok: false, errors: { _form: ["선택된 설계사가 없습니다."] } };
  }

  // 3-a) 주민번호 → birthDate + gender derive. zod refine 이 valid 를 보장하지만
  //      narrow 위해 재호출. gender 는 Step1 에서 받지 않으므로 cross-check 없이
  //      여기서 transaction 의 update 단계에 set 한다.
  const rrn = deriveRrn(parsed.data.rrnFront, parsed.data.rrnBack1);
  if (!rrn) {
    return {
      ok: false,
      errors: { rrnFront: ["올바른 생년월일이 아닙니다."] },
    };
  }

  // 4) 다시 한번 phone 중복 체크 (sendOtp 이후 다른 요청이 들어왔을 수 있음).
  //    Race-condition 최종 방어선은 DB 의 partial unique index.
  if (await hasActiveRequestForPhone(parsed.data.phone, requestId)) {
    return {
      ok: false,
      errors: { _form: ["같은 번호로 진행 중인 요청이 있습니다."] },
    };
  }

  // 5) 저장 + dispatched 전환 + plan_request_assignment 생성 — 한 트랜잭션.
  //    한 쪽만 성공하면 정합 깨짐 (요청만 dispatched 인데 설계사한테 슬롯 없음 등).
  const settings = await getSettings();
  const now = new Date();
  const deadline = new Date(
    now.getTime() + settings.submissionDeadlineHours * 3600 * 1000,
  );

  // assignment row 를 트랜잭션 진입 전에 build — 트랜잭션 후 알림톡 발송에서
  // 동일 token 을 재사용 (DB 재조회 없이 partner 별 제출 URL 생성).
  const assignmentsToCreate = req.candidates.map((c) => ({
    id: newId(),
    requestId,
    partnerId: c.partnerId,
    token: newToken(),
    status: "pending" as const,
    createdAt: now,
    partnerName: c.partner.user.name,
    partnerPhone: c.partner.user.phone,
  }));

  await prisma.$transaction([
    prisma.planRequest.update({
      where: { id: requestId },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        birthDate: rrn.birthDate,
        gender: rrn.gender,
        // consentThirdParty 는 UI 에서 숨겨져 폼이 "off" 만 전송 → false 저장.
        // consentMessaging 은 Step3 검증에서 literal "on" 으로 여전히 강제됨.
        consentThirdParty: parsed.data.consentThirdParty === "on",
        consentMessaging: true,
        status: "dispatched",
        dispatchedAt: now,
        deadlineAt: deadline,
        resultToken: newToken(),
      },
    }),
    prisma.planRequestAssignment.createMany({
      data: assignmentsToCreate.map(
        ({ partnerName, partnerPhone, ...row }) => {
          void partnerName; // DB 컬럼 아님 — 알림 발송용으로만 보관.
          void partnerPhone;
          return row;
        },
      ),
    }),
    // 가입자가 선택해 제안서 요청까지 완료한 partner 들의 selectedCount +1.
    // 정의: plan_request_assignment INSERT = "제안서 요청" (결과 페이지의 문자요청과는 별개).
    // exposureCount 와 동일한 silent-skip 시맨틱 — stats row 누락된 레거시 partner 는
    // 시더 catch-all 이 보정.
    prisma.partnerAssignmentStats.updateMany({
      where: { partnerId: { in: req.candidates.map((c) => c.partnerId) } },
      data: { selectedCount: { increment: 1 } },
    }),
  ]);

  // 설계사 알림톡 발송 (2-3) — 각 선택된 설계사 휴대폰으로 알림톡 (UI_0735).
  // Promise.allSettled 로 한 설계사 실패가 다른 설계사 발송을 막지 않게. await 으로
  // redirect 전에 완료 보장 (Vercel serverless 의 fire-and-forget 회피).
  await notifyPartnersOfNewAssignment({
    customerName: parsed.data.name,
    monthlyBudgetMin: req.monthlyBudgetMin,
    monthlyBudgetMax: req.monthlyBudgetMax,
    coverage: req.coverage,
    assignments: assignmentsToCreate,
  });

  // 어드민 대시보드 알림 — 새 요청서 송부 완료. emit 은 throw 하지 않으므로
  // (실패해도 송부 트랜잭션 성공을 뒤집지 않음 — features/notifications/emit.ts)
  // 그냥 await 한다.
  await emitAdminNotification({
    type: "plan_request.dispatched",
    title: "새 요청서가 접수됐어요",
    body: `${parsed.data.name} 님의 보험 상담 요청이 설계사에게 송부됐어요.`,
    linkPath: `/admin/requests/${requestId}`,
    entityId: requestId,
  });

  // TODO: 알림 발송 (1-1) — 가입자에게 디스패치 확인 알림. dispatched 페이지가 "최대
  // N시간 안에 결과가 옴" 이라는 expectation 을 약속하고 있으므로 (`request/[id]/
  // dispatched/page.tsx`, `confirm-wizard.tsx`) 발송 시점은 여기 (트랜잭션 직후).
  // 본문엔 결과 페이지 링크 (resultToken) + 예상 도착 시간. 신규 알림톡 템플릿 검수 필요.

  revalidatePath("/admin/requests");
  redirect(`/plan-request/${requestId}/dispatched`);
}

/**
 * 신규 제안서 요청 배정 — 선택된 설계사들에게 일회용 token 링크 알림톡 (UI_0735).
 *
 * 본문엔 가입자 이름 / 희망 보험료 / 필요 담보, 버튼은 제출 페이지 URL. 설계사가
 * 본문만으로 요청서 개요를 파악하고 버튼 진입해 제안서 작성 시작.
 *
 * partnerPhone 이 누락된 row 는 skip + 경고 로그 (Partner.user.phone 은 invitation
 * 단계부터 검증돼 사실상 항상 채워져 있음 — defensive only). coverage parse 실패도
 * 동일 — schema 통과한 본체 컬럼이라 사실상 안전. 발송 실패는 catch 후 log 만 —
 * finalize 트랜잭션은 이미 commit 됐고, dispatched 페이지가 가입자에게 노출되므로
 * 사용자 흐름엔 영향 없음.
 */
async function notifyPartnersOfNewAssignment(args: {
  customerName: string;
  monthlyBudgetMin: number;
  monthlyBudgetMax: number;
  coverage: unknown;
  assignments: ReadonlyArray<{
    id: string;
    partnerId: string;
    token: string;
    partnerName: string | null;
    partnerPhone: string | null;
  }>;
}): Promise<void> {
  const budget = formatBudgetRange(args.monthlyBudgetMin, args.monthlyBudgetMax);
  const coverageParsed = CoverageRequestSchema.safeParse(args.coverage);
  const requestText = coverageParsed.success
    ? coverageRequestToText(coverageParsed.data)
    : "협의 필요";

  await Promise.allSettled(
    args.assignments.map(async (a) => {
      if (!a.partnerPhone) {
        console.warn(
          "[finalizeRequest] partner notification skipped — missing phone",
          { assignmentId: a.id, partnerId: a.partnerId },
        );
        return;
      }
      const partnerName = a.partnerName ?? "파트너";
      const { templateCode, variables } = buildNewAssignmentAlimtalk({
        partnerName,
        customerName: args.customerName,
        budget,
        requestText,
        token: a.token,
      });
      try {
        await sendAlimtalk(a.partnerPhone, templateCode, variables);
      } catch (err) {
        console.error(
          "[finalizeRequest] partner notification alimtalk failed",
          {
            assignmentId: a.id,
            partnerId: a.partnerId,
            error: err instanceof Error ? err.message : err,
          },
        );
      }
    }),
  );
}

/**
 * 보험료 범위 → "월 X만~Y만" / "월 X원~Y원" 한글 표기.
 * UI 의 formatBudget (candidates/page.tsx) 와 동일 규칙 — 만원 단위 절삭 표시.
 */
function formatBudgetRange(min: number, max: number): string {
  const fmt = (n: number) =>
    n >= 10000 ? `${Math.floor(n / 10000)}만` : `${n.toLocaleString("ko-KR")}원`;
  return `월 ${fmt(min)}~${fmt(max)}`;
}

/* ============================================================
 * 가입자 결과 알림톡 수동 발송 (어드민 전용)
 * ============================================================
 *
 * 분석 완료 시 자동 발송 (closePlanRequest) 이 현재 비활성화돼 있어, 어드민이 요청
 * 상세 페이지 (/admin/requests/[id]) 에서 직접 트리거. 결과 알림톡 (UI_0741) 은
 * `completed` 상태의 요청에만 의미가 있으므로 그 외 상태는 거부. 발송 이력은 추적하지
 * 않음 — 중복 발송 방지는 UI 의 확인 단계가 담당.
 * ============================================================ */

export type SendResultNotificationResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "not_completed" | "missing_contact" | "send_failed";
    };

export async function sendRequestResultNotification(
  planRequestId: string,
): Promise<SendResultNotificationResult> {
  await requireAdminSession();

  const request = await prisma.planRequest.findUnique({
    where: { id: planRequestId },
    select: { status: true },
  });
  if (!request) return { ok: false, error: "not_found" };
  if (request.status !== "completed") {
    return { ok: false, error: "not_completed" };
  }

  const outcome = await sendAnalysisCompletedNotification(planRequestId);
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.reason };
}

/* ============================================================
 * 어드민 — 제출 마감 연장
 * ============================================================
 *
 * `dispatched` / `analyzing` 상태이고 `deadlineAt > now` 인 plan_request 의
 * deadlineAt 을 N시간 늘림. **마감이 이미 지난 요청은 연장 불가** — cron 의
 * closePlanRequest 가 곧 expired/completed/rematching 으로 전이할 transient
 * 상태이므로 "연장" 의 의미가 모호. 명시적으로 `already_past` 반환.
 *
 * 새 마감 = 현재 마감 + extendBy
 *   - 현재 마감이 미래임이 가드로 보장되므로 admin 의 약속 시각 위에 그대로 연장.
 *
 * 동시성 — `updateMany WHERE status IN (dispatched, analyzing) AND deadlineAt > now`
 * 로 race-safe. cron 이 closePlanRequest 로 status 를 먼저 전이했거나 (rare)
 * 사전 SELECT 와 UPDATE 사이에 deadline 이 지났다면 0 row → `conflict` 반환.
 *
 * 자동 반영 (별도 처리 X) — 아래 호출처가 모두 렌더 시점 deadlineAt 을 다시 읽음:
 *   - cron `/api/cron/assignment-deadline-expiry` — 새 deadlineAt 기준 재평가
 *   - `closePlanRequest` 의 deadlinePassed — false 가 되어 마감 스킵
 *   - `/plan-request/[id]/dispatched` — "최대 N시간" 카피 자동 갱신
 *   - `/partner/plan-request-assignments/[token]` — 폼 차단 / 카운트다운 자동 갱신
 *
 * 수동 안내 (이 액션 부수 효과):
 *   - pending 설계사에게 LMS 1회 — 연장 사실을 통보. 알림톡 신규 템플릿 검수
 *     회피 + 본문 자유도 필요해 LMS 선택. `notifyPartnersOfDeadlineExtension`
 *     가 단일 chokepoint.
 *
 * 비대상:
 *   - 가입자 안내 — dispatched 페이지가 자동 갱신되고, 결과 알림톡은 분석 완료 시
 *     발송이라 시점이 다름. 별도 안내 채널 없음.
 *   - 어드민 알림 (벨) — 본인이 트리거한 액션이라 자기 자신에게 알림 X.
 * ============================================================ */

export async function extendRequestDeadline(
  planRequestId: string,
  extendByHours: number,
): Promise<ExtendDeadlineResult> {
  await requireAdminSession();

  const parsed = ExtendDeadlineSchema.safeParse({ extendByHours });
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_hours",
      message:
        parsed.error.flatten().fieldErrors.extendByHours?.[0] ??
        "올바른 시간이 아니에요.",
    };
  }

  // 현재 상태 + 기존 deadlineAt + 가입자 이름 (LMS 본문) 한 번에.
  const current = await prisma.planRequest.findUnique({
    where: { id: planRequestId },
    select: {
      status: true,
      deadlineAt: true,
      name: true,
    },
  });
  if (!current) return { ok: false, error: "not_found" };
  if (current.status !== "dispatched" && current.status !== "analyzing") {
    return { ok: false, error: "invalid_status" };
  }
  // finalize 가 항상 set 하므로 dispatched/analyzing 에 도달했다면 NULL 일 수 없음
  // — defensive. 마감이 없는데 "연장" 은 의미가 모호하므로 invalid 처리.
  if (!current.deadlineAt) {
    return { ok: false, error: "invalid_status" };
  }

  const now = new Date();
  // 마감 도과 가드 — cron tick (5분) 사이의 transient 케이스. 연장 후의 의미
  // (가입자 기대 시간 / 설계사 통보) 가 모호해지므로 명시적으로 거부.
  if (current.deadlineAt.getTime() <= now.getTime()) {
    return { ok: false, error: "already_past" };
  }

  const newDeadline = new Date(
    current.deadlineAt.getTime() + parsed.data.extendByHours * 3_600_000,
  );

  // race-safe — status 전이 + deadline 도과를 한 번에 가드.
  //   - cron 이 closePlanRequest 로 status 를 먼저 전이했다면 status 조건 미스 매치
  //   - SELECT 와 UPDATE 사이 deadline 이 지났다면 deadlineAt 조건 미스 매치
  // 둘 다 count===0 → `conflict` (UI 가 새로고침 안내).
  const updated = await prisma.planRequest.updateMany({
    where: {
      id: planRequestId,
      status: { in: ["dispatched", "analyzing"] },
      deadlineAt: { gt: now },
    },
    data: { deadlineAt: newDeadline },
  });
  if (updated.count === 0) {
    return { ok: false, error: "conflict" };
  }

  // 부수 효과 — pending 설계사 LMS 안내. 실패는 함수 안에서 swallow.
  await notifyPartnersOfDeadlineExtension(
    planRequestId,
    current.name ?? "고객",
    newDeadline,
  );

  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${planRequestId}`);

  return { ok: true, newDeadlineAt: newDeadline.toISOString() };
}

/* ============================================================
 * 결과 페이지 열람 마킹
 * ============================================================
 *
 * 가입자가 결과 페이지를 처음 연 시각을 plan_request.resultViewedAt 에 기록.
 * 인증은 resultToken — 결과 페이지 자체가 토큰 기반이라 액션도 동일 (세션 없음).
 * 결과 페이지의 client 컴포넌트 (ResultViewedMarker) 가 마운트 시 1회 호출.
 *
 * 마킹을 Server Component 렌더가 아닌 client useEffect 에서 발화하는 이유: 카카오
 * 링크 프리뷰 크롤러·봇은 JS 를 실행하지 않으므로 실제 가입자 열람만 기록 (false
 * positive 차단).
 *
 * 멱등: WHERE resultViewedAt IS NULL — 새로고침 / 재진입은 0 row no-op 이라 최초
 * 열람 시각만 보존. 잘못된·만료된 토큰은 매칭 0 row 라 조용히 무시 (에러 없음).
 * ============================================================ */
export async function markResultViewed(resultToken: string): Promise<void> {
  if (!resultToken) return;
  await prisma.planRequest.updateMany({
    where: { resultToken, resultViewedAt: null },
    data: { resultViewedAt: new Date() },
  });
}
