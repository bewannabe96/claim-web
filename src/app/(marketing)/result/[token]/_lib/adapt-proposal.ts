import type { AnalysisReportV4 } from "@/features/proposals/analysis-schema";
import type { ProposalCard } from "@/features/proposals/queries";
import { computeRoiSeries } from "@/features/proposals/select-scenarios";

import { formatKRW } from "./format-krw";
import type { CoverageItem, ProposalData, RoiPoint } from "./result-types";

/* ============================================================
 * 실 데이터 (Proposal + Partner + 분석 리포트 v4) → 결과 페이지 mock shape.
 *
 * 차트/카드 컴포넌트들이 mock fixture 의 `ProposalData` 형태에 강결합돼 있어
 * 어댑터로 변환만 한다.
 *
 * roi / coverage 의 키는 **분석 리포트의 category id** (e.g. "lung_cancer").
 * 결과 페이지의 RoiChart chip 영역과 ScenarioSection 의 카테고리가 동일 단위.
 *
 * roi 시계열 계산은 features/proposals/select-scenarios.ts 의 computeRoiSeries
 * 가 책임 (월보험료 + 납기 → 누적 보험료 → 보장액/누적 = ROI).
 *
 * `coverage` 는 category_groups + coverages 에서 derive — RoiChart 의
 * CoveragePanel 이 활성 시나리오의 담보 breakdown 표시에 사용.
 * ============================================================ */

/** mock fixture 와 동일한 가입자 나이 기준 — plan_request 에 birthdate 컬럼 도입 시 교체. */
const DEFAULT_CUSTOMER_AGE = 33;

export function adaptProposal(
  card: ProposalCard,
  report: AnalysisReportV4 | null,
  customerAge: number = DEFAULT_CUSTOMER_AGE,
): ProposalData {
  const { proposal, partner } = card;

  if (!report) {
    return makeFallback(proposal, partner);
  }

  const { headline, refund_table, coverage_payout } = report;
  const maturityAge = headline.maturity_age;

  return {
    id: proposal.id,
    partner: {
      name: partner.name,
      yearsOfExperience: partner.yearsOfExperience,
      trustMetric: partner.trustMetric,
    },
    insurer: headline.insurer,
    maturityAge,
    monthlyPremium: headline.total_actual_premium,
    paymentYears: headline.payment_period_year,
    hasRefundDuringPayment: hasRefundDuringPayment(report),
    hasRenewableRider: headline.is_renewable,
    // renewalIntervalYears 는 report 에 없음 — undefined 유지.
    roi: roiByCategory(report, customerAge),
    surrenderLoss: refund_table.rows
      .map((r) => ({
        age: customerAge + r.elapsed_year,
        loss: r.loss,
      }))
      // refund_table 은 elapsed_year 0~100 으로 들어와 만기를 넘어감. 차트 x 축이
      // 의미 있는 가입~만기 구간만 그려지게 clip.
      .filter((p) => p.age <= maturityAge),
    coverage: coverageByCategory(coverage_payout),
    note: proposal.note,
  };
}

/* ------------------------------------------------------------
 * 내부 헬퍼
 * ------------------------------------------------------------ */

/**
 * 납입 기간 중 해지 시 환급금이 있는가 — `headline.refund_type` 만으로 판단.
 * 새 enum 값이 늘어나면 그 값들은 모두 "환급 있음" 으로 분류.
 */
function hasRefundDuringPayment(report: AnalysisReportV4): boolean {
  return report.headline.refund_type !== "no_refund";
}

/**
 * 분석 리포트의 모든 카테고리에 대해 ROI 시계열 미리 계산.
 *
 * 키 = category_payouts[].category. RoiChart 는 chip 활성 시 이 key 로 lookup.
 * "기타" 모달에서 선택한 카테고리도 동일 lookup.
 *
 * 한 proposal 당 ~24 시리즈 × ~70 점 = 1700 포인트 — 메모리/페이로드 trivial.
 */
function roiByCategory(
  report: AnalysisReportV4,
  customerAge: number,
): Record<string, RoiPoint[]> {
  const result: Record<string, RoiPoint[]> = {};
  for (const payout of report.coverage_payout.category_payouts) {
    result[payout.category] = computeRoiSeries(
      report,
      payout.category,
      customerAge,
    );
  }
  return result;
}

/**
 * 카테고리별 담보 항목 (CoverageItem[]). RoiChart 의 CoveragePanel 이 사용.
 *
 * category_groups[cat].coverage_indexes → coverages[i] 로 풀어서 매핑.
 * 키 = category id (예: "lung_cancer").
 */
function coverageByCategory(
  payout: AnalysisReportV4["coverage_payout"],
): Record<string, CoverageItem[]> {
  const result: Record<string, CoverageItem[]> = {};
  for (const group of payout.category_groups) {
    result[group.category] = group.coverage_indexes
      .map((i) => payout.coverages[i])
      .filter((c): c is { name: string; insured_amount: number } => Boolean(c))
      .map((c) => ({
        label: c.name,
        amount: formatKRW(c.insured_amount),
        insuredAmount: c.insured_amount,
      }));
  }
  return result;
}

/**
 * 분석 리포트 매칭 실패 시 — 빈 카드. 차트들은 빈 데이터 가드로 안 그려짐.
 * 운영상은 분석 진행 중 placeholder UI 로 대체 가능.
 */
function makeFallback(
  proposal: ProposalCard["proposal"],
  partner: ProposalCard["partner"],
): ProposalData {
  return {
    id: proposal.id,
    partner: {
      name: partner.name,
      yearsOfExperience: partner.yearsOfExperience,
      trustMetric: partner.trustMetric,
    },
    insurer: "",
    maturityAge: 100,
    monthlyPremium: 0,
    paymentYears: 0,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    roi: {},
    surrenderLoss: [],
    coverage: {},
    note: proposal.note,
  };
}
