import { z } from "zod";

import { type Gender } from "@/types";

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
 * Coverage — 가입자 의도 + (focused 시) 대비하고 싶은 질병/상황
 *
 * "보장을 어떻게 알아보고 있나" 를 정형화한 입력. 자유 텍스트 단일 필드 대신
 * 분기형 구조로 두어 매칭 / AI 비교 단계에서 활용 가능하게 함.
 *
 * - broad:   특정 보장에 매이지 않고 종합적으로 검토 중
 * - focused: 대비하고 싶은 구체적 질병/상황이 있음 (preset chips 다중 선택, 최소 1개)
 *
 * 자유 텍스트 보충은 Step1 의 `additionalNotes` 가 담당 — coverage 분기 내부에는 두지 않음.
 * ============================================================ */

export const COVERAGE_INTENTS = ["broad", "focused"] as const;
export type CoverageIntent = (typeof COVERAGE_INTENTS)[number];

export const FOCUSED_CONCERN_IDS = [
  "cancer",
  "cerebro",
  "cardio",
  "dental",
  "hospitalization",
  "death",
  "disability",
  "longterm",
  "surgery",
] as const;
export type FocusedConcernId = (typeof FOCUSED_CONCERN_IDS)[number];

export const FOCUSED_CONCERN_LABEL: Record<FocusedConcernId, string> = {
  cancer: "암",
  cerebro: "뇌혈관",
  cardio: "심혈관",
  dental: "치아",
  hospitalization: "입원비",
  death: "사망",
  disability: "장해",
  longterm: "간병",
  surgery: "수술",
};

const FOCUSED_CONCERN_TUPLE = FOCUSED_CONCERN_IDS as unknown as [
  FocusedConcernId,
  ...FocusedConcernId[],
];

export const CoverageRequestSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("broad") }),
  z.object({
    intent: z.literal("focused"),
    concerns: z
      .array(z.enum(FOCUSED_CONCERN_TUPLE))
      .min(1, "대비하고 싶은 질병이나 상황을 하나 이상 골라주세요."),
  }),
]);

export type CoverageRequest = z.infer<typeof CoverageRequestSchema>;

/**
 * CoverageRequest → 사람이 읽는 한 줄 텍스트.
 * 어드민 상세 / 설계사 작성 화면처럼 구조화 렌더링이 필요 없는 곳에서 사용.
 */
export function coverageRequestToText(coverage: CoverageRequest): string {
  if (coverage.intent === "broad") {
    return "종합적으로 알아보고 있어요";
  }
  return coverage.concerns.map((id) => FOCUSED_CONCERN_LABEL[id]).join(", ");
}

/* ============================================================
 * Step 1 — 요청서 본문 (전화번호 제외, 매칭 및 제안서 작성에 필요한 모든 정보)
 * ============================================================ */

export const Step1Schema = z
  .object({
    gender: z.enum(["male", "female"] satisfies [Gender, Gender]),
    occupation: z
      .string()
      .min(1, "직업을 입력해주세요.")
      .max(50, "직업은 50자 이내로 입력해주세요."),
    coverage: CoverageRequestSchema,
    monthlyBudgetMin: z.coerce.number().int().min(0),
    monthlyBudgetMax: z.coerce.number().int().min(0),
    /** 최대 20건 — 빈 배열 허용 (병력 없음) */
    medicalHistory: z.array(MedicalHistoryEntrySchema).max(20),
    /** 그외 요청사항 — 자유 텍스트, 선택 */
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
 * 제안서 정보(생년월일/직업/병력 등)는 Step1 에서 이미 수집됨.
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
 * PlanRequest 도메인 객체 (서버 저장 형태)
 * ============================================================ */

export const PLAN_REQUEST_STATUSES = [
  "draft",        // 1단계 완료, 후보 보는 중
  "selecting",    // 후보 선택 화면
  "confirming",   // 본인 인증 진행 중
  "dispatched",   // 설계사들에게 송부 완료
  "analyzing",    // AI 분석 중
  "completed",    // 결과 알림톡 발송 완료
  "rematching",   // 0명 제출 → 자동 재매칭
  "failed",       // 재매칭도 실패
] as const;

export type PlanRequestStatus = (typeof PLAN_REQUEST_STATUSES)[number];

/** 진행 중으로 간주되는 상태 — 같은 번호 신규 요청 차단 기준 */
export const ACTIVE_STATUSES: readonly PlanRequestStatus[] = [
  "draft",
  "selecting",
  "confirming",
  "dispatched",
  "analyzing",
  "rematching",
];

export type PlanRequest = {
  id: string;
  step1: Step1Input;
  step3?: Step3Input;
  candidateAgentIds: string[];   // N명 후보
  selectedAgentIds: string[];    // K명까지 선택
  status: PlanRequestStatus;
  createdAt: string;
  dispatchedAt?: string;
  deadlineAt?: string;
  rematchCount: number;
  resultToken?: string;          // 결과 열람용 일회용 토큰
};
