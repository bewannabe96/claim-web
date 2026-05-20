import "server-only";

import { prisma } from "@/server/db/prisma";

import type { PriceTier } from "./schema";

/**
 * 가격 tier 조회 — Server Component / Server Action 에서만.
 *
 * MVP 규모: tier 6 row 고정 — full scan, no cache. 향후 admin 페이지 트래픽이
 * 늘면 short-lived in-memory cache 검토.
 */

/**
 * (budgetMin, budgetMax) 매칭 가격 조회.
 *
 * step1-wizard 의 BUDGET_OPTIONS chip 이 항상 정확히 일치하는 (min, max) 만
 * 보내므로 정상 흐름에선 항상 row 존재. 비정상 입력 (코드 drift / 직접 호출) 시
 * throw 로 빠르게 실패 — Step1 zod 가 이미 6 preset 을 강제하는 첫 방어선.
 */
export async function getPriceForBudget(
  budgetMin: number,
  budgetMax: number,
): Promise<number> {
  const tier = await prisma.planRequestPriceTier.findUnique({
    where: { budgetMin_budgetMax: { budgetMin, budgetMax } },
    select: { price: true },
  });
  if (!tier) {
    throw new Error(
      `[plan-request-pricing] no tier matches budget min=${budgetMin} max=${budgetMax} — seeder 와 step1-wizard BUDGET_OPTIONS 동기 확인 필요.`,
    );
  }
  return tier.price;
}

/** 어드민 페이지용 — position ASC 6 row. */
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
