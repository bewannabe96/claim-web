import "server-only";

import { prisma } from "@/server/db/prisma";

import type {
  Partner,
  PartnerCard,
  PartnerSignupInvitation,
  PartnerSignupInvitationView,
} from "./schema";

const PARTNER_INCLUDE = {
  user: { select: { id: true, email: true, name: true, phone: true } },
  assignmentStats: true,
  creditBalance: { select: { balance: true, debt: true } },
} as const;

/**
 * 배정 후보 산출 — PRD §5.2.
 *
 * 필터:
 *   - active=true
 *   - creditBalance.balance >= requestPrice (자격 미달 partner 는 노출 자체 차단).
 *     debt 가 있어도 balance >= requestPrice 면 OK — 진행 중 거래 흐름은 차감 후
 *     balance=0 + debt 누적까지만 허용.
 *
 * 정렬 (멀티 키):
 *   1. assignmentStats.selectedCount ASC — 자기-균형화 (적게 선택된 설계사 우선)
 *   2. creditBalance.balance DESC — 베네핏 (잔액 많은 파트너 약한 우선순위)
 *   3. random jitter — 동점 tiebreak
 *
 * 풀이 작아 app-side ranking. 풀이 커지면 SQL window function 으로 이주.
 * stats / balance row 누락된 레거시 partner 는 `?? 0` 폴백 — 단, balance 0 인 경우
 * 필터에서 이미 걸러지므로 정상 흐름에선 도달 안 함 (시더 catch-all 이 보정).
 */
export async function findAssignmentCandidates(
  limit: number,
  requestPrice: number,
): Promise<PartnerCard[]> {
  const eligible = await prisma.partner.findMany({
    where: {
      active: true,
      creditBalance: { balance: { gte: requestPrice } },
    },
    include: {
      ...PARTNER_INCLUDE,
      creditBalance: { select: { balance: true } },
    },
    orderBy: { assignmentStats: { selectedCount: "asc" } },
  });

  return eligible
    .map((p) => ({ partner: p, jitter: Math.random() }))
    .sort((x, y) => {
      const xc = x.partner.assignmentStats?.selectedCount ?? 0;
      const yc = y.partner.assignmentStats?.selectedCount ?? 0;
      if (xc !== yc) return xc - yc;
      const xb = x.partner.creditBalance?.balance ?? 0;
      const yb = y.partner.creditBalance?.balance ?? 0;
      if (xb !== yb) return yb - xb;
      return x.jitter - y.jitter;
    })
    .slice(0, limit)
    .map(({ partner }) => toCard(partner));
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  return prisma.partner.findUnique({
    where: { id },
    include: PARTNER_INCLUDE,
  });
}

export async function getPartnerCardById(
  id: string,
): Promise<PartnerCard | null> {
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: PARTNER_INCLUDE,
  });
  return partner ? toCard(partner) : null;
}

/** ids 입력 순서 보존 — 후보 산출 정렬 결과가 그대로 노출되어야 함. */
export async function getPartnerCardsByIds(
  ids: readonly string[],
): Promise<PartnerCard[]> {
  if (ids.length === 0) return [];
  const partners = await prisma.partner.findMany({
    where: { id: { in: [...ids] } },
    include: PARTNER_INCLUDE,
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
    include: PARTNER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 어드민 — 미소비 가입 초청 목록. 최신 발급 순.
 *
 * consumedAt IS NOT NULL 은 audit 용도로 row 자체는 남지만 어드민 화면엔 노출 X
 * — 가입 완료된 설계사는 partner 리스트로 이동했으므로.
 */
export async function listPartnerSignupInvitations(): Promise<PartnerSignupInvitation[]> {
  return prisma.partnerSignupInvitation.findMany({
    where: { consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPartnerSignupInvitationById(
  id: string,
): Promise<PartnerSignupInvitation | null> {
  return prisma.partnerSignupInvitation.findUnique({ where: { id } });
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
 * `linkedAuthId` 는 view 에 포함 — verify 페이지의 "현재 Kakao 세션 vs 최신 lock 매칭"
 * 검증에 사용. signup 페이지는 항상 Step 1 부터 시작하므로 linkedAuthId 로 분기 안 함
 * (매 진입마다 새 OAuth 가 lock 을 덮어쓰는 모델).
 */
export async function getPartnerSignupInvitationByToken(
  token: string,
): Promise<PartnerSignupInvitationView | null> {
  const invitation = await prisma.partnerSignupInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      name: true,
      phone: true,
      expiresAt: true,
      consumedAt: true,
      linkedAuthId: true,
      existingUserId: true,
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
    isNew: (p.assignmentStats?.exposureCount ?? 0) === 0,
  };
}
