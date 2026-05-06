"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { findMatchCandidates } from "@/features/agents/queries";
import { MOCK_MATCH_REQUESTS } from "@/mocks/requests";
import { getSettings } from "@/server/settings";

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
import { hasActiveRequestForPhone } from "./queries";

/* ============================================================
 * Step 1 — 요청서 작성 (전화번호 제외 모든 정보)
 * ============================================================
 *
 * 주의: "최종 생성"은 OTP 검증 시점이지만, 후보 노출 → 선택 단계는
 * URL 기반 (/request/[id]/candidates) 으로 흘러야 새로고침/뒤로가기가
 * 자연스러움. 그래서 MVP 에서는 이 시점에 "selecting" 레코드를 만들고,
 * 진짜 송부는 finalizeRequest 에서 수행. 클라이언트는 redirect 가
 * 아닌 결과(requestId)를 받아 로딩 UX 후 직접 navigate.
 */

export async function submitStep1(
  _prev: Step1State,
  formData: FormData,
): Promise<Step1State> {
  // 병력 리스트는 클라가 JSON 직렬화하여 단일 hidden input 으로 전송.
  const medicalHistoryRaw = formData.get("medicalHistory");
  const medicalHistory = parseMedicalHistory(medicalHistoryRaw);
  if (medicalHistory === "INVALID") {
    return {
      ok: false,
      errors: { medicalHistory: ["병력 데이터가 올바르지 않습니다."] },
    };
  }

  const parsed = Step1Schema.safeParse({
    gender: formData.get("gender"),
    region: formData.get("region"),
    birthDate: formData.get("birthDate"),
    occupation: formData.get("occupation"),
    monthlyBudgetMin: formData.get("monthlyBudgetMin"),
    monthlyBudgetMax: formData.get("monthlyBudgetMax"),
    desiredCoverage: formData.get("desiredCoverage"),
    medicalHistory,
    additionalNotes: formData.get("additionalNotes") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const settings = getSettings();
  const candidates = await findMatchCandidates(settings.candidateCount);

  const id = `req-${Date.now()}`;
  MOCK_MATCH_REQUESTS.push({
    id,
    step1: parsed.data,
    candidateAgentIds: candidates.map((c) => c.id),
    selectedAgentIds: [],
    status: "selecting",
    createdAt: new Date().toISOString(),
    rematchCount: 0,
  });

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

/* ============================================================
 * Step 2 — 후보 선택
 * ============================================================ */

export async function submitStep2(
  requestId: string,
  _prev: Step2State,
  formData: FormData,
): Promise<Step2State> {
  const parsed = Step2Schema.safeParse({
    agentIds: formData.getAll("agentIds"),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const settings = getSettings();
  if (parsed.data.agentIds.length > settings.selectLimit) {
    return {
      ok: false,
      errors: {
        agentIds: [`최대 ${settings.selectLimit}명까지 선택 가능합니다.`],
      },
    };
  }

  const req = MOCK_MATCH_REQUESTS.find((r) => r.id === requestId);
  if (!req || req.status !== "selecting") {
    return { ok: false, errors: { _form: ["요청을 찾을 수 없습니다."] } };
  }

  // 선택된 ID가 후보 안에 있는지 검증
  const valid = parsed.data.agentIds.every((id) =>
    req.candidateAgentIds.includes(id),
  );
  if (!valid) {
    return { ok: false, errors: { _form: ["잘못된 설계사 선택입니다."] } };
  }

  req.selectedAgentIds = parsed.data.agentIds;
  req.status = "confirming";

  redirect(`/request/${requestId}/confirm`);
}

/* ============================================================
 * 동의 단계 — OTP 발송 + 최종 확정
 * ============================================================ */

const DEMO_OTP = "000000";

/**
 * 인증번호 전송 — MVP 에서는 실제 SMS 발송 없이 휴대폰 번호 형식만 검증.
 * 같은 번호로 진행 중인 다른 요청이 있으면 차단 (현재 요청은 제외).
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
 * 검증 통과 시 status="dispatched" 로 전환, 결과 토큰 발급, 알림톡/Assignment
 * 생성 (TODO). MVP DEMO_OTP="000000" 로 모든 검증 통과.
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

  // 3) 요청 상태 확인
  const req = MOCK_MATCH_REQUESTS.find((r) => r.id === requestId);
  if (!req || req.status !== "confirming") {
    return { ok: false, errors: { _form: ["요청 상태가 올바르지 않습니다."] } };
  }

  // 4) 다시 한번 phone 중복 체크 (sendOtp 이후 다른 요청이 들어왔을 수 있음)
  if (await hasActiveRequestForPhone(parsed.data.phone, requestId)) {
    return {
      ok: false,
      errors: {
        _form: ["같은 번호로 진행 중인 요청이 있습니다."],
      },
    };
  }

  // 5) 저장 + 디스패치 전환
  const settings = getSettings();
  const now = new Date();
  const deadline = new Date(
    now.getTime() + settings.submissionDeadlineHours * 3600 * 1000,
  );

  req.step3 = parsed.data;
  req.status = "dispatched";
  req.dispatchedAt = now.toISOString();
  req.deadlineAt = deadline.toISOString();
  req.resultToken = randomToken();

  // TODO: 선택된 설계사들에게 알림톡 발송 + Assignment 생성

  revalidatePath("/admin/requests");
  redirect(`/request/${requestId}/dispatched`);
}

function randomToken(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
