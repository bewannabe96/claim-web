import "server-only";

import { MOCK_AGENTS } from "@/mocks/agents";
import type { InsuranceCategory } from "@/types";

import type { Agent, AgentCard } from "./schema";

/**
 * 매칭 후보 추출 — PRD §5.2.
 *
 * 필터: 활성 상태 + 전문보험에 요청 카테고리 1개 이상 일치
 * 정렬: 누적 노출 적은 순 → 미제출률 낮은 순 → 랜덤
 *
 * 카드 뷰만 반환 (운영 필드 노출 차단).
 */
export async function findMatchCandidates(
  categories: InsuranceCategory[],
  limit: number,
): Promise<AgentCard[]> {
  const eligible = MOCK_AGENTS.filter(
    (a) => a.active && a.specialties.some((s) => categories.includes(s)),
  );

  const ranked = eligible
    .map((a) => ({
      agent: a,
      missRate: missRate(a),
      jitter: Math.random(),
    }))
    .sort((x, y) => {
      if (x.agent.exposureCount !== y.agent.exposureCount) {
        return x.agent.exposureCount - y.agent.exposureCount;
      }
      if (x.missRate !== y.missRate) {
        return x.missRate - y.missRate;
      }
      return x.jitter - y.jitter;
    })
    .slice(0, limit)
    .map(({ agent }) => toCard(agent));

  return ranked;
}

export async function getAgentById(id: string): Promise<Agent | null> {
  return MOCK_AGENTS.find((a) => a.id === id) ?? null;
}

export async function getAgentCardById(id: string): Promise<AgentCard | null> {
  const agent = MOCK_AGENTS.find((a) => a.id === id);
  return agent ? toCard(agent) : null;
}

export async function getAgentCardsByIds(
  ids: readonly string[],
): Promise<AgentCard[]> {
  // 입력 ids 순서를 보존 — 매칭 정렬 결과가 그대로 노출되어야 함
  return ids
    .map((id) => MOCK_AGENTS.find((a) => a.id === id))
    .filter((a): a is Agent => !!a)
    .map(toCard);
}

/** 어드민 — 풀 전체 조회 (운영 필드 포함) */
export async function listAllAgents(): Promise<Agent[]> {
  return MOCK_AGENTS;
}

function toCard(a: Agent): AgentCard {
  return {
    id: a.id,
    name: a.name,
    avatarUrl: a.avatarUrl,
    specialties: a.specialties,
    bio: a.bio,
    yearsOfExperience: a.yearsOfExperience,
    trustMetric: a.trustMetric,
    isNew: a.exposureCount === 0,
  };
}

function missRate(a: Agent): number {
  if (a.recentSubmissions.length === 0) return 0;
  const misses = a.recentSubmissions.filter((s) => !s).length;
  return misses / a.recentSubmissions.length;
}
