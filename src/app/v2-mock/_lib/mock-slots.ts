import type { V5AnalysisViewData } from "@/features/plan-proposals/analysis/v5";
import type { CardMeta } from "@/features/plan-proposals/card-meta";
import {
  type CoverageItem,
  type RoiPoint,
  type ScenarioMeta,
} from "@/features/plan-proposals/ui/chart-types";
import { formatKRW } from "@/features/plan-proposals/ui/format-krw";

/* ============================================================
 * v2-mock 슬롯 가짜 데이터.
 *
 * `(marketing)/_lib/demo-proposals.ts` 의 DemoCard 패턴을 가져와 v2 specific 메타
 * (origin / analysisMode / externalMeta) 를 얹은 것. 같은 V5AnalysisViewData 모양으로
 * 만들어두면 V5_ENTRY.ActiveBody 호출 한 번으로 슬롯 union 비교가 자연스럽게 작동.
 *
 * 슬롯 3개는 v2 PRD 의 핵심 3가지를 한 화면에 시각화하도록 의도 배치:
 *
 *   1) 🟦 customer_upload + final   — 가입자가 받은 자료 (PDF/사진), 약관 indexed
 *   2) 🟩 partner_submit  + final   — 우리 풀에서 받은 정식 제안서
 *   3) 🟦 customer_upload + provisional — 약관 미indexed → 임시 분석 + soft CTA
 *
 * 어느 슬롯도 모든 시나리오에서 1등이 아니게 설계 — 비교할 가치가 한눈에 느껴진다.
 * ============================================================ */

const ENTRY_AGE = 32;

/**
 * 시나리오 카테고리 id 는 반드시 `features/plan-proposals/category-labels.ts` 의
 * KNOWN_CATEGORIES 키여야 함 — V5ScenarioPickerRoiChart 가 `labelForCategory(id)`
 * 로 한글 라벨을 매핑하기 때문. raw id (e.g. "cancer") 를 쓰면 한글 변환 fallback
 * 으로 영문이 그대로 노출됨.
 *
 * label / sentenceLabel 은 V5 path 에서는 무시되지만 ScenarioMeta 타입 satisfy
 * 위해 일관성 있게 채워둠.
 */
export const MOCK_SCENARIOS: ScenarioMeta[] = [
  { id: "lung_cancer", label: "폐암", sentenceLabel: "폐암", incidence: [] },
  {
    id: "cerebrovascular_disease",
    label: "뇌혈관질환",
    sentenceLabel: "뇌혈관질환",
    incidence: [],
  },
  {
    id: "acute_ischemic_heart_disease",
    label: "급성 허혈성심장질환",
    sentenceLabel: "급성 허혈성심장질환",
    incidence: [],
  },
  {
    id: "thyroid_cancer",
    label: "갑상선암",
    sentenceLabel: "갑상선암",
    incidence: [],
  },
];

/** v2 의 PlanProposal.origin enum (PRD §5.2). */
export type SlotOrigin = "customer_upload" | "partner_submit";

/** v2 의 PlanProposalAnalysisReport.mode enum (PRD §5.3). */
export type AnalysisMode = "provisional" | "final";

/** 외부 업로드 슬롯의 메타 — 가입자가 업로드 폼에서 입력. */
export type ExternalUploadMeta = {
  /** 가입자가 직접 적은 보험사명 — 공개 카탈로그라 PII 아님. */
  insurerName: string;
  /** 가입자가 직접 적은 상품명 — 공개 카탈로그라 PII 아님. */
  productName: string;
  /** 업로드 일자 (KST 표시용 ISO string). */
  uploadedAt: string;
  /** 가입자가 알면 적은 설계사 이름. 없으면 null (attribution 카드 hide). */
  proposerName: string | null;
};

/** 슬롯 한 개 = v1 의 (CardMeta + V5AnalysisViewData) + v2 origin 메타. */
export type MockSlot = {
  meta: CardMeta;
  view: V5AnalysisViewData;
  origin: SlotOrigin;
  analysisMode: AnalysisMode;
  /** customer_upload 일 때만. partner_submit 은 null. */
  externalMeta: ExternalUploadMeta | null;
  /** customer_upload + provisional 일 때 fallback 으로 쓴 indexed 약관 표시용. */
  fallbackTermsLabel?: string;
};

/* ------------------------------------------------------------
 * Seed → MockSlot 빌더 (demo-proposals.ts 패턴 그대로)
 * ------------------------------------------------------------ */

type CoverageSeed = { label: string; insuredAmount: number };

type SlotSeed = {
  id: string;
  origin: SlotOrigin;
  analysisMode: AnalysisMode;
  // partner (partner_submit 일 때만 의미. customer_upload 는 attribution 에서 분기)
  partnerName: string;
  partnerYearsOfExperience: number;
  partnerTrustMetric: string;
  // proposal view
  note: string;
  insurer: string;
  monthlyPremium: number;
  paymentYears: number;
  maturityAge: number;
  hasRefundDuringPayment: boolean;
  hasRenewableRider: boolean;
  renewalIntervalYears?: number;
  coverage: Record<string, CoverageSeed[]>;
  // v2 specific
  externalMeta: ExternalUploadMeta | null;
  fallbackTermsLabel?: string;
};

const SEEDS: SlotSeed[] = [
  {
    id: "slot-upload-final",
    origin: "customer_upload",
    analysisMode: "final",
    // partner 정보는 가입자가 입력한 것. yearsOfExperience 등은 외부라 모름.
    // customer_upload 슬롯의 partner.* 는 v1 CardMeta 타입 satisfy 위한 dummy —
    // 본문/chip/attribution 어디서도 표시되지 않음 (slot-attribution 의 upload 분기는
    // origin meta 만 사용, chip 은 보험사명, 한줄평 영역은 origin 분기로 hide).
    partnerName: "—",
    partnerYearsOfExperience: 0,
    partnerTrustMetric: "",
    // 가입자는 메시지를 입력하지 않음 (PRD §4.2 메타 출처 정책). 한줄평 영역 자체 hide.
    note: "",
    insurer: "4차원손해보험",
    monthlyPremium: 78_000,
    paymentYears: 20,
    maturityAge: 90,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    coverage: {
      lung_cancer: [
        { label: "암 진단비", insuredAmount: 28_000_000 },
        { label: "항암 방사선·약물 치료비", insuredAmount: 6_000_000 },
      ],
      cerebrovascular_disease: [
        { label: "뇌혈관질환 진단비", insuredAmount: 22_000_000 },
        { label: "뇌졸중 수술비", insuredAmount: 10_000_000 },
      ],
      acute_ischemic_heart_disease: [
        { label: "허혈성심장질환 진단비", insuredAmount: 10_000_000 },
        { label: "심장 수술비", insuredAmount: 5_000_000 },
      ],
      thyroid_cancer: [{ label: "갑상선암 진단비", insuredAmount: 25_000_000 }],
    },
    externalMeta: {
      insurerName: "4차원손해보험",
      productName: "스마트통합건강보험 (무)2024",
      uploadedAt: "2026-05-26T09:12:00+09:00",
      // 분석기가 PDF 에서 설계사 이름을 추출 못 한 경우 — attribution 의 "설계사" row 자동 hide.
      proposerName: null,
    },
  },
  {
    id: "slot-partner-final",
    origin: "partner_submit",
    analysisMode: "final",
    partnerName: "세일러문",
    partnerYearsOfExperience: 8,
    partnerTrustMetric: "재가입 고객 비율 상위 10%",
    note: "암 보장을 가장 두텁게 설계했어요. 100세까지 보장되고, 납입 중 해지해도 일부는 돌려받아요.",
    insurer: "달빛생명",
    monthlyPremium: 94_000,
    paymentYears: 20,
    maturityAge: 100,
    hasRefundDuringPayment: true,
    hasRenewableRider: true,
    renewalIntervalYears: 10,
    coverage: {
      lung_cancer: [
        { label: "암 진단비", insuredAmount: 60_000_000 },
        { label: "고액암 추가 진단비", insuredAmount: 18_000_000 },
      ],
      cerebrovascular_disease: [
        { label: "뇌혈관질환 진단비", insuredAmount: 18_000_000 },
      ],
      acute_ischemic_heart_disease: [
        { label: "허혈성심장질환 진단비", insuredAmount: 30_000_000 },
        { label: "급성심근경색 수술비", insuredAmount: 8_000_000 },
      ],
      thyroid_cancer: [{ label: "갑상선암 진단비", insuredAmount: 8_000_000 }],
    },
    externalMeta: null,
  },
  {
    id: "slot-upload-provisional",
    origin: "customer_upload",
    analysisMode: "provisional",
    // customer_upload 슬롯 — partner.* 는 dummy, 본문 한줄평 자리 hide (위 #1 시드 참조).
    partnerName: "—",
    partnerYearsOfExperience: 0,
    partnerTrustMetric: "",
    note: "",
    insurer: "액션가면보험",
    monthlyPremium: 62_000,
    paymentYears: 30,
    maturityAge: 90,
    hasRefundDuringPayment: false,
    hasRenewableRider: false,
    coverage: {
      lung_cancer: [{ label: "암 진단비", insuredAmount: 20_000_000 }],
      cerebrovascular_disease: [
        { label: "뇌혈관질환 진단비", insuredAmount: 50_000_000 },
        { label: "뇌졸중 수술비", insuredAmount: 20_000_000 },
      ],
      acute_ischemic_heart_disease: [
        { label: "허혈성심장질환 진단비", insuredAmount: 46_000_000 },
        { label: "심장 수술비", insuredAmount: 20_000_000 },
      ],
      thyroid_cancer: [{ label: "갑상선암 진단비", insuredAmount: 14_000_000 }],
    },
    externalMeta: {
      insurerName: "액션가면보험",
      productName: "케어플러스종합보장 (무) (요약본)",
      uploadedAt: "2026-05-26T10:48:00+09:00",
      proposerName: null,
    },
    fallbackTermsLabel: "비슷한 상품의 약관",
  },
];

/* ------------------------------------------------------------
 * Seed → ViewData / CardMeta 빌더 (demo-proposals.ts 의 buildDemoCard 패턴)
 * ------------------------------------------------------------ */

function buildRoiSeries(seed: SlotSeed, payout: number): RoiPoint[] {
  const points: RoiPoint[] = [];
  for (let age = ENTRY_AGE; age <= seed.maturityAge; age++) {
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

function buildSlot(seed: SlotSeed): MockSlot {
  const coverage: Record<string, CoverageItem[]> = {};
  const roi: Record<string, RoiPoint[]> = {};
  for (const scenario of MOCK_SCENARIOS) {
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
    categoryPayouts: MOCK_SCENARIOS.map((s) => {
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
      yearsOfExperience: seed.partnerYearsOfExperience,
      trustMetric: seed.partnerTrustMetric,
      avatarUrl: null,
    },
    note: seed.note,
    analyzed: true,
    analysisSkipped: false,
    contactRequested: false,
    schemaVersion: 5,
  };

  return {
    meta,
    view,
    origin: seed.origin,
    analysisMode: seed.analysisMode,
    externalMeta: seed.externalMeta,
    fallbackTermsLabel: seed.fallbackTermsLabel,
  };
}

export const MOCK_SLOTS: MockSlot[] = SEEDS.map(buildSlot);

/** 시나리오 priority — v1 의 settings.scenarioPriority 자리에 mock 으로 주입. */
export const MOCK_SCENARIO_PRIORITY: readonly string[] = MOCK_SCENARIOS.map(
  (s) => s.id,
);

/* ============================================================
 * createPendingSlot — 업로드 직후 "분석 중" 슬롯 생성.
 *
 * 가입자가 /v2-mock/upload 에서 파일 제출 → analyzing → workspace 로 자동 복귀할
 * 때 prepend 되는 슬롯. analyzed=false 라 workbench-view 가 본문 placeholder
 * ("분석 중이에요" + pulse dot) 로 렌더. 분석기가 아직 메타 추출 전이라 보험사/
 * 상품명도 모름 — chip 라벨 "분석 중..." generic.
 *
 * view (V5AnalysisViewData) 는 dummy — analyzed=false 슬롯에 대해 ActiveBody 호출
 * 안 되고 peers (ROI 멀티라인) 에서도 제외되므로 표시되지 않음. type satisfy 위해서만.
 * ============================================================ */
export function createPendingSlot(): MockSlot {
  const id = `slot-pending-${Date.now()}`;
  return {
    meta: {
      id,
      partner: {
        name: "—",
        yearsOfExperience: 0,
        trustMetric: "",
        avatarUrl: null,
      },
      note: "",
      analyzed: false,
      analysisSkipped: false,
      contactRequested: false,
      schemaVersion: undefined,
    },
    view: {
      id,
      partner: { name: "—", avatarUrl: null },
      insurer: "분석 중",
      maturityAge: 0,
      monthlyPremium: 0,
      paymentYears: 0,
      hasRefundDuringPayment: false,
      hasRenewableRider: false,
      roi: {},
      surrenderLoss: [],
      coverage: {},
      categoryPayouts: [],
    },
    origin: "customer_upload",
    analysisMode: "final",
    externalMeta: null,
  };
}
