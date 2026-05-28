import type { PriceTier } from "@/features/plan-request-pricing/schema";

/**
 * v2-mock 풀 path 의 step1-wizard 가 받는 가격 tier mock — 실 DB 의
 * `plan_request_price_tier` row 가 만들어내는 chip 옵션을 정적으로 흉내낸다.
 *
 * v1 wizard 는 server component (`/plan-request/new/page.tsx`) 가 `listPriceTiers()`
 * 로 읽어 prop 으로 내려준다. v2-mock 의 절대 규칙 ("DB / 서버 / queries 호출 금지")
 * 때문에 mock 안에서는 queries import 가 금지 — 그 대신 같은 shape 의 정적 row 를
 * 두어 wizard UI 가 그대로 동작.
 *
 * 만원 단위 boundary 는 v1 의 admin 입력 톤 (5만 / 10만 / 15만 / 25만 / 35만) 을
 * 그대로 따른다. price (요청서 발송 단가) 는 실 운영 가격이 아니라 mock 시연용 임의값.
 */
const MOCK_UPDATED_AT = new Date("2026-05-01T00:00:00Z");

export const MOCK_PRICE_TIERS: PriceTier[] = [
  {
    id: "mock-tier-1",
    position: 1,
    budgetMin: 0,
    budgetMax: 49_999,
    price: 30_000,
    updatedAt: MOCK_UPDATED_AT,
  },
  {
    id: "mock-tier-2",
    position: 2,
    budgetMin: 50_000,
    budgetMax: 99_999,
    price: 50_000,
    updatedAt: MOCK_UPDATED_AT,
  },
  {
    id: "mock-tier-3",
    position: 3,
    budgetMin: 100_000,
    budgetMax: 149_999,
    price: 80_000,
    updatedAt: MOCK_UPDATED_AT,
  },
  {
    id: "mock-tier-4",
    position: 4,
    budgetMin: 150_000,
    budgetMax: 249_999,
    price: 120_000,
    updatedAt: MOCK_UPDATED_AT,
  },
  {
    id: "mock-tier-5",
    position: 5,
    budgetMin: 250_000,
    budgetMax: 349_999,
    price: 160_000,
    updatedAt: MOCK_UPDATED_AT,
  },
  {
    id: "mock-tier-6",
    position: 6,
    budgetMin: 350_000,
    budgetMax: 9_999_999,
    price: 200_000,
    updatedAt: MOCK_UPDATED_AT,
  },
];
