import { z } from "zod";

/* ============================================================
 * 분석 리포트 (claim.plan_proposal_analysis_report) — schema v5
 *
 * 외부 분석 파이프라인 (eightytwo_judge) 가 콜백으로 보내는 결과의 형태.
 * 우리 웹훅 (/api/webhooks/eightytwo-judge-analysis) 이 INSERT, queries.ts 의 wrapper 가 read.
 *
 * 운영 패턴: 매 schema 진화 시 row 교체 (현재 DB 에 v5 row 만 존재).
 * queries.ts 의 wrapper 가 CURRENT_REPORT_VERSION 으로 필터 고정 → 호출자는
 * 항상 "현재 지원 버전" 만 봄. 외부가 v6 로 진화하면:
 *   1. 웹훅이 새 콜백을 받아 schemaVersion=6 로 INSERT
 *   2. 이 파일을 v6 형태로 갱신, CURRENT_REPORT_VERSION = 6
 *   3. parse() 가 실패하던 케이스가 다시 통과
 *
 * 양쪽 팀이 양쪽 코드를 동시 수정하는 운영 모델.
 * ============================================================ */

export const CURRENT_REPORT_VERSION = 5 as const;

/* ------------------------------------------------------------
 * headline — 계약 메타
 * ------------------------------------------------------------ */

/**
 * 환급 타입 — 운영에서 추가 값 (예: "partial_refund") 발견 시 enum 확장. catchall
 * 로 두면 새 값이 silently 통과되어 차트 분기를 깨뜨릴 수 있어 명시적 enum 유지.
 * 소비측 (`adapt-proposal.ts:hasRefundDuringPayment`) 은 `!== "no_refund"` 로 분기하므로
 * 신규 값은 자동으로 "환급 있음" 으로 분류된다.
 */
export const RefundTypeSchema = z.enum(["no_refund", "with_refund"]);
export type RefundType = z.infer<typeof RefundTypeSchema>;

export const HeadlineSchema = z.object({
  /** 보험사명 (예: "NH농협손해보험"). */
  insurer: z.string(),
  /** 매월 실 납입 보험료 (원). */
  total_actual_premium: z.number().int(),
  /** 납입기간 (년). */
  payment_period_year: z.number().int(),
  /** 만기 나이. */
  maturity_age: z.number().int(),
  /** 갱신형 담보 포함 여부. */
  is_renewable: z.boolean(),
  refund_type: RefundTypeSchema,
  /** 운영 노트 — 사람이 읽는 자유 텍스트. */
  notes: z.array(z.string()),
});
export type Headline = z.infer<typeof HeadlineSchema>;

/* ------------------------------------------------------------
 * refund_table — 해지환급 시계열 + 보간 모델 + 원본 입력
 * ------------------------------------------------------------ */

export const RefundRowSchema = z.object({
  elapsed_year: z.number().int(),
  cumulative_premium: z.number().int(),
  refund_amount: z.number().int(),
  refund_rate_percent: z.number(),
  /** loss = cumulative_premium − refund_amount. 음수면 이득(만기 환급 100%+). */
  loss: z.number().int(),
});
export type RefundRow = z.infer<typeof RefundRowSchema>;

export const RefundCoefficientsSchema = z.object({
  a: z.number(),
  b: z.number(),
  c: z.number(),
  /** rows 보간에 사용된 anchor 샘플 수. */
  sample_count_used: z.number().int(),
});

export const RefundInputSummarySchema = z.object({
  monthly_premium: z.number().int(),
  payment_years: z.number().int(),
  is_non_refund: z.boolean(),
  /** PDF 에 적힌 이산 환급률 anchor — coefficients 가 이걸 fit 해서 rows 생성. */
  refund_samples: z.array(
    z.object({
      elapsed_year: z.number().int(),
      refund_rate_percent: z.number(),
    }),
  ),
});

export const RefundTableSchema = z.object({
  rows: z.array(RefundRowSchema),
  coefficients: RefundCoefficientsSchema,
  input_summary: RefundInputSummarySchema,
});
export type RefundTable = z.infer<typeof RefundTableSchema>;

/* ------------------------------------------------------------
 * coverage_payout — 보장 카탈로그 + KCD/카테고리 매핑 + 카테고리 집계
 * ------------------------------------------------------------ */

/** 진설계의 담보 한 줄 — name 은 PDF 원문 그대로 (긴 한글). */
export const CoverageSchema = z.object({
  name: z.string(),
  insured_amount: z.number().int(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

/** KCD-8 코드 → 해당 진단에 지급되는 담보 ordinal index 목록. */
export const KcdGroupSchema = z.object({
  kcd_code: z.string(),
  coverage_indexes: z.array(z.number().int()),
});

/** 도메인 카테고리 (예: "lung_cancer") → coverage_indexes. */
export const CategoryGroupSchema = z.object({
  category: z.string(),
  coverage_indexes: z.array(z.number().int()),
});

/**
 * 카테고리별 집계 — coverage_count (담보 개수) + total_insured_amount (보험금 합계).
 * category_groups × coverages 의 derived. 결과 페이지가 top3 정렬/표시에 직접 사용.
 */
export const CategoryPayoutSchema = z.object({
  category: z.string(),
  coverage_count: z.number().int(),
  total_insured_amount: z.number().int(),
});
export type CategoryPayout = z.infer<typeof CategoryPayoutSchema>;

export const CoveragePayoutSchema = z.object({
  notes: z.array(z.string()),
  coverages: z.array(CoverageSchema),
  kcd_groups: z.array(KcdGroupSchema),
  /** 카탈로그에 매핑 실패한 KCD 코드 — 운영 모니터링용. */
  unmapped_kcd: z.array(z.string()),
  category_groups: z.array(CategoryGroupSchema),
  category_payouts: z.array(CategoryPayoutSchema),
});
export type CoveragePayout = z.infer<typeof CoveragePayoutSchema>;

/* ------------------------------------------------------------
 * 최상위
 * ------------------------------------------------------------ */

/**
 * 저장된 report 본문의 형태 (stored shape). DB 의 `report` jsonb 컬럼에 들어가는
 * 그대로. 버전은 별도 컬럼 (`schema_version`) 으로 관리하므로 본문엔 안 들어감 —
 * 웹훅이 페이로드의 `result.schema_version` 을 떼서 컬럼에 저장하고, 본문만 여기로.
 *
 * 인바운드 페이로드 검증 (schema_version 포함) 은 웹훅 라우트에서
 * `.extend({ schema_version: z.literal(CURRENT_REPORT_VERSION) })` 로 처리.
 */
export const AnalysisReportV5Schema = z.object({
  headline: HeadlineSchema,
  refund_table: RefundTableSchema,
  coverage_payout: CoveragePayoutSchema,
});
export type AnalysisReportV5 = z.infer<typeof AnalysisReportV5Schema>;
