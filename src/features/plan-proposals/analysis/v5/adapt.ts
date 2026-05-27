import type { PlanProposalCard } from "@/features/plan-proposals/queries";
import type {
  CoverageItem,
  RoiPoint,
  SurrenderLossPoint,
} from "@/features/plan-proposals/ui/chart-types";
import { formatKRW } from "@/features/plan-proposals/ui/format-krw";

import { computeRoiSeries } from "./select-scenarios";
import { type AnalysisReportV5 } from "./schema";

/* ============================================================
 * V5 ViewData — 분석 본문 컴포넌트가 쓰는 모양.
 *
 * 카드 메타 (partner / analyzed / contactRequested / note) 는 별도 `CardMeta` 가
 * 책임 — 그쪽은 shell 단독 의존이고 버전 무관. 여기는 V5 리포트 derived 분석
 * 결과만 담음. 새 버전이 생기면 `analysis/v6/adapt.ts` 가 다른 모양 ViewData
 * 를 export.
 *
 * 차트 컴포넌트들이 cross-card 비교 (ROI 멀티라인, surrender 멀티라인) 를
 * 위해 peers (V5ViewData[]) 를 통째 받으므로, 각 ViewData 는 chart 가 라벨/
 * lookup 에 필요로 하는 식별자 (id, partner.name, partner.avatarUrl) 를 함께
 * 담는다 — chart 가 cardMeta 까지 조인 lookup 하지 않도록.
 * ============================================================ */

export type V5AnalysisViewData = {
  /** PlanProposal.id — peers 배열 내 active lookup 키. */
  id: string;

  /** 차트가 곡선 라벨 (aria-label / 강조 곡선 식별) 에 사용. */
  partner: {
    name: string;
    avatarUrl: string | null;
  };

  // 계약 컨텍스트
  insurer: string;
  maturityAge: number;

  // 핵심 수치
  monthlyPremium: number;
  paymentYears: number;

  // 구조 플래그
  hasRefundDuringPayment: boolean;
  hasRenewableRider: boolean;
  /** 갱신형 담보가 있을 때 보험료 재산정 주기 (년). hasRenewableRider true 일 때만 의미. */
  renewalIntervalYears?: number;

  // ROI — 시나리오별(category id 키) 누적 회수 배율 시계열
  roi: Record<string, RoiPoint[]>;

  // 해지 시 손실 시계열
  surrenderLoss: SurrenderLossPoint[];

  // 보장 영역별(category id 키) 담보 항목
  coverage: Record<string, CoverageItem[]>;

  /**
   * 카테고리별 payout 메타 — 시나리오 chip 풀 (intersection / union) 계산.
   * coverage_count == 0 인 카테고리는 모달에서 disabled, intersection 에서 제외.
   */
  categoryPayouts: Array<{
    category: string;
    coverageCount: number;
    totalInsured: number;
  }>;
};

/**
 * PlanProposalCard + parsed V5 report + 가입자 나이 → V5AnalysisViewData.
 *
 * shell 이 analyzed 카드일 때만 renderAnalysisBody → V5_ENTRY.ActiveBody 로 dispatch
 * 하므로, 이 함수는 항상 실제 report 가 있는 경우에만 호출된다 — fallback (옛
 * makeFallback) 로직이 사라짐. 분석 미완료 카드의 placeholder 는 shell 책임.
 *
 * `roi` / `coverage` 의 키는 분석 리포트의 category id (e.g. "lung_cancer").
 * 결과 페이지의 chip 영역과 동일 단위.
 */
export function adaptV5(
  card: PlanProposalCard,
  report: AnalysisReportV5,
  customerAge: number,
): V5AnalysisViewData {
  const { proposal, partner } = card;
  const { headline, refund_table, coverage_payout } = report;
  const maturityAge = headline.maturity_age;

  return {
    id: proposal.id,
    partner: {
      name: partner.name,
      avatarUrl: partner.avatarUrl,
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
    categoryPayouts: coverage_payout.category_payouts.map((p) => ({
      category: p.category,
      coverageCount: p.coverage_count,
      totalInsured: p.total_insured_amount,
    })),
  };
}

/* ------------------------------------------------------------
 * 내부 헬퍼
 * ------------------------------------------------------------ */

/**
 * 납입 기간 중 해지 시 환급금이 있는가 — `headline.refund_type` 만으로 판단.
 * 새 enum 값이 늘어나면 그 값들은 모두 "환급 있음" 으로 분류.
 */
function hasRefundDuringPayment(report: AnalysisReportV5): boolean {
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
  report: AnalysisReportV5,
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
  payout: AnalysisReportV5["coverage_payout"],
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
