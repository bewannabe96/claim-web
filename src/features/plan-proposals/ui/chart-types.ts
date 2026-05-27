/**
 * plan-proposals 도메인의 차트/카드 atomic 컴포넌트가 받는 prop 시그니처 —
 * 모든 버전의 ViewData 가 satisfy 해야 하는 구조적 인터페이스.
 *
 * 옛 단일 `PlanProposalData` 타입은 폐기 — 카드 메타 (partner/analyzed/note/
 * contactRequested) 는 별도 `CardMeta` 가 책임, 분석 결과는 버전별 ViewData
 * (예: `analysis/v5/adapt.ts` 의 `V5AnalysisViewData`) 가 책임. 차트는 그 ViewData
 * 가 satisfy 하는 *구조적* 부분집합만 prop 으로 받음 (`ChartProposalView`,
 * `ProposalMetrics`). 따라서 어떤 버전 AnalysisBody 가 합성하든 동일 차트를
 * 재사용한다.
 */

/* ============================================================
 * 시나리오 메타 — chip / 차트 풀이 라벨에 사용
 * ============================================================
 *
 * id            : chip id (= 분석 리포트의 category, 예: "lung_cancer")
 * label         : chip 라벨 (짧음)
 * sentenceLabel : 풀이 문장용 라벨 (예: "뇌혈관 질환")
 * incidence     : 나이별 누적 발병률. 분석 리포트가 아직 안 줘서 빈 배열.
 *                 차트가 length === 0 일 때 발병률 UI 통째 hide.
 */
export type ScenarioMeta = {
  id: string;
  label: string;
  sentenceLabel: string;
  incidence: number[];
};

/** ROI 차트의 한 점. age = 나이, roi = 누적 보험료 대비 회수 배율. */
export type RoiPoint = { age: number; roi: number };

/**
 * 해지 시 손실 곡선의 한 점.
 * loss = 그때까지 낸 보험료 − 해지환급금. 양수 = 손실 / 음수 = 이득.
 */
export type SurrenderLossPoint = { age: number; loss: number };

/**
 * 시나리오별 보장 항목 — 진단비 / 수술비 / 입원일당 등 항목 단위.
 *
 *   - label:          PDF 원문 그대로의 담보 이름
 *   - amount:         표시용 금액 문자열 ("5,000만원" / "월 200만원" / "1일 5만원")
 *   - insuredAmount:  원 단위 raw 금액. CoveragePanel total 합산 (ROI 분자와 일치).
 */
export type CoverageItem = {
  label: string;
  amount: string;
  insuredAmount?: number;
};

/**
 * 시나리오 모달의 한 row — `ScenarioModal` 이 받는 슬림 prop. 어느 버전이든
 * 자기 `select-scenarios` 가 ViewData 에서 이 모양을 derive 해서 모달에 넘김.
 *
 *   - coverageCount: 0 이면 그 row disabled (해당 시나리오를 보장 안 함).
 */
export type ScenarioPickerEntry = {
  category: string;
  coverageCount: number;
};

/* ============================================================
 * Multi-proposal 차트 (RoiChart / SurrenderLossChart) 가 받는 구조적 prop.
 *
 * 한 카드의 표시에 필요한 최소 필드만. 각 버전의 ViewData 가 이 모양을 satisfy
 * 하도록 만들면 차트는 그대로 동작.
 * ============================================================ */
export type ChartProposalView = {
  /** peers 배열 내 active 식별 / 곡선 키. */
  id: string;
  /** 강조 곡선 aria-label 등에 사용. */
  partner: { name: string };
  /** x 축 도메인 (만기까지). */
  maturityAge: number;
  /** 시나리오별 ROI 시계열 — chip 활성 시 lookup. */
  roi: Record<string, RoiPoint[]>;
  /** 해지 시 손실 곡선. */
  surrenderLoss: SurrenderLossPoint[];
  /** 시나리오별 담보 breakdown — CoveragePanel 에 노출. */
  coverage: Record<string, CoverageItem[]>;
};

/* ============================================================
 * ProposalMetricsCard 가 받는 슬림 prop — 핵심 수치 + 계약 구조 메트릭.
 *
 * 보험사 / 매월 납입료 / 납기 / 만기 / 환급 / 갱신 정책. 어느 버전 ViewData 든
 * 이 모양을 satisfy 하면 같은 카드 컴포넌트 재사용.
 * ============================================================ */
export type ProposalMetrics = {
  insurer: string;
  monthlyPremium: number;
  paymentYears: number;
  maturityAge: number;
  hasRefundDuringPayment: boolean;
  hasRenewableRider: boolean;
  /** 갱신형 담보가 있을 때 보험료 재산정 주기 (년). hasRenewableRider true 일 때만 의미. */
  renewalIntervalYears?: number;
};
