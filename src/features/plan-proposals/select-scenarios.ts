import {
  type AnalysisReportV5,
  type CategoryPayout,
} from "./analysis-schema";
import { compareCategoryByLabel } from "./category-labels";

/* ============================================================
 * 회수 배율 (ROI) 시계열 — 사용자 정의 공식.
 *
 *   누적 보험료(age) = monthlyPremium × 12 × min(age - startAge, paymentYears)
 *   ROI(age) = totalInsuredAmount(category) / 누적 보험료(age)
 *
 * 의미: "이 나이에 시나리오(질병) 가 발병하면 그동안 낸 보험료의 몇 배를
 * 보장으로 돌려받나". 어릴수록 누적이 적어 ROI 폭발적 (분모 작음), 만기 가까
 * 워질수록 작아지고, 납기 종료 후엔 분모 고정 → 평탄.
 *
 * 차트 첫 점이 (startAge, 0) 으로 박혀 곡선이 부자연스러워지는 걸 피하려
 * startAge + 1 부터 시작 (분모 ≥ 12 × monthlyPremium 보장).
 * ============================================================ */

export type RoiPoint = { age: number; roi: number };

export function computeRoiSeries(
  report: AnalysisReportV5,
  category: string,
  startAge: number,
): RoiPoint[] {
  const monthly = report.headline.total_actual_premium;
  const paymentYears = report.headline.payment_period_year;
  const endAge = report.headline.maturity_age;
  const insured =
    report.coverage_payout.category_payouts.find((p) => p.category === category)
      ?.total_insured_amount ?? 0;

  const series: RoiPoint[] = [];
  for (let age = startAge + 1; age <= endAge; age++) {
    const yearsElapsed = age - startAge;
    const yearsPaid = Math.min(yearsElapsed, paymentYears);
    const cumulativePremium = monthly * 12 * yearsPaid;
    series.push({ age, roi: round2(insured / cumulativePremium) });
  }
  return series;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ============================================================
 * 시나리오 선택 — chip 영역 + 검색 모달 계산. 순수 함수, 서버/클라 양쪽 OK.
 * ============================================================ */

/** 시나리오 한 항목 — 모달 행에 표시할 최소 정보. */
export type ScenarioCard = {
  category: string;
  payout: CategoryPayout;
};

/**
 * 여러 proposals 의 카테고리 union — 검색 모달의 풀.
 *
 * 한 카테고리가 여러 report 에 나타나면 첫 발견 report 의 payout 을 그 카테고리의
 * 대표값으로. (UX 측면: 같은 카테고리는 같은 라벨이라 어느 report 의 payout 이든
 * 표시 의미는 동일.) 결과는 한글 라벨 가나다순.
 */
export function unionCategoryScenarios(
  reports: readonly AnalysisReportV5[],
): ScenarioCard[] {
  const seen = new Set<string>();
  const cards: ScenarioCard[] = [];
  for (const report of reports) {
    for (const payout of report.coverage_payout.category_payouts) {
      if (seen.has(payout.category)) continue;
      seen.add(payout.category);
      cards.push({ category: payout.category, payout });
    }
  }
  return cards.sort((a, b) => compareCategoryByLabel(a.category, b.category));
}

/**
 * 모든 reports 가 공통으로 "보장" 하는 카테고리들의 교집합 → admin priority 등재
 * 순서를 우선 적용해 상위 N 개. 결과 페이지의 chip 초기값 (recent 가 비었을 때).
 *
 *  - "보장됨" 기준: 각 report 의 category_payouts 중 coverage_count > 0
 *  - priority 등재 카테고리: priority 의 명시된 순서대로
 *  - 미등재 fallback: 가나다순으로 채움 (등재만으로 N 개 못 채울 때)
 *  - reports 가 비면 [] 반환
 */
export function intersectionTopCategories(
  reports: readonly AnalysisReportV5[],
  priority: readonly string[],
  n: number,
): string[] {
  if (reports.length === 0) return [];

  const coveredSets = reports.map(
    (r) =>
      new Set(
        r.coverage_payout.category_payouts
          .filter((p) => p.coverage_count > 0)
          .map((p) => p.category),
      ),
  );

  // 교집합 = 모든 set 에 존재
  const intersection = [...coveredSets[0]].filter((cat) =>
    coveredSets.every((s) => s.has(cat)),
  );

  const intersectionSet = new Set(intersection);
  const prioritySet = new Set(priority);

  const inPriority = priority.filter((cat) => intersectionSet.has(cat));
  const notInPriority = intersection
    .filter((cat) => !prioritySet.has(cat))
    .sort(compareCategoryByLabel);

  return [...inPriority, ...notInPriority].slice(0, n);
}
