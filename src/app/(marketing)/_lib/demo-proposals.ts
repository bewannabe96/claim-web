import type { V5AnalysisViewData } from "@/features/plan-proposals/analysis/v5";
import type { CardMeta } from "@/features/plan-proposals/card-meta";
import {
  type CoverageItem,
  type RoiPoint,
  type ScenarioMeta,
} from "@/features/plan-proposals/ui/chart-types";
import { formatKRW } from "@/features/plan-proposals/ui/format-krw";

/**
 * 랜딩페이지 "제안서 비교" 데모용 mock 데이터.
 *
 * 한 `DemoCard` = V5 분석 ViewData + 데모용 partner 메타 — 실 결과 페이지에서
 * `PlanProposalCard + 분석 리포트 → buildAnalysisRenderer({cardMetas, ...})` 로
 * 빌드되는 것과 같은 의미를 데모용으로 직접 hardcode 한 것.
 *
 * 새 버전이 나와서 V5 모듈을 freeze 한 뒤에도 이 데모는 V5 그대로 — 랜딩이
 * "현재 화면" 을 보여주는 게 아니라 "AI 비교 가치 자체" 를 보여주는 demonstrative
 * 자료라 버전을 따라갈 필요 없음. 필요해지면 그때 최신 버전으로 갱신.
 *
 * 어느 제안서도 모든 시나리오에서 1등이 아니게 설계 — "직접 비교할 가치"가 생긴다.
 */

/** 데모 가입자의 가정 나이 — ROI 시계열의 시작점. */
const ENTRY_AGE = 32;

export const DEMO_SCENARIOS: ScenarioMeta[] = [
  { id: "cancer", label: "암", sentenceLabel: "암", incidence: [] },
  { id: "brain", label: "뇌혈관", sentenceLabel: "뇌혈관 질환", incidence: [] },
  { id: "heart", label: "심장", sentenceLabel: "심장 질환", incidence: [] },
  { id: "thyroid", label: "갑상선암", sentenceLabel: "갑상선암", incidence: [] },
];

type CoverageSeed = { label: string; insuredAmount: number };

type ProposalSeed = {
  id: string;
  // partner
  partnerName: string;
  yearsOfExperience: number;
  trustMetric: string;
  note: string;
  // proposal view
  insurer: string;
  monthlyPremium: number;
  paymentYears: number;
  maturityAge: number;
  hasRefundDuringPayment: boolean;
  hasRenewableRider: boolean;
  renewalIntervalYears?: number;
  /** 시나리오 id → 담보 항목 seed. */
  coverage: Record<string, CoverageSeed[]>;
};

const SEEDS: ProposalSeed[] = [
  {
    id: "a",
    partnerName: "도라에몽",
    yearsOfExperience: 11,
    trustMetric: "최근 1년 가입설계 제안 240건",
    note: "보장은 넓게 가져가면서 보험료는 합리적으로 맞췄어요. 비갱신형이라 보험료가 끝까지 그대로예요.",
    insurer: "4차원손해보험",
    monthlyPremium: 78_000,
    paymentYears: 20,
    maturityAge: 90,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    coverage: {
      cancer: [
        { label: "암 진단비", insuredAmount: 28_000_000 },
        { label: "항암 방사선·약물 치료비", insuredAmount: 6_000_000 },
      ],
      brain: [
        { label: "뇌혈관질환 진단비", insuredAmount: 22_000_000 },
        { label: "뇌졸중 수술비", insuredAmount: 10_000_000 },
      ],
      heart: [
        { label: "허혈성심장질환 진단비", insuredAmount: 10_000_000 },
        { label: "심장 수술비", insuredAmount: 5_000_000 },
      ],
      thyroid: [{ label: "갑상선암 진단비", insuredAmount: 25_000_000 }],
    },
  },
  {
    id: "b",
    partnerName: "세일러문",
    yearsOfExperience: 8,
    trustMetric: "재가입 고객 비율 상위 10%",
    note: "암 보장을 가장 두텁게 설계했어요. 100세까지 보장되고, 납입 중 해지해도 일부는 돌려받아요.",
    insurer: "달빛생명",
    monthlyPremium: 94_000,
    paymentYears: 20,
    maturityAge: 100,
    hasRefundDuringPayment: true,
    hasRenewableRider: true,
    renewalIntervalYears: 10,
    coverage: {
      cancer: [
        { label: "암 진단비", insuredAmount: 60_000_000 },
        { label: "고액암 추가 진단비", insuredAmount: 18_000_000 },
      ],
      brain: [{ label: "뇌혈관질환 진단비", insuredAmount: 18_000_000 }],
      heart: [
        { label: "허혈성심장질환 진단비", insuredAmount: 30_000_000 },
        { label: "급성심근경색 수술비", insuredAmount: 8_000_000 },
      ],
      thyroid: [{ label: "갑상선암 진단비", insuredAmount: 8_000_000 }],
    },
  },
  {
    id: "c",
    partnerName: "짱구",
    yearsOfExperience: 15,
    trustMetric: "평균 상담 응답 12분",
    note: "월 보험료 부담을 가장 낮춘 안이에요. 뇌혈관·심장 쪽 보장을 특히 신경 썼습니다.",
    insurer: "액션가면보험",
    monthlyPremium: 62_000,
    paymentYears: 30,
    maturityAge: 90,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    coverage: {
      cancer: [{ label: "암 진단비", insuredAmount: 20_000_000 }],
      brain: [
        { label: "뇌혈관질환 진단비", insuredAmount: 50_000_000 },
        { label: "뇌졸중 수술비", insuredAmount: 20_000_000 },
      ],
      heart: [
        { label: "허혈성심장질환 진단비", insuredAmount: 46_000_000 },
        { label: "심장 수술비", insuredAmount: 20_000_000 },
      ],
      thyroid: [{ label: "갑상선암 진단비", insuredAmount: 14_000_000 }],
    },
  },
];

/**
 * 시나리오 한 개의 ROI(회수 배율) 시계열.
 * roi(나이) = 보장 총액 ÷ 그 나이까지 낸 누적 보험료. 납입 종료 후엔 분모가
 * 고정돼 곡선이 평평해진다.
 *
 * 소수 2자리로만 양자화 — `analysis/v5/select-scenarios.ts:computeRoiSeries` 와 동일.
 */
function buildRoiSeries(seed: ProposalSeed, payout: number): RoiPoint[] {
  const points: RoiPoint[] = [];
  for (let age = ENTRY_AGE; age <= seed.maturityAge; age++) {
    // 가입 시점도 "1년차"로 취급 — 분모 0 / 비현실적 초대형 배율 회피.
    const yearsPaid = Math.min(
      Math.max(age - ENTRY_AGE + 1, 1),
      seed.paymentYears,
    );
    const cumulativePremium = seed.monthlyPremium * 12 * yearsPaid;
    const raw = payout / cumulativePremium;
    points.push({ age, roi: Math.round(raw * 100) / 100 });
  }
  return points;
}

function toCoverageItems(seeds: CoverageSeed[]): CoverageItem[] {
  return seeds.map((c) => ({
    label: c.label,
    amount: formatKRW(c.insuredAmount),
    insuredAmount: c.insuredAmount,
  }));
}

/**
 * 한 데모 카드 = 분석 ViewData (V5 모양) + 데모용 CardMeta. 실 결과 페이지에서
 * `buildAnalysisRenderer` 가 만들어주는 (cardMeta, viewData) 페어와 동등한 의미.
 */
export type DemoCard = {
  meta: CardMeta;
  view: V5AnalysisViewData;
};

function buildDemoCard(seed: ProposalSeed): DemoCard {
  const coverage: Record<string, CoverageItem[]> = {};
  const roi: Record<string, RoiPoint[]> = {};
  for (const scenario of DEMO_SCENARIOS) {
    const items = seed.coverage[scenario.id] ?? [];
    coverage[scenario.id] = toCoverageItems(items);
    const payout = items.reduce((sum, c) => sum + c.insuredAmount, 0);
    roi[scenario.id] = buildRoiSeries(seed, payout);
  }

  const view: V5AnalysisViewData = {
    id: seed.id,
    partner: { name: seed.partnerName, avatarUrl: null },
    insurer: seed.insurer,
    maturityAge: seed.maturityAge,
    monthlyPremium: seed.monthlyPremium,
    paymentYears: seed.paymentYears,
    hasRefundDuringPayment: seed.hasRefundDuringPayment,
    hasRenewableRider: seed.hasRenewableRider,
    renewalIntervalYears: seed.renewalIntervalYears,
    roi,
    surrenderLoss: [],
    coverage,
    // 데모는 chip 을 hardcode 하지만 V5AnalysisViewData satisfy 위해 채워둠.
    categoryPayouts: DEMO_SCENARIOS.map((s) => {
      const items = seed.coverage[s.id] ?? [];
      return {
        category: s.id,
        coverageCount: items.length,
        totalInsured: items.reduce((sum, c) => sum + c.insuredAmount, 0),
      };
    }),
  };

  const meta: CardMeta = {
    id: seed.id,
    partner: {
      name: seed.partnerName,
      yearsOfExperience: seed.yearsOfExperience,
      trustMetric: seed.trustMetric,
      avatarUrl: null,
    },
    note: seed.note,
    analyzed: true,
    analysisSkipped: false,
    contactRequested: false,
    schemaVersion: 5,
  };

  return { meta, view };
}

export const DEMO_CARDS: DemoCard[] = SEEDS.map(buildDemoCard);
