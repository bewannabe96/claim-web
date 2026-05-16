import "server-only";

import { prisma } from "@/server/db/prisma";

import type { Partner, PartnerCard } from "./schema";

/**
 * 매칭 후보 추출 — PRD §5.2.
 *
 * 필터: active=true.
 * 정렬: 누적 노출 적은 순 → 미제출률 낮은 순 → 랜덤.
 * 미제출률은 recentSubmissions (boolean[]) 의 false 비율로 계산.
 *
 * 풀이 작아 app-side ranking. 풀이 커지면 SQL window function 으로 이주.
 */
export async function findMatchCandidates(
  limit: number,
): Promise<PartnerCard[]> {
  const eligible = await prisma.partner.findMany({
    where: { active: true },
    orderBy: { exposureCount: "asc" },
  });

  return eligible
    .map((p) => ({
      partner: p,
      miss: missRate(p.recentSubmissions),
      jitter: Math.random(),
    }))
    .sort((x, y) => {
      if (x.partner.exposureCount !== y.partner.exposureCount) {
        return x.partner.exposureCount - y.partner.exposureCount;
      }
      if (x.miss !== y.miss) return x.miss - y.miss;
      return x.jitter - y.jitter;
    })
    .slice(0, limit)
    .map(({ partner }) => toCard(partner));
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  return prisma.partner.findUnique({ where: { id } });
}

export async function getPartnerCardById(
  id: string,
): Promise<PartnerCard | null> {
  const partner = await prisma.partner.findUnique({ where: { id } });
  return partner ? toCard(partner) : null;
}

/** ids 입력 순서 보존 — 매칭 정렬 결과가 그대로 노출되어야 함. */
export async function getPartnerCardsByIds(
  ids: readonly string[],
): Promise<PartnerCard[]> {
  if (ids.length === 0) return [];
  const partners = await prisma.partner.findMany({
    where: { id: { in: [...ids] } },
  });
  const byId = new Map(partners.map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is Partner => !!p)
    .map(toCard);
}

/** 어드민 — 전체 풀 (운영 필드 포함). 최신 등록 순. */
export async function listAllPartners(): Promise<Partner[]> {
  return prisma.partner.findMany({ orderBy: { createdAt: "desc" } });
}

function toCard(p: Partner): PartnerCard {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    bio: p.bio,
    yearsOfExperience: p.yearsOfExperience,
    trustMetric: p.trustMetric,
    isNew: p.exposureCount === 0,
  };
}

function missRate(submissions: boolean[]): number {
  if (submissions.length === 0) return 0;
  const misses = submissions.filter((s) => !s).length;
  return misses / submissions.length;
}
