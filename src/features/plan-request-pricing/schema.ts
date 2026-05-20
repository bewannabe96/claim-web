import { z } from "zod";

/**
 * plan-request-pricing — 가입자 budget 범위에 따른 요청서 가격 매핑.
 *
 * 진실 공급원: DB 의 `plan_request_price_tier` 6 row (step1-wizard 의 BUDGET_OPTIONS
 * 와 lock-step). admin 페이지가 price 만 수정 가능. position / budgetMin / budgetMax 는
 * seeder 가 백필한 값 그대로 immutable.
 *
 * Snapshot 정책: PlanRequest 생성 시점에 PlanRequest.price 컬럼으로 고정. admin 이
 * tier 가격을 바꿔도 진행 중 요청에는 영향 X.
 */

export const PriceTierUpdateInputSchema = z.object({
  /// 0..5 — step1-wizard BUDGET_OPTIONS 의 표시 순서.
  position: z
    .number({ error: "position 이 필요합니다." })
    .int("position 은 정수여야 해요.")
    .min(0, "position 은 0 이상이어야 해요.")
    .max(5, "position 은 5 이하여야 해요."),
  price: z
    .number({ error: "가격을 입력해주세요." })
    .int("정수 원 단위로 입력해주세요.")
    .min(0, "가격은 0 이상이어야 해요.")
    .max(10_000_000, "가격은 1,000만원 이하여야 해요."),
});
export type PriceTierUpdateInput = z.infer<typeof PriceTierUpdateInputSchema>;

/** UI 표시용 — Prisma row 의 안전 pick. */
export type PriceTier = {
  id: string;
  position: number;
  budgetMin: number;
  budgetMax: number;
  price: number;
  updatedAt: Date;
};

/** Action mutation state — features/admin 패턴과 동일. */
export type PriceTierUpdateMutationState =
  | { ok: true }
  | {
      ok?: false;
      errors?: Partial<Record<keyof PriceTierUpdateInput | "_form", string[]>>;
    }
  | undefined;
