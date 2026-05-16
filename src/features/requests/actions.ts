"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { findMatchCandidates } from "@/features/partners/queries";
import { newId, newToken } from "@/lib/id";
import { prisma } from "@/server/db/prisma";
import { getSettings } from "@/server/settings";

import { hasActiveRequestForPhone } from "./queries";
import {
  OtpSchema,
  SendOtpSchema,
  Step1Schema,
  Step2Schema,
  Step3Schema,
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
 * URL 기반 (/request/[id]/candidates) 으로 흘러야 새로고침/뒤로가기가 자연스러움.
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
    gender: formData.get("gender"),
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

  // 매칭 후보 추출 (DB)
  const settings = await getSettings();
  const candidates = await findMatchCandidates(settings.candidateCount);

  // 부모 (plan_request) → 자식 (medical_history, candidates) 순서로 트랜잭션.
  // FK 무결성 보장 + 일부만 들어가는 부분 실패 방지.
  const id = newId();
  await prisma.$transaction([
    prisma.planRequest.create({
      data: {
        id,
        gender: parsed.data.gender,
        occupation: parsed.data.occupation,
        monthlyBudgetMin: parsed.data.monthlyBudgetMin,
        monthlyBudgetMax: parsed.data.monthlyBudgetMax,
        coverage: parsed.data.coverage,
        additionalNotes: parsed.data.additionalNotes ?? null,
        status: "selecting",
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
    prisma.planRequestCandidate.createMany({
      data: candidates.map((c, i) => ({
        requestId: id,
        partnerId: c.id,
        candidateRank: i,
        selected: false,
      })),
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
    prisma.planRequestCandidate.updateMany({
      where: { requestId },
      data: { selected: false },
    }),
    prisma.planRequestCandidate.updateMany({
      where: { requestId, partnerId: { in: parsed.data.partnerIds } },
      data: { selected: true },
    }),
    prisma.planRequest.update({
      where: { id: requestId },
      data: { status: "confirming" },
    }),
  ]);

  redirect(`/request/${requestId}/confirm`);
}

/* ============================================================
 * 동의 단계 — OTP 발송 + 최종 확정
 * ============================================================ */

const DEMO_OTP = "000000";

/**
 * 인증번호 전송 — MVP 에서는 실제 SMS 발송 없이 휴대폰 번호 형식만 검증.
 * 같은 번호로 진행 중인 다른 요청이 있으면 차단 (현재 요청은 제외).
 *
 * Supabase Auth phone provider 전환은 별도 step.
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

  // TODO: 실제 SMS 게이트웨이 호출 + 5분 TTL 코드 저장
  return { ok: true };
}

/**
 * 동의 단계 최종 제출 — 동의 + 휴대폰 번호 + OTP 코드 한꺼번에 검증/저장.
 *
 * 검증 통과 시 status='dispatched' 로 전환, 결과 토큰 발급, 선택된 설계사
 * 각각에 match_assignment 생성 (한 트랜잭션). MVP DEMO_OTP='000000'.
 *
 * TODO: 알림톡 발송 — 실 서비스 단계에서 외부 API 호출.
 */
export async function finalizeRequest(
  requestId: string,
  _prev: FinalizeState,
  formData: FormData,
): Promise<FinalizeState> {
  // 1) 이름 + 전화번호 + 동의 검증
  const parsed = Step3Schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    consentThirdParty: formData.get("consentThirdParty"),
    consentMessaging: formData.get("consentMessaging"),
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // 2) OTP 코드 검증
  const codeParsed = OtpSchema.safeParse({ code: formData.get("code") });
  if (!codeParsed.success) {
    return { ok: false, errors: codeParsed.error.flatten().fieldErrors };
  }
  if (codeParsed.data.code !== DEMO_OTP) {
    return { ok: false, errors: { code: ["인증번호가 올바르지 않습니다."] } };
  }

  // 3) 요청 상태 + 선택된 후보 확인
  const req = await prisma.planRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      candidates: {
        where: { selected: true },
        select: { partnerId: true },
      },
    },
  });
  if (!req || req.status !== "confirming") {
    return { ok: false, errors: { _form: ["요청 상태가 올바르지 않습니다."] } };
  }
  if (req.candidates.length === 0) {
    return { ok: false, errors: { _form: ["선택된 설계사가 없습니다."] } };
  }

  // 4) 다시 한번 phone 중복 체크 (sendOtp 이후 다른 요청이 들어왔을 수 있음).
  //    Race-condition 최종 방어선은 DB 의 partial unique index.
  if (await hasActiveRequestForPhone(parsed.data.phone, requestId)) {
    return {
      ok: false,
      errors: { _form: ["같은 번호로 진행 중인 요청이 있습니다."] },
    };
  }

  // 5) 저장 + dispatched 전환 + match_assignment 생성 — 한 트랜잭션.
  //    한 쪽만 성공하면 정합 깨짐 (요청만 dispatched 인데 설계사한테 슬롯 없음 등).
  const settings = await getSettings();
  const now = new Date();
  const deadline = new Date(
    now.getTime() + settings.submissionDeadlineHours * 3600 * 1000,
  );

  await prisma.$transaction([
    prisma.planRequest.update({
      where: { id: requestId },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        // Step3 검증 통과 시점에 두 consent 모두 literal "on" 으로 강제됨.
        consentThirdParty: true,
        consentMessaging: true,
        status: "dispatched",
        dispatchedAt: now,
        deadlineAt: deadline,
        resultToken: newToken(),
      },
    }),
    prisma.matchAssignment.createMany({
      data: req.candidates.map((c) => ({
        id: newId(),
        requestId,
        partnerId: c.partnerId,
        token: newToken(),
        status: "pending",
        createdAt: now,
      })),
    }),
  ]);

  // TODO: 알림톡 발송 — 실 서비스 단계에서 외부 API 호출.

  revalidatePath("/admin/requests");
  redirect(`/request/${requestId}/dispatched`);
}
