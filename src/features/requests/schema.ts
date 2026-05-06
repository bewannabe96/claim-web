import { z } from "zod";

import {
  AGE_RANGES,
  INSURANCE_CATEGORIES,
  KOREAN_REGIONS,
  type AgeRange,
  type Gender,
  type InsuranceCategory,
  type KoreanRegion,
} from "@/types";

const CATEGORY_TUPLE = INSURANCE_CATEGORIES as unknown as [
  InsuranceCategory,
  ...InsuranceCategory[],
];
const AGE_TUPLE = AGE_RANGES as unknown as [AgeRange, ...AgeRange[]];
const REGION_TUPLE = KOREAN_REGIONS as unknown as [
  KoreanRegion,
  ...KoreanRegion[],
];

const PHONE = z
  .string()
  .regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호 형식이 아닙니다.");

/* ============================================================
 * Step 1 — 매칭용 요청서
 * ============================================================ */

export const Step1Schema = z
  .object({
    categories: z
      .array(z.enum(CATEGORY_TUPLE))
      .min(1, "관심 보장 분야를 1개 이상 선택해주세요."),
    ageRange: z.enum(AGE_TUPLE),
    gender: z.enum(["male", "female"] satisfies [Gender, Gender]),
    region: z.enum(REGION_TUPLE),
    monthlyBudgetMin: z.coerce.number().int().min(0),
    monthlyBudgetMax: z.coerce.number().int().min(0),
  })
  .refine((v) => v.monthlyBudgetMax >= v.monthlyBudgetMin, {
    message: "최대 보험료는 최소 보험료보다 커야 합니다.",
    path: ["monthlyBudgetMax"],
  });

export type Step1Input = z.infer<typeof Step1Schema>;

export type Step1State =
  | { ok: true; requestId: string }
  | {
      ok?: false;
      errors?: Partial<Record<keyof Step1Input | "_form", string[]>>;
      message?: string;
    }
  | undefined;

/* ============================================================
 * Step 2 — 후보 선택 (K명까지 복수)
 * ============================================================ */

export const Step2Schema = z.object({
  agentIds: z
    .array(z.string().min(1))
    .min(1, "최소 1명의 설계사를 선택해주세요."),
});

export type Step2Input = z.infer<typeof Step2Schema>;

export type Step2State =
  | {
      ok?: false;
      errors?: Partial<Record<keyof Step2Input | "_form", string[]>>;
      message?: string;
    }
  | undefined;

/* ============================================================
 * Step 3 — 진설계용 정보 + 동의 + OTP
 * ============================================================ */

/**
 * Step3 — 동의 단계에서 한번에 수집되는 모든 정보:
 * 진설계 정보 + 동의 + 휴대폰 번호 + OTP 코드.
 *
 * 휴대폰 번호는 OTP 발송 시점에 받기 때문에 step1 에서 빠지고 여기로 이동.
 */
export const Step3Schema = z.object({
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 입력해주세요."),
  occupation: z.string().min(1, "직업을 입력해주세요.").max(50),
  smoker: z.coerce.boolean(),
  heightCm: z.coerce.number().int().min(100).max(230),
  weightKg: z.coerce.number().int().min(20).max(200),
  hasExistingInsurance: z.coerce.boolean(),
  existingInsuranceNote: z.string().max(500).optional(),
  medicalHistory: z.string().max(500).optional(),
  consentThirdParty: z
    .literal("on", { message: "정보 제공 동의가 필요합니다." }),
  consentMessaging: z
    .literal("on", { message: "통신 수신 동의가 필요합니다." }),
  phone: PHONE,
});

export type Step3Input = z.infer<typeof Step3Schema>;

export type Step3State =
  | {
      ok?: false;
      errors?: Partial<Record<keyof Step3Input | "_form", string[]>>;
      message?: string;
    }
  | undefined;

/* ============================================================
 * OTP — 발송 + 검증 (확정과 결합)
 * ============================================================ */

/** 인증번호 전송 요청 — 휴대폰 번호 형식만 검증 (실제 SMS 는 모킹). */
export const SendOtpSchema = z.object({
  phone: PHONE,
});

export type SendOtpState =
  | { ok: true }
  | { ok?: false; errors?: { phone?: string[]; _form?: string[] } }
  | undefined;

export const OtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "6자리 숫자 코드를 입력해주세요."),
});

export type OtpInput = z.infer<typeof OtpSchema>;

/**
 * 최종 확정 — Step3 데이터 + OTP 코드 한꺼번에 받아 검증/저장/디스패치.
 * Step3State 에 OTP 에러를 결합한 형태로 반환.
 */
export type FinalizeState =
  | {
      ok?: false;
      errors?: Partial<
        Record<keyof Step3Input | "code" | "_form", string[]>
      >;
    }
  | undefined;

/* ============================================================
 * MatchRequest 도메인 객체 (서버 저장 형태)
 * ============================================================ */

export const MATCH_REQUEST_STATUSES = [
  "draft",        // 1단계 완료, 후보 보는 중
  "selecting",    // 후보 선택 화면
  "confirming",   // 3단계 입력 + OTP 진행 중
  "dispatched",   // 설계사들에게 송부 완료
  "analyzing",    // AI 분석 중
  "completed",    // 결과 알림톡 발송 완료
  "rematching",   // 0명 제출 → 자동 재매칭
  "failed",       // 재매칭도 실패
] as const;

export type MatchRequestStatus = (typeof MATCH_REQUEST_STATUSES)[number];

/** 진행 중으로 간주되는 상태 — 같은 번호 신규 요청 차단 기준 */
export const ACTIVE_STATUSES: readonly MatchRequestStatus[] = [
  "draft",
  "selecting",
  "confirming",
  "dispatched",
  "analyzing",
  "rematching",
];

export type MatchRequest = {
  id: string;
  step1: Step1Input;
  step3?: Step3Input;
  candidateAgentIds: string[];   // N명 후보
  selectedAgentIds: string[];    // K명까지 선택
  status: MatchRequestStatus;
  createdAt: string;
  dispatchedAt?: string;
  deadlineAt?: string;
  rematchCount: number;
  resultToken?: string;          // 결과 열람용 일회용 토큰
};
