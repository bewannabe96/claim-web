/**
 * 결과 페이지용 fixture — UI 우선 단계에서만 사용.
 *
 * AI 가 PDF 제안서를 파싱해 채워 줄 정형 데이터의 **예상 형태**.
 * schema 정합은 페이지 디자인 확정 후 features/proposals/ 로 흡수 예정.
 *
 * 3개 캐릭터로 비교 가능성 확보:
 *  - 김민수: 비갱신 종합형. 균형. 중간 보험료.
 *  - 이지영: 갱신 실속형. 보험료 낮고 보장 좁음. 청년/실속.
 *  - 정대현: 종신·연금 결합. 높은 환급 + 사망보장, 보험료 큼.
 */

import {
  FOCUSED_CONCERN_LABEL,
  type CoverageRequest,
  type FocusedConcernId,
} from "@/features/requests/schema";

export { FOCUSED_CONCERN_LABEL };
export type { CoverageRequest, FocusedConcernId };

/**
 * ROI 시나리오 메타 — 한 곳에서 시나리오 추가/수정 관리.
 * 회수 배율 chip pill / 발병률 area / 풀이 문장 모두 이 메타에서 derive.
 *
 *   - id            제안서 roi 키와 매칭
 *   - label         chip pill 라벨 (짧음)
 *   - sentenceLabel 풀이 문장용 라벨 (예: "뇌혈관 질환")
 *   - incidence     나이별 누적 발병률 (AGE_DOMAIN 과 동일 길이/순서)
 *
 * 시나리오 추가 = MOCK_SCENARIOS 배열에 entry 1개 + 각 proposal.roi 에 같은
 * id 의 시계열 추가. ROI 차트 컴포넌트는 무수정.
 */
export type ScenarioMeta = {
  id: string;
  label: string;
  sentenceLabel: string;
  incidence: number[];
};

export type RoiPoint = { age: number; roi: number };

/**
 * 해지 시 손실 곡선 — "아무 일 없이 해지하면 얼마 날리나" 시계열.
 * loss = 그때까지 낸 보험료 − 해지환급금. 단위 원.
 *
 * 양수 = 손실, 0 = 손익분기, 음수 = 환급이 납입을 넘어 이득.
 * 가입~만기 모든 나이에 대해 1년 단위로 계산.
 */
export type SurrenderLossPoint = { age: number; loss: number };

/**
 * 시나리오별 보장 항목 — 제안서가 해당 질병/사건에 대해 실제로 지급하는 금액.
 * 진단금/수술비/입원일당/재진단금/장기간병 등 항목별 분리.
 *
 * UI 에서 ROI 곡선 아래에 "이 시나리오에서 받는 보장" 으로 노출.
 *
 * 가입자 가독성을 위해 최소 필드만 유지:
 *   - label: 사람이 읽는 담보 이름 ("암 진단금")
 *   - amount: 표시용 금액 문자열 ("5,000만원" / "월 200만원" / "1일 5만원")
 *
 * 조건 (최초 1회, 회당, 일수 한도 등) 은 amount 문자열 안에 합쳐 표기.
 */
export type CoverageItem = {
  label: string;
  amount: string;
};

/* ============================================================
 * 요청 매칭 — 가입자가 선택한 concern 별 진설계 커버 여부
 * ============================================================
 *
 * 가입자는 요청서에서 CoverageRequest (broad | focused + concerns + other) 를
 * 제출. 결과 페이지는 선택된 concern 각각에 대해 진설계의 보장 항목 (CoverageItem[])
 * 이 존재하는지 노출.
 *
 *   - 커버됨: coverage[concern].length > 0  → 항목 리스트 표시
 *   - 미커버: coverage[concern].length === 0 → "이 진설계엔 ~ 보장이 없어요"
 *
 * 점수는 단순 분수: 커버된 concern 수 / 선택한 concern 수. 정직한 카운트만 노출,
 * % 가산점이나 부분 충족 같은 가중치는 두지 않음.
 *
 * broad intent 일 땐 매칭 섹션 자체를 그리지 않음 — 비교는 radar / ROI 위주.
 */

/**
 * 시나리오별 **누적 발병률** — "해당 나이까지 한 번이라도 발병했을 확률".
 * 모든 제안서에 공통 적용 (가입자 인구학적 데이터).
 * 정규화: 0~1 사이, 1.0 = 만기 시점 누적 발병 확률 상한.
 *
 * 누적은 monotonic non-decreasing — 시간이 지나며 환자 비율이 빠지지 않음.
 * S-curve (logistic) 로 근사: midAge 부근에서 가장 빠르게 증가, 양 끝은 평탄.
 *
 * 실 운영에선 AI 가 가입자 특성(성별/흡연/유전 등) 반영한 값 제공.
 */
function buildCumulativeIncidence(
  /** 누적 확률이 50% 에 도달하는 나이 (S-curve 중점) */
  midAge: number,
  /** 만기 시점 누적 상한 (0~1) — 질병별로 다름 */
  ceiling: number,
  /** S-curve 가파름 — 작을수록 완만, 클수록 급격 */
  steepness: number,
  ages: number[],
): number[] {
  return ages.map((age) => {
    const logistic = 1 / (1 + Math.exp(-(age - midAge) / steepness));
    return ceiling * logistic;
  });
}

export type ProposalData = {
  id: string;
  agent: {
    name: string;
    yearsOfExperience: number;
    trustMetric: string;
  };

  // 계약 컨텍스트
  insurer: string;               // 보험사명 (삼성생명/메리츠화재/교보생명 등)
  maturityAge: number;

  // 핵심 수치
  monthlyPremium: number;        // 매월 납입
  paymentYears: number;          // 납입기간 (년)

  // 구조 플래그 — "있음/없음" 으로 노출
  /** 납입기간 중 해지환급금이 존재하는지 */
  hasRefundDuringPayment: boolean;
  /** 제안서에 갱신형 담보가 하나라도 포함되어 있는지 */
  hasRenewableRider: boolean;
  /**
   * 갱신형 담보가 있을 때 보험료가 재산정되는 주기 (년). hasRenewableRider 가
   * true 일 때만 의미. 일반적으로 5/10/15 년. 결과 페이지에서 "X년마다 인상"
   * 풀이에 사용.
   */
  renewalIntervalYears?: number;

  // ROI — 시나리오별 누적 회수 배율 시계열. 키는 MOCK_SCENARIOS 의 id 와 매칭.
  roi: Record<string, RoiPoint[]>;

  // 해지 시 손실 시계열 — 모든 나이 동일 길이/index
  surrenderLoss: SurrenderLossPoint[];

  // 보장 영역별 항목 — 가입자 요청 매칭 + ROI 보장 상세 panel 양쪽에서 사용.
  // 키는 FocusedConcernId 또는 ScenarioMeta.id 의 어떤 string. 미커버 영역은
  // 빈 배열 또는 키 부재 (consumer 가 `?? []` 로 fallback).
  coverage: Record<string, CoverageItem[]>;

  // 메타
  note: string;
};

/* ============================================================
 * Helpers — ROI 시뮬레이션
 * ============================================================
 *
 * MVP: AI 가 정확한 곡선을 줄 예정. 여기선 단순 모델로 시계열 생성:
 *   - 특정 나이대에 큰 진단 → 누적 수령 점프
 *   - 그 이후 매년 입원 등 추가 지급
 *   - 만기 시점에 환급금 지급 (만기 환급형) 또는 0 (순수보장형)
 *
 * 곡선 모양만 그럴듯하면 UI 검증엔 충분. 실 AI 데이터로 교체할 때
 * shape 만 같으면 됨.
 */

function buildRoi(
  startAge: number,
  endAge: number,
  monthlyPremium: number,
  /** 진단 발생 나이 (큰 진단금 지급) */
  diagnosisAge: number,
  diagnosisPayout: number,
  /** 그 이후 매년 입원 등 추가 지급 평균 */
  yearlyAfterDiagnosis: number,
  finalRefund: number,
): RoiPoint[] {
  const points: RoiPoint[] = [];
  let cumulativeReceived = 0;
  for (let age = startAge; age <= endAge; age++) {
    const paidSoFar = monthlyPremium * 12 * (age - startAge);
    if (age === diagnosisAge) cumulativeReceived += diagnosisPayout;
    if (age > diagnosisAge) cumulativeReceived += yearlyAfterDiagnosis;
    if (age === endAge) cumulativeReceived += finalRefund;
    const roi = paidSoFar > 0 ? cumulativeReceived / paidSoFar : 0;
    points.push({ age, roi: round2(roi) });
  }
  return points;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 해지 시 손실 시계열 생성 — 그때까지 낸 보험료 − 해지환급금.
 *
 * 환급금 단순 모델:
 *   - 가입~납입 종료: 0 → (납입액 × surrenderRateAtPayEnd) 로 누적, 사업비 영향
 *     반영을 위해 progress^1.6 의 eased 곡선
 *   - 납입 종료~만기: surrenderRateAtPayEnd → finalRefundRate 로 선형 보간
 *
 * 손실 = paid − refund. finalRefundRate > 1 (만기 환급 100%+) 이면 만기 근처
 * 에서 음수가 되어 "이득" 영역 진입.
 */
function buildSurrenderLoss(
  startAge: number,
  endAge: number,
  monthlyPremium: number,
  paymentYears: number,
  /** 납입기간 종료 시 환급률 (납입액 대비, 0~1) */
  surrenderRateAtPayEnd: number,
  /** 만기 환급률 (납입액 대비, 0+). >1 이면 만기에 이득. */
  finalRefundRate: number,
): SurrenderLossPoint[] {
  const points: SurrenderLossPoint[] = [];
  const paymentEndAge = startAge + paymentYears;
  const totalPaid = monthlyPremium * 12 * paymentYears;

  for (let age = startAge; age <= endAge; age++) {
    const yearsPaid = Math.min(age - startAge, paymentYears);
    const paid = monthlyPremium * 12 * Math.max(0, yearsPaid);

    let refund: number;
    if (age <= startAge) {
      refund = 0;
    } else if (age <= paymentEndAge) {
      // 납입 중 — 사업비 영향으로 초반 환급률 낮음
      const progress = (age - startAge) / paymentYears;
      refund = Math.pow(progress, 1.6) * surrenderRateAtPayEnd * totalPaid;
    } else {
      // 납입 종료 후 — 만기 환급률로 선형 보간
      const remaining = (age - paymentEndAge) / (endAge - paymentEndAge);
      const startVal = surrenderRateAtPayEnd * totalPaid;
      const endVal = finalRefundRate * totalPaid;
      refund = startVal + (endVal - startVal) * remaining;
    }

    points.push({ age, loss: Math.round(paid - refund) });
  }
  return points;
}

/* ============================================================
 * 시드 데이터
 * ============================================================ */

const CUSTOMER_AGE = 33;
const MATURITY_AGE = 100;

/** age 도메인 — 모든 시계열이 동일 길이/index 가정 */
const AGE_DOMAIN: number[] = Array.from(
  { length: MATURITY_AGE - CUSTOMER_AGE + 1 },
  (_, i) => CUSTOMER_AGE + i,
);

/**
 * ROI 시나리오 정의 — 차트 chip pill / 발병률 area / 풀이 라벨이 이 배열에서
 * 모두 derive. 시나리오 추가/제거는 여기서만.
 *
 * incidence: midAge (S-curve 중점) / ceiling (만기 누적 상한) / steepness (가파름).
 */
export const MOCK_SCENARIOS: ScenarioMeta[] = [
  {
    id: "cancer",
    label: "암",
    sentenceLabel: "암",
    incidence: buildCumulativeIncidence(68, 0.45, 8, AGE_DOMAIN),
  },
  {
    id: "cerebro",
    label: "뇌혈관",
    sentenceLabel: "뇌혈관 질환",
    incidence: buildCumulativeIncidence(74, 0.25, 9, AGE_DOMAIN),
  },
  {
    id: "cardio",
    label: "심혈관",
    sentenceLabel: "심혈관 질환",
    incidence: buildCumulativeIncidence(70, 0.3, 9, AGE_DOMAIN),
  },
];

/**
 * 가입자 요청 — 모든 제안서 매칭의 기준이 되는 페이지 레벨 데이터.
 * 실 운영에선 plan_request.coverage (jsonb) 그대로.
 *
 * 시드 시나리오: focused 의도 + 3개 concern 선택 + 자유 텍스트 보조.
 * 점수 분기 유도 → 김민수 2/3, 이지영 1/3, 정대현 3/3.
 */
export const MOCK_CUSTOMER_COVERAGE: CoverageRequest = {
  intent: "focused",
  concerns: ["cancer", "death", "longterm"],
};

export const MOCK_PROPOSALS: ProposalData[] = [
  /* 김민수 — 비갱신 종합형, 균형 */
  {
    id: "proposal-a",
    agent: {
      name: "김민수",
      yearsOfExperience: 12,
      trustMetric: "고객 96%가 계속 함께해요",
    },
    insurer: "삼성생명",
    maturityAge: MATURITY_AGE,
    monthlyPremium: 158000,
    paymentYears: 20,
    hasRefundDuringPayment: true,
    hasRenewableRider: false,
    // 김민수: 암 5천 + 뇌·심혈관 1.5천씩 + 입원/사망 균형
    roi: {
      cancer: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 158000, 55, 50_000_000, 0, 0),
      cerebro: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 158000, 62, 15_000_000, 0, 0),
      cardio: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 158000, 58, 15_000_000, 0, 0),
    },
    // 비갱신 종합 — 납입기간 중 환급금 점차 누적 (~55%), 만기엔 보장비로 소진되어 0
    surrenderLoss: buildSurrenderLoss(CUSTOMER_AGE, MATURITY_AGE, 158000, 20, 0.55, 0),
    coverage: {
      cancer: [
        { label: "암 진단금", amount: "5,000만원" },
        { label: "수술비", amount: "300만원" },
        { label: "입원일당", amount: "1일 5만원" },
      ],
      cerebro: [
        { label: "뇌혈관 진단금", amount: "1,500만원" },
        { label: "수술비", amount: "200만원" },
      ],
      cardio: [
        { label: "심혈관 진단금", amount: "1,500만원" },
        { label: "수술비", amount: "200만원" },
      ],
      dental: [],
      hospitalization: [
        { label: "입원일당", amount: "1일 5만원" },
      ],
      death: [{ label: "일반 사망보장", amount: "5,000만원" }],
      disability: [
        { label: "장해 진단금", amount: "3,000만원" },
      ],
      longterm: [],
      surgery: [
        { label: "수술비", amount: "300만원" },
      ],
    },
    note: "건강 + 종신 결합형. 비갱신으로 평생 동일 보험료. 30대 가입 시 가장 유리한 구조입니다.",
  },

  /* 이지영 — 갱신 실속형, 저렴 */
  {
    id: "proposal-b",
    agent: {
      name: "이지영",
      yearsOfExperience: 8,
      trustMetric: "설명 꼼꼼도 업계 상위 5%",
    },
    insurer: "메리츠화재",
    maturityAge: MATURITY_AGE,
    monthlyPremium: 124000,
    paymentYears: 30,
    hasRefundDuringPayment: false,
    hasRenewableRider: true,
    renewalIntervalYears: 10,
    // 이지영: 실속형. 암 3천 + 입원일당 위주. 뇌·심혈관은 작게.
    roi: {
      cancer: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 124000, 55, 30_000_000, 0, 0),
      cerebro: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 124000, 62, 2_500_000, 400_000, 0),
      cardio: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 124000, 58, 2_500_000, 400_000, 0),
    },
    // 갱신형 실속 — 환급금 거의 없음. 손실 곡선 단조 우상향.
    surrenderLoss: buildSurrenderLoss(CUSTOMER_AGE, MATURITY_AGE, 124000, 30, 0.05, 0),
    coverage: {
      cancer: [
        { label: "암 진단금", amount: "3,000만원" },
        { label: "수술비", amount: "100만원" },
      ],
      cerebro: [
        { label: "뇌혈관 진단금", amount: "250만원" },
      ],
      cardio: [
        { label: "심혈관 진단금", amount: "250만원" },
      ],
      dental: [],
      hospitalization: [
        { label: "입원일당", amount: "1일 5만원" },
        { label: "통원의료비", amount: "회당 5만원" },
      ],
      death: [],
      disability: [],
      longterm: [],
      surgery: [
        { label: "수술비", amount: "100만원" },
      ],
    },
    note: "월 부담을 낮춘 갱신형 구성. 핵심 보장 위주로 군더더기 없이 짰어요.",
  },

  /* 정대현 — 종신·연금 결합, 환급 강조 */
  {
    id: "proposal-c",
    agent: {
      name: "정대현",
      yearsOfExperience: 20,
      trustMetric: "한 곳에서 20년째 고객 관리",
    },
    insurer: "교보생명",
    maturityAge: MATURITY_AGE,
    monthlyPremium: 192000,
    paymentYears: 25,
    hasRefundDuringPayment: true,
    hasRenewableRider: false,
    // 정대현: 암 1억 + LTC 월 200만 + 사망보장 큰 + 만기 환급 큰 비율.
    // 큰 진단이 없어도 만기 환급 덕분에 종착점 위로 올라감.
    roi: {
      cancer: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 192000, 55, 100_000_000, 0, 192000 * 12 * 25 * 0.5),
      cerebro: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 192000, 62, 10_000_000, 0, 192000 * 12 * 25 * 0.9),
      cardio: buildRoi(CUSTOMER_AGE, MATURITY_AGE, 192000, 58, 10_000_000, 0, 192000 * 12 * 25 * 0.9),
    },
    // 종신·연금 만기 환급 110% — 손실 곡선이 만기 직전에 0 아래 (이득 영역) 로 진입
    surrenderLoss: buildSurrenderLoss(CUSTOMER_AGE, MATURITY_AGE, 192000, 25, 0.65, 1.1),
    coverage: {
      cancer: [
        { label: "암 진단금", amount: "1억원" },
        { label: "암 재진단금", amount: "5,000만원" },
        { label: "수술비", amount: "500만원" },
      ],
      cerebro: [
        { label: "뇌혈관 진단금", amount: "1,000만원" },
        { label: "수술비", amount: "300만원" },
      ],
      cardio: [
        { label: "심혈관 진단금", amount: "1,000만원" },
        { label: "수술비", amount: "300만원" },
      ],
      dental: [],
      hospitalization: [
        { label: "입원일당", amount: "1일 5만원" },
      ],
      death: [
        { label: "일반 사망보장", amount: "1억원" },
        { label: "재해 사망 추가", amount: "1억원" },
      ],
      disability: [
        { label: "장해 진단금", amount: "5,000만원" },
      ],
      longterm: [
        { label: "장기간병 (LTC)", amount: "월 200만원" },
        { label: "간병인 사용일당", amount: "1일 8만원" },
      ],
      surgery: [
        { label: "수술비", amount: "500만원" },
      ],
    },
    note: "20년 경력으로 자산 보호와 노후를 한번에 풀어내는 구성. 만기 환급이 가능해 장기 자산화 측면도 챙겼습니다.",
  },
];

