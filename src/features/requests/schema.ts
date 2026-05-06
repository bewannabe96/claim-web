import { z } from "zod";

import {
  KOREAN_REGIONS,
  type Gender,
  type KoreanRegion,
} from "@/types";

const REGION_TUPLE = KOREAN_REGIONS as unknown as [
  KoreanRegion,
  ...KoreanRegion[],
];

const PHONE = z
  .string()
  .regex(/^01[0-9]{8,9}$/, "올바른 휴대폰 번호 형식이 아닙니다.");

/* ============================================================
 * 병력 — 1건당 구조화된 입력. Step1 의 medicalHistory[] 원소.
 * ============================================================ */

export const TREATMENT_PERIODS = [
  "within_3m",
  "within_5m",
  "within_10y",
] as const;
export type TreatmentPeriod = (typeof TREATMENT_PERIODS)[number];

export const TREATMENT_PERIOD_LABEL: Record<TreatmentPeriod, string> = {
  within_3m: "3개월 이내",
  within_5m: "5개월 이내",
  within_10y: "10년 이내",
};

const TREATMENT_TUPLE = TREATMENT_PERIODS as unknown as [
  TreatmentPeriod,
  ...TreatmentPeriod[],
];

export const MedicalHistoryEntrySchema = z.object({
  diagnosis: z
    .string()
    .min(1, "진단명을 입력해주세요.")
    .max(100, "진단명은 100자 이내로 입력해주세요."),
  treatmentPeriod: z.enum(TREATMENT_TUPLE),
  treatmentStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 입력해주세요."),
  hospitalizationDays: z.coerce.number().int().min(0).max(3650),
  outpatientVisits: z.coerce.number().int().min(0).max(10000),
  hadSurgery: z.coerce.boolean(),
});

export type MedicalHistoryEntry = z.infer<typeof MedicalHistoryEntrySchema>;

/* ============================================================
 * Step 1 — 후보 매칭 + 진설계 정보 (전화번호 제외, 모든 식별/상세 정보 수집)
 * ============================================================ */

export const Step1Schema = z
  .object({
    gender: z.enum(["male", "female"] satisfies [Gender, Gender]),
    region: z.enum(REGION_TUPLE),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 입력해주세요."),
    occupation: z
      .string()
      .min(1, "직업을 입력해주세요.")
      .max(50, "직업은 50자 이내로 입력해주세요."),
    monthlyBudgetMin: z.coerce.number().int().min(0),
    monthlyBudgetMax: z.coerce.number().int().min(0),
    desiredCoverage: z
      .string()
      .min(1, "희망하시는 담보를 알려주세요.")
      .max(500, "희망 담보는 500자 이내로 입력해주세요."),
    /** 최대 20건 — 빈 배열 허용 (병력 없음) */
    medicalHistory: z.array(MedicalHistoryEntrySchema).max(20),
    additionalNotes: z
      .string()
      .max(1000, "추가 요청사항은 1000자 이내로 입력해주세요.")
      .optional(),
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
 * Step 3 — 본인 식별 (이름 + 전화번호) + OTP + 동의
 *
 * 가입자 식별 정보(이름·전화번호)와 동의는 본인 인증 시점에 함께 받음 —
 * 진설계 정보(생년월일/직업/병력 등)는 Step1 에서 이미 수집됨.
 * ============================================================ */

export const Step3Schema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해주세요.")
    .max(20, "이름은 20자 이내로 입력해주세요."),
  phone: PHONE,
  consentThirdParty: z.literal("on", { message: "정보 제공 동의가 필요합니다." }),
  consentMessaging: z.literal("on", { message: "통신 수신 동의가 필요합니다." }),
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

/** 최종 확정 — Step3 데이터 + OTP 코드 한꺼번에 받아 검증/저장/디스패치. */
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
  "confirming",   // 본인 인증 진행 중
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
