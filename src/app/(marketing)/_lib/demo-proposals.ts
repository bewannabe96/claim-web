import {
  type CoverageItem,
  type PlanProposalData,
  type RoiPoint,
  type ScenarioMeta,
} from "@/features/plan-proposals/ui/chart-types";
import { formatKRW } from "@/features/plan-proposals/ui/format-krw";

/**
 * 랜딩페이지 "제안서 비교" 데모용 mock 데이터.
 *
 * 결과 페이지(result/[token])와 동일한 PlanProposalData / ScenarioMeta shape 으로
 * 채워, 데모가 features/plan-proposals/ui 의 실제 차트·카드 컴포넌트를 그대로
 * 재사용한다. 결과 페이지는 adapt-proposal 이 실 데이터로 채우는 자리를 여기선
 * mock 으로 채우는 차이뿐.
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
  partnerName: string;
  yearsOfExperience: number;
  trustMetric: string;
  insurer: string;
  monthlyPremium: number;
  paymentYears: number;
  maturityAge: number;
  hasRefundDuringPayment: boolean;
  hasRenewableRider: boolean;
  renewalIntervalYears?: number;
  note: string;
  /** 시나리오 id → 담보 항목 seed. */
  coverage: Record<string, CoverageSeed[]>;
};

const SEEDS: ProposalSeed[] = [
  {
    id: "a",
    partnerName: "김도윤",
    yearsOfExperience: 11,
    trustMetric: "최근 1년 가입설계 제안 240건",
    insurer: "한화손해보험",
    monthlyPremium: 78_000,
    paymentYears: 20,
    maturityAge: 90,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    note: "보장은 넓게 가져가면서 보험료는 합리적으로 맞췄어요. 비갱신형이라 보험료가 끝까지 그대로예요.",
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
    partnerName: "이서연",
    yearsOfExperience: 8,
    trustMetric: "재가입 고객 비율 상위 10%",
    insurer: "삼성생명",
    monthlyPremium: 94_000,
    paymentYears: 20,
    maturityAge: 100,
    hasRefundDuringPayment: true,
    hasRenewableRider: true,
    renewalIntervalYears: 10,
    note: "암 보장을 가장 두텁게 설계했어요. 100세까지 보장되고, 납입 중 해지해도 일부는 돌려받아요.",
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
    partnerName: "박준호",
    yearsOfExperience: 15,
    trustMetric: "평균 상담 응답 12분",
    insurer: "DB손해보험",
    monthlyPremium: 62_000,
    paymentYears: 30,
    maturityAge: 90,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    note: "월 보험료 부담을 가장 낮춘 안이에요. 뇌혈관·심장 쪽 보장을 특히 신경 썼습니다.",
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
 * 소수 2자리로만 양자화 — result/[token] 의 computeRoiSeries 와 동일. 0.01
 * 간격이라 곡선이 매끄럽다. 정수/소수 1자리로 거칠게 반올림하면 연차 변화가
 * 반올림 단위보다 작아지는 감소 후반 구간이 같은 값으로 뭉쳐 계단(자글자글)이
 * 생긴다. 커서 "N배" 라벨의 읽기 좋은 반올림은 RoiChart 가 표시 시점에 담당.
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

export const DEMO_PROPOSALS: PlanProposalData[] = SEEDS.map((seed) => {
  const coverage: Record<string, CoverageItem[]> = {};
  const roi: Record<string, RoiPoint[]> = {};
  for (const scenario of DEMO_SCENARIOS) {
    const items = seed.coverage[scenario.id] ?? [];
    coverage[scenario.id] = toCoverageItems(items);
    const payout = items.reduce((sum, c) => sum + c.insuredAmount, 0);
    roi[scenario.id] = buildRoiSeries(seed, payout);
  }
  return {
    id: seed.id,
    partner: {
      name: seed.partnerName,
      yearsOfExperience: seed.yearsOfExperience,
      trustMetric: seed.trustMetric,
      avatarUrl: null,
    },
    analyzed: true,
    contacted: false,
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
    note: seed.note,
  };
});
