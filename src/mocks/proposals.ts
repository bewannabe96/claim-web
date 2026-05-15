import type {
  MatchAssignment,
  Proposal,
} from "@/features/proposals/schema";

/**
 * MVP — Server Action이 push/mutate하는 in-memory 스토어.
 * dev 서버 재시작 시 초기화.
 *
 * 시드: demo-req-001 (가입자 시드 요청) 에 대한 3명 설계사 제안서.
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
   * 제안서 제출 폼을 작성·제출해보면 status: submitted 로 전환되고 done 으로 redirect.
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
    pdfFileName: "kim_minsu_proposal.pdf",
    note: "비갱신 평생 동일 보험료. 암 진단금 5천만원에 균형을 맞췄어요.",
  },
  {
    id: "proposal-demo-002",
    assignmentId: "assign-demo-002",
    submittedAt: "2026-05-05T09:15:00.000Z",
    pdfFileName: "lee_jiyoung_proposal.pdf",
    note: "월 부담을 낮춘 갱신형. 핵심 보장 위주로 군더더기 없이 짰어요.",
  },
  {
    id: "proposal-demo-003",
    assignmentId: "assign-demo-003",
    submittedAt: "2026-05-05T14:48:00.000Z",
    pdfFileName: "jung_daehyun_proposal.pdf",
    note: "노후 자산화에 집중. 만기 환급이 가능한 종신·연금 결합형으로 구성했어요.",
  },
  // demo-req-002 → 이지영 설계사 제출분
  {
    id: "proposal-demo-005",
    assignmentId: "assign-demo-005",
    submittedAt: "2026-05-05T16:00:00.000Z",
    pdfFileName: "lee_jiyoung_child_proposal.pdf",
    note: "자녀 어린이 보장과 여성 질환을 한 증권에 묶어 부담을 낮췄어요.",
  },
  // demo-req-003 (analyzing) 제안서 2건
  {
    id: "proposal-demo-007",
    assignmentId: "assign-demo-007",
    submittedAt: "2026-05-05T20:00:00.000Z",
    pdfFileName: "jung_pension_a.pdf",
    note: "최저보증이율 2% 확정 연금에 사망보장 2억을 얹어 안정성을 강조했어요.",
  },
  {
    id: "proposal-demo-008",
    assignmentId: "assign-demo-008",
    submittedAt: "2026-05-06T01:30:00.000Z",
    pdfFileName: "kim_pension_b.pdf",
    note: "변액 + 최저보증으로 수익성과 안전을 절충, 연금 월 180만원을 노렸어요.",
  },
];
