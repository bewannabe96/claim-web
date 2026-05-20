"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { findAssignmentCandidates } from "@/features/partners/queries";
import { getPriceForBudget } from "@/features/plan-request-pricing/queries";
import { newId, newToken } from "@/lib/id";
import {
  isAligoTestMode,
  sendNotificationLms,
  sendOtpSms,
} from "@/server/aligo";
import { getServiceName } from "@/server/branding";
import { prisma } from "@/server/db/prisma";
import { getClientIp } from "@/server/get-client-ip";
import { getPublicBaseUrl } from "@/server/origin";
import { getRedis } from "@/server/redis";
import { getSettings } from "@/server/settings";

import { hasActiveRequestForPhone } from "./queries";
import {
  CoverageRequestSchema,
  OtpSchema,
  SendOtpSchema,
  Step1Schema,
  Step2Schema,
  Step3Schema,
  coverageRequestToText,
  deriveRrn,
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

  const parsed = Step1Schema.safeParse({
    occupation: formData.get("occupation"),
    coverage,
    monthlyBudgetMin: formData.get("monthlyBudgetMin"),
    monthlyBudgetMax: formData.get("monthlyBudgetMax"),
    medicalHistory,
    additionalNotes: formData.get("additionalNotes") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // 요청서 가격 snapshot — admin 이 이후 tier 가격을 바꿔도 이 요청에는 영향 X.
  // step1-wizard 의 BUDGET_OPTIONS 가 항상 정확히 일치하는 (min, max) 만 보내므로
  // tier lookup 은 정상 흐름에선 항상 hit. drift 시 throw → 사용자에게 generic 에러.
  const price = await getPriceForBudget(
    parsed.data.monthlyBudgetMin,
    parsed.data.monthlyBudgetMax,
  );

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

  // 요청 상태 + 후보 유효성 확인
  const req = await prisma.planRequest.findUnique({
    where: { id: requestId },
    include: { candidates: { select: { partnerId: true } } },
  });
  if (!req || req.status !== "selecting") {
    return { ok: false, errors: { _form: ["요청을 찾을 수 없습니다."] } };
  }
  const candidateIds = new Set(req.candidates.map((c) => c.partnerId));
  const allValid = parsed.data.partnerIds.every((id) => candidateIds.has(id));
  if (!allValid) {
    return { ok: false, errors: { _form: ["잘못된 설계사 선택입니다."] } };
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
      where: { requestId, partnerId: { in: parsed.data.partnerIds } },
      data: { selected: true },
    }),
    prisma.planRequest.update({
      where: { id: requestId },
      data: { status: "confirming" },
    }),
  ]);

  redirect(`/plan-request/${requestId}/confirm`);
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
 *   - 설계사 (2-3) 구현됨 — 선택된 각 설계사에게 일회용 token 링크 LMS.
 *   - 가입자 (1-1) TODO — 디스패치 확인 LMS. 발송 매체/본문 정책 미정.
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
  //    이름/휴대폰까지 join — 트랜잭션 직후 설계사 알림 LMS 본문에 재사용
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

  // assignment row 를 트랜잭션 진입 전에 build — 트랜잭션 후 LMS 발송에서
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
        // Step3 검증 통과 시점에 두 consent 모두 literal "on" 으로 강제됨.
        consentThirdParty: true,
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

  // 설계사 알림 LMS 발송 (2-3) — 각 선택된 설계사 휴대폰으로 제출 페이지 링크.
  // Promise.allSettled 로 한 설계사 실패가 다른 설계사 발송을 막지 않게. await 으로
  // redirect 전에 완료 보장 (Vercel serverless 의 fire-and-forget 회피).
  await notifyPartnersOfNewAssignment({
    customerName: parsed.data.name,
    monthlyBudgetMin: req.monthlyBudgetMin,
    monthlyBudgetMax: req.monthlyBudgetMax,
    coverage: req.coverage,
    assignments: assignmentsToCreate,
  });

  // TODO: 알림 발송 (1-1) — 가입자에게 디스패치 확인 LMS. dispatched 페이지가 "최대
  // N시간 안에 결과가 옴" 이라는 expectation 을 약속하고 있으므로 (`request/[id]/
  // dispatched/page.tsx`, `confirm-wizard.tsx`) 발송 시점은 여기 (트랜잭션 직후).
  // 본문엔 결과 페이지 링크 (resultToken) + 예상 도착 시간. 발송 매체 미정.

  revalidatePath("/admin/requests");
  redirect(`/plan-request/${requestId}/dispatched`);
}

/**
 * 신규 제안서 요청 배정 — 선택된 설계사들에게 일회용 token 링크 LMS.
 *
 * 본문엔 가입자 이름 / 희망 보험료 / 필요 담보 + 제출 페이지 URL. 설계사가 본문
 * 만으로 요청서 개요를 파악하고 링크로 진입해 제안서 작성 시작.
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
  const origin = await getPublicBaseUrl();
  const serviceName = getServiceName();

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
      const url = `${origin}/partner/plan-request-assignments/${a.token}`;
      const partnerName = a.partnerName ?? "파트너";
      const msg = [
        `[${serviceName}] ${partnerName} 파트너님,`,
        `${args.customerName}님이 파트너님을 선택해서 요청서를 보내셨어요:)`,
        ``,
        `*희망보험료 : ${budget}`,
        `*필요 담보 : ${requestText}`,
        ``,
        `고객님의 요청을 수락하시면 진설계에 필요한 정보를 전달드려요.`,
        `지금 바로 요청서를 확인하시고 설계제안서를 보내보세요!`,
        ``,
        url,
        ``,
        `(해당 메시지는 파트너님께서 '요청서 도착 알림'을 설정하신 경우 발송됩니다.)`,
      ].join("\n");
      try {
        await sendNotificationLms(a.partnerPhone, msg);
      } catch (err) {
        console.error("[finalizeRequest] partner notification LMS failed", {
          assignmentId: a.id,
          partnerId: a.partnerId,
          error: err instanceof Error ? err.message : err,
        });
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
