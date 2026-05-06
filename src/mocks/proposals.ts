import type {
  MatchAssignment,
  Proposal,
} from "@/features/proposals/schema";

/**
 * MVP — Server Action이 push/mutate하는 in-memory 스토어.
 * dev 서버 재시작 시 초기화.
 *
 * 시드: demo-req-001 (가입자 시드 요청) 에 대한 3명 설계사 진설계.
 * 가격/보장 의도적으로 다양화 — 결과 화면 비교 UX 검증용.
 */
export const MOCK_ASSIGNMENTS: MatchAssignment[] = [
  {
    id: "assign-demo-001",
    requestId: "demo-req-001",
    agentId: "agent-001",
    token: "tok-demo-001",
    status: "submitted",
    createdAt: "2026-05-04T10:05:00.000Z",
    submittedAt: "2026-05-04T18:30:00.000Z",
    proposalId: "proposal-demo-001",
  },
  {
    id: "assign-demo-002",
    requestId: "demo-req-001",
    agentId: "agent-002",
    token: "tok-demo-002",
    status: "submitted",
    createdAt: "2026-05-04T10:05:00.000Z",
    submittedAt: "2026-05-05T09:15:00.000Z",
    proposalId: "proposal-demo-002",
  },
  {
    id: "assign-demo-003",
    requestId: "demo-req-001",
    agentId: "agent-005",
    token: "tok-demo-003",
    status: "submitted",
    createdAt: "2026-05-04T10:05:00.000Z",
    submittedAt: "2026-05-05T14:48:00.000Z",
    proposalId: "proposal-demo-003",
  },
  /**
   * 설계사 시점 데모 — pending. 토큰: `tok-demo-pending`.
   * 진설계 제출 폼을 작성·제출해보면 status: submitted 로 전환되고 done 으로 redirect.
   * dev 서버 재시작 시 다시 pending 으로 초기화.
   */
  {
    id: "assign-demo-004",
    requestId: "demo-req-002",
    agentId: "agent-008",
    token: "tok-demo-pending",
    status: "pending",
    createdAt: "2026-05-04T22:05:00.000Z",
  },
  // demo-req-002 의 나머지 두 명 — 1명 제출, 1명 미제출
  {
    id: "assign-demo-005",
    requestId: "demo-req-002",
    agentId: "agent-002",
    token: "tok-demo-005",
    status: "submitted",
    createdAt: "2026-05-04T22:05:00.000Z",
    submittedAt: "2026-05-05T16:00:00.000Z",
    proposalId: "proposal-demo-005",
  },
  {
    id: "assign-demo-006",
    requestId: "demo-req-002",
    agentId: "agent-006",
    token: "tok-demo-006",
    status: "pending",
    createdAt: "2026-05-04T22:05:00.000Z",
  },
  // demo-req-003 (analyzing) — K=2 전원 제출
  {
    id: "assign-demo-007",
    requestId: "demo-req-003",
    agentId: "agent-005",
    token: "tok-demo-007",
    status: "submitted",
    createdAt: "2026-05-05T08:05:00.000Z",
    submittedAt: "2026-05-05T20:00:00.000Z",
    proposalId: "proposal-demo-007",
  },
  {
    id: "assign-demo-008",
    requestId: "demo-req-003",
    agentId: "agent-001",
    token: "tok-demo-008",
    status: "submitted",
    createdAt: "2026-05-05T08:05:00.000Z",
    submittedAt: "2026-05-06T01:30:00.000Z",
    proposalId: "proposal-demo-008",
  },
  // demo-req-004 (rematching) — K=2 모두 expired (0명 제출)
  {
    id: "assign-demo-009",
    requestId: "demo-req-004",
    agentId: "agent-003",
    token: "tok-demo-009",
    status: "expired",
    createdAt: "2026-05-04T15:05:00.000Z",
  },
  {
    id: "assign-demo-010",
    requestId: "demo-req-004",
    agentId: "agent-007",
    token: "tok-demo-010",
    status: "expired",
    createdAt: "2026-05-04T15:05:00.000Z",
  },
];

export const MOCK_PROPOSALS: Proposal[] = [
  {
    id: "proposal-demo-001",
    assignmentId: "assign-demo-001",
    submittedAt: "2026-05-04T18:30:00.000Z",
    monthlyPremium: 158000,
    paymentYears: 20,
    totalCoverage: 300000000,
    keyBenefit1: "암 진단 5,000만원",
    keyBenefit2: "뇌·심혈관 3,000만원",
    keyBenefit3: "수술비 회당 200만원",
    renewalType: "non_renewable",
    refundType: "no_refund",
    pdfFileName: "kim_minsu_proposal.pdf",
    note: "건강 + 종신 결합형. 비갱신으로 평생 동일 보험료 유지가 강점입니다. 30대에 가입하실 때 가장 유리한 구조예요.",
  },
  {
    id: "proposal-demo-002",
    assignmentId: "assign-demo-002",
    submittedAt: "2026-05-05T09:15:00.000Z",
    monthlyPremium: 124000,
    paymentYears: 30,
    totalCoverage: 250000000,
    keyBenefit1: "실손 의료비 일반 5천만원",
    keyBenefit2: "암 진단 3,000만원",
    keyBenefit3: "입원일당 5만원",
    renewalType: "renewable",
    refundType: "no_refund",
    pdfFileName: "lee_jiyoung_proposal.pdf",
    note: "월 부담을 낮춘 갱신형 구성. 핵심 보장 위주로 군더더기 없이 짰어요.",
  },
  {
    id: "proposal-demo-003",
    assignmentId: "assign-demo-003",
    submittedAt: "2026-05-05T14:48:00.000Z",
    monthlyPremium: 192000,
    paymentYears: 25,
    totalCoverage: 500000000,
    keyBenefit1: "종신 사망보장 3억원",
    keyBenefit2: "암 진단 1억원",
    keyBenefit3: "장기간병 LTC 월 200만원",
    renewalType: "non_renewable",
    refundType: "maturity_refund",
    pdfFileName: "jung_daehyun_proposal.pdf",
    note: "20년 경력으로 자산 보호와 노후를 한번에 풀어내는 구성을 준비했습니다. 만기 환급이 가능해 장기 자산화 측면도 챙겼습니다.",
  },
  // demo-req-002 → 이지영 설계사 제출분
  {
    id: "proposal-demo-005",
    assignmentId: "assign-demo-005",
    submittedAt: "2026-05-05T16:00:00.000Z",
    monthlyPremium: 78000,
    paymentYears: 20,
    totalCoverage: 100000000,
    keyBenefit1: "어린이 입원일당 5만원",
    keyBenefit2: "여성 암 진단 2,000만원",
    keyBenefit3: "후유장해 1억원",
    renewalType: "renewable",
    refundType: "no_refund",
    pdfFileName: "lee_jiyoung_child_proposal.pdf",
    note: "어린이/여성 보장을 한번에 묶어 부담 없이 구성했어요.",
  },
  // demo-req-003 (analyzing) 진설계 2건
  {
    id: "proposal-demo-007",
    assignmentId: "assign-demo-007",
    submittedAt: "2026-05-05T20:00:00.000Z",
    monthlyPremium: 248000,
    paymentYears: 20,
    totalCoverage: 350000000,
    keyBenefit1: "연금 월 150만원",
    keyBenefit2: "사망보장 2억",
    keyBenefit3: "최저보증이율 2%",
    renewalType: "non_renewable",
    refundType: "maturity_refund",
    pdfFileName: "jung_pension_a.pdf",
  },
  {
    id: "proposal-demo-008",
    assignmentId: "assign-demo-008",
    submittedAt: "2026-05-06T01:30:00.000Z",
    monthlyPremium: 282000,
    paymentYears: 25,
    totalCoverage: 400000000,
    keyBenefit1: "연금 월 180만원",
    keyBenefit2: "사망보장 2.5억",
    keyBenefit3: "변액형 + 최저보증",
    renewalType: "non_renewable",
    refundType: "maturity_refund",
    pdfFileName: "kim_pension_b.pdf",
  },
];
