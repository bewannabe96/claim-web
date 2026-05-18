import "server-only";

import { prisma } from "@/server/db/prisma";

import type {
  Partner,
  PartnerCard,
  PartnerInvitation,
  PartnerInvitationView,
} from "./schema";

const USER_SELECT = {
  user: { select: { id: true, email: true, name: true, phone: true } },
} as const;

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
    include: USER_SELECT,
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
  return prisma.partner.findUnique({
    where: { id },
    include: USER_SELECT,
  });
}

export async function getPartnerCardById(
  id: string,
): Promise<PartnerCard | null> {
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: USER_SELECT,
  });
  return partner ? toCard(partner) : null;
}

/** ids 입력 순서 보존 — 매칭 정렬 결과가 그대로 노출되어야 함. */
export async function getPartnerCardsByIds(
  ids: readonly string[],
): Promise<PartnerCard[]> {
  if (ids.length === 0) return [];
  const partners = await prisma.partner.findMany({
    where: { id: { in: [...ids] } },
    include: USER_SELECT,
  });
  const byId = new Map(partners.map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is Partner => !!p)
    .map(toCard);
}

/** 어드민 — 전체 풀 (운영 필드 포함). 최신 등록 순. */
export async function listAllPartners(): Promise<Partner[]> {
  return prisma.partner.findMany({
    include: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 어드민 — 미소비 가입 초청 목록. 최신 발급 순.
 *
 * consumedAt IS NOT NULL 은 audit 용도로 row 자체는 남지만 어드민 화면엔 노출 X
 * — 가입 완료된 설계사는 partner 리스트로 이동했으므로.
 */
export async function listPartnerInvitations(): Promise<PartnerInvitation[]> {
  return prisma.partnerInvitation.findMany({
    where: { consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPartnerInvitationById(
  id: string,
): Promise<PartnerInvitation | null> {
  return prisma.partnerInvitation.findUnique({ where: { id } });
}

/**
 * 가입 페이지용 — token 으로 미소비 + 미만료 invitation 조회.
 *
 * 다음 케이스 모두 null 반환:
 *   - token 미존재 (오타 / 회전된 구 토큰)
 *   - 이미 소비됨 (consumedAt IS NOT NULL)
 *   - 만료됨 (expiresAt < now)
 *
 * 호출자는 null 만으로 분기 — 어느 사유인지는 의도적으로 가리지 않음 (열거 방지).
 * `phoneVerifiedAt` 은 view 에 포함 — 페이지가 본인인증 단계 vs Kakao 가입 단계 분기.
 */
export async function getPartnerInvitationByToken(
  token: string,
): Promise<PartnerInvitationView | null> {
  const invitation = await prisma.partnerInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      name: true,
      phone: true,
      expiresAt: true,
      consumedAt: true,
      phoneVerifiedAt: true,
    },
  });
  if (!invitation) return null;
  if (invitation.consumedAt) return null;
  if (invitation.expiresAt.getTime() < Date.now()) return null;
  return invitation;
}

function toCard(p: Partner): PartnerCard {
  return {
    id: p.id,
    name: p.user.name,
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
