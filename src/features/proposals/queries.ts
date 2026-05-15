import "server-only";

import { getAgentCardsByIds } from "@/features/agents/queries";
import type { AgentCard } from "@/features/agents/schema";
import { MOCK_ASSIGNMENTS, MOCK_PROPOSALS } from "@/mocks/proposals";

import type { MatchAssignment, Proposal } from "./schema";

/** 결과 페이지에서 카드 1개를 그릴 때 필요한 모든 정보 */
export type ProposalCard = {
  proposal: Proposal;
  agent: AgentCard;
};

export async function getAssignmentByToken(
  token: string,
): Promise<MatchAssignment | null> {
  return MOCK_ASSIGNMENTS.find((a) => a.token === token) ?? null;
}

export async function getAssignmentById(
  id: string,
): Promise<MatchAssignment | null> {
  return MOCK_ASSIGNMENTS.find((a) => a.id === id) ?? null;
}

export async function listAssignmentsForRequest(
  requestId: string,
): Promise<MatchAssignment[]> {
  return MOCK_ASSIGNMENTS.filter((a) => a.requestId === requestId);
}

export async function listAssignmentsForAgent(
  agentId: string,
): Promise<MatchAssignment[]> {
  return MOCK_ASSIGNMENTS.filter((a) => a.agentId === agentId).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function listSubmittedProposalsForRequest(
  requestId: string,
): Promise<Proposal[]> {
  const assignments = MOCK_ASSIGNMENTS.filter(
    (a) => a.requestId === requestId && a.status === "submitted",
  );
  const ids = new Set(assignments.map((a) => a.proposalId).filter(Boolean));
  return MOCK_PROPOSALS.filter((p) => ids.has(p.id));
}

export async function getProposalById(id: string): Promise<Proposal | null> {
  return MOCK_PROPOSALS.find((p) => p.id === id) ?? null;
}

/**
 * 어드민 요청 상세 화면용 — 모든 assignment 와 그 작성자/제안서 정보를 합쳐 반환.
 * pending/submitted/expired 모두 포함. 가입자 결과 페이지(`listProposalCardsForRequest`)
 * 와 달리 운영자는 미제출 케이스도 봐야 함.
 */
export type AssignmentDetail = {
  assignment: MatchAssignment;
  agent: AgentCard;
  proposal: Proposal | null;
};

export async function listAssignmentDetailsForRequest(
  requestId: string,
): Promise<AssignmentDetail[]> {
  const assignments = MOCK_ASSIGNMENTS.filter((a) => a.requestId === requestId);
  const agents = await getAgentCardsByIds(assignments.map((a) => a.agentId));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  return assignments
    .map((assignment) => {
      const agent = agentById.get(assignment.agentId);
      if (!agent) return null;
      const proposal = assignment.proposalId
        ? (MOCK_PROPOSALS.find((p) => p.id === assignment.proposalId) ?? null)
        : null;
      return { assignment, agent, proposal };
    })
    .filter((d): d is AssignmentDetail => d !== null)
    .sort((a, b) =>
      a.assignment.createdAt.localeCompare(b.assignment.createdAt),
    );
}

/**
 * 결과 페이지용 — 제출된 제안서와 작성 설계사 카드 정보를 함께 반환.
 * 정렬: 제출이 빠른 순 (먼저 도착한 게 먼저 보이도록).
 */
export async function listProposalCardsForRequest(
  requestId: string,
): Promise<ProposalCard[]> {
  const submitted = MOCK_ASSIGNMENTS.filter(
    (a) => a.requestId === requestId && a.status === "submitted",
  ).sort((a, b) =>
    (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
  );

  const agentIds = submitted.map((a) => a.agentId);
  const agents = await getAgentCardsByIds(agentIds);
  const agentById = new Map(agents.map((a) => [a.id, a]));

  return submitted
    .map((assignment) => {
      const proposal = MOCK_PROPOSALS.find((p) => p.id === assignment.proposalId);
      const agent = agentById.get(assignment.agentId);
      if (!proposal || !agent) return null;
      return { proposal, agent };
    })
    .filter((c): c is ProposalCard => c !== null);
}
