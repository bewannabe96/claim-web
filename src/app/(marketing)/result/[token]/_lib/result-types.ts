/**
 * 결과 페이지 컴포넌트들이 공유하는 데이터 shape 정의.
 *
 * adapt-proposal.ts 가 실 데이터 (Proposal + 분석 리포트) → ProposalData 로
 * 변환하면, 차트/카드 컴포넌트가 이 type 기준으로 그림. 차트 컴포넌트의 prop
 * 시그니처가 이 타입에 강결합돼 있어 별도 type 모듈로 추출.
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
 * 결과 페이지 한 제안서 카드의 전체 shape. adapt-proposal 이 채움.
 */
export type ProposalData = {
  id: string;
  partner: {
    name: string;
    yearsOfExperience: number;
    trustMetric: string;
  };

  /**
   * 분석 파이프라인 콜백 수신 여부 (proposal.analyzedAt 기반).
   * false 면 차트/수치 필드는 fallback 값이고 UI 는 "분석 중" placeholder 로 그림.
   */
  analyzed: boolean;

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

  // 설계사 한줄평
  note: string;
};
