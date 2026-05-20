import "server-only";

import { prisma } from "@/server/db/prisma";

import type { PriceTier } from "./schema";

/**
 * 가격 tier 조회 — Server Component / Server Action 에서만.
 *
 * 운영 규모: 보통 수십 row 미만 — full scan, no cache. 향후 admin 페이지 트래픽이
 * 늘면 short-lived in-memory cache 검토.
 */

/**
 * 사용자 budget 에 적용할 가격 조회 — budgetMin 을 포함하는 tier.
 *
 * 정상 흐름: step1-wizard chip 은 listPriceTiers() 의 row 에서 만들어지므로 정확
 * 매칭이 항상 성립. 하지만 다음 케이스에서도 견고해야 함:
 *
 *   1. Race — 페이지 로드 후 admin 이 tier 를 삭제/재구성. submit 시점엔 구 범위
 *      가 DB 에 없을 수 있음.
 *   2. 레거시 클라이언트 — 캐시/CDN 로 옛 chip 을 보고 있는 사용자.
 *   3. 운영 중 범위 조정 — admin 이 (5만, 10만) 을 (4만, 9만) 으로 슬쩍 옮긴 경우.
 *
 * 그래서 정확 매칭 대신 "사용자 budgetMin 을 포함하는 tier" 를 찾음. tier 들은
 * 운영상 비중첩이라 매칭은 유일. 매칭 실패 시 사용자 min 이하인 가장 큰 tier 로
 * fallback (open-ended 마지막 tier 가 cover). 둘 다 실패하면 throw.
 *
 * budgetMax 는 사용 안 함 — chip 단위가 단일 가격 buckets 이므로 min 한 점이면
 * 충분. budgetMax 까지 봐서 더 엄격하게 막으면 admin 이 범위를 옮긴 직후 race 가
 * 곧장 throw 로 이어져 사용자 경험만 나빠짐.
 */
export async function getPriceForBudget(budgetMin: number): Promise<number> {
  const tier = await prisma.planRequestPriceTier.findFirst({
    where: {
      budgetMin: { lte: budgetMin },
      budgetMax: { gte: budgetMin },
    },
    orderBy: { position: "asc" },
    select: { price: true },
  });
  if (tier) return tier.price;

  const nearest = await prisma.planRequestPriceTier.findFirst({
    where: { budgetMin: { lte: budgetMin } },
    orderBy: { budgetMin: "desc" },
    select: { price: true },
  });
  if (nearest) return nearest.price;

  throw new Error(
    `[plan-request-pricing] no tier covers budget min=${budgetMin} — admin 이 해당 범위의 tier 를 등록했는지 확인해주세요.`,
  );
}

/** 어드민 페이지 / step1-wizard chip 용 — position ASC 전체 row. */
export async function listPriceTiers(): Promise<PriceTier[]> {
  return prisma.planRequestPriceTier.findMany({
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      budgetMin: true,
      budgetMax: true,
      price: true,
      updatedAt: true,
    },
  });
}
