import { z } from "zod";

/**
 * plan-request-pricing — 가입자 budget 범위에 따른 요청서 가격 매핑.
 *
 * 진실 공급원: DB 의 `plan_request_price_tier`. step1-wizard 의 BUDGET_OPTIONS 는
 * 부모 server component 가 listPriceTiers() 로 읽어 prop 으로 내려줌 — admin 이
 * tier 를 편집한 결과가 가입자 화면에 그대로 반영됨.
 *
 * 입출력 단위 정책:
 *   - admin 입력은 만원 단위 (budgetMaxManwon / priceManwon).
 *   - DB 저장은 원 단위 (budgetMin / budgetMax / price).
 *   - 변환은 actions 에서만 — UI/schema 는 만원에 머무름.
 *
 * 비중첩 + 연속 구간 모델:
 *   - N 개 tier 는 인접 boundary 를 공유. row i 의 budgetMax+1 = row i+1 의
 *     budgetMin (1원 갭으로 닫힘-열림 구간). 사용자 UI 는 "row 의 budgetMax 와
 *     row+1 의 budgetMin 이 같은 boundary" 로 다룸 — actions 가 만원→원 변환할 때
 *     boundary*10000-1 / boundary*10000 으로 1원 갭을 자동 부여.
 *   - 첫 row 의 budgetMin = 0, 마지막 row 의 budgetMax = BUDGET_MAX_SENTINEL.
 *     UI 는 양 끝을 자동 처리하고 사용자는 사이 boundary 만 N-1 개 입력.
 *
 * Snapshot 정책: PlanRequest 생성 시점에 PlanRequest.price 컬럼으로 고정. admin 이
 * tier 를 어떻게 바꾸든 진행 중 요청에는 영향 X.
 */

const BUDGET_BOUNDARY_MANWON = z
  .number({ error: "경계값을 입력해주세요." })
  .int("정수만 입력 가능합니다.")
  .min(1, "1만원 이상이어야 해요.")
  .max(999, "999만원 이하여야 해요.");

const PRICE_MANWON = z
  .number({ error: "가격을 입력해주세요." })
  .int("만원 단위 정수로 입력해주세요.")
  .min(1, "가격은 1만원 이상이어야 해요.")
  .max(1000, "가격은 1,000만원 이하여야 해요.");

/**
 * 단일 row draft — admin UI 가 보내는 raw 형태.
 *
 * budgetMaxManwon === null 은 "이 row 가 마지막 (상한 없음)" 을 의미. bulk-save
 * superRefine 이 "정확히 마지막 row 만 null" 임을 강제.
 */
const PriceTierDraftSchema = z.object({
  budgetMaxManwon: z.union([BUDGET_BOUNDARY_MANWON, z.null()]),
  priceManwon: PRICE_MANWON,
});

/**
 * Bulk save — 전체 tier 리스트를 한 번에 갈아끼움 (atomic).
 *
 * 클라이언트가 boundary 오름차순으로 정렬해 보내므로 server 는 invariant 만 검증.
 * 그래도 방어적으로 정렬도 다시 한 번 한다 (action 안에서).
 */
export const PriceTierBulkSaveInputSchema = z
  .object({
    tiers: z
      .array(PriceTierDraftSchema)
      .min(1, "최소 1개의 tier 가 필요해요.")
      .max(20, "tier 는 최대 20개까지 등록할 수 있어요."),
  })
  .superRefine((v, ctx) => {
    v.tiers.forEach((t, i) => {
      const isLast = i === v.tiers.length - 1;
      if (isLast && t.budgetMaxManwon !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", i, "budgetMaxManwon"],
          message: "마지막 tier 는 상한이 없어야 해요.",
        });
      }
      if (!isLast && t.budgetMaxManwon === null) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", i, "budgetMaxManwon"],
          message: "경계값을 입력해주세요.",
        });
      }
    });
    for (let i = 0; i < v.tiers.length - 2; i++) {
      const cur = v.tiers[i].budgetMaxManwon;
      const next = v.tiers[i + 1].budgetMaxManwon;
      if (cur !== null && next !== null && next <= cur) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers", i + 1, "budgetMaxManwon"],
          message: "이전 tier 의 경계값보다 커야 해요.",
        });
      }
    }
  });
export type PriceTierBulkSaveInput = z.infer<typeof PriceTierBulkSaveInputSchema>;

/** UI 표시용 — Prisma row 의 안전 pick. */
export type PriceTier = {
  id: string;
  position: number;
  budgetMin: number;
  budgetMax: number;
  price: number;
  updatedAt: Date;
};

/**
 * Bulk save mutation state. 에러는 모두 `_form` 으로 합쳐서 보냄 — UI 가 리스트로
 * 표시. 각 메시지에 "N번째 tier" prefix 가 있어 위치 식별 가능.
 */
export type PriceTierBulkSaveMutationState =
  | { ok: true }
  | { ok?: false; errors?: { _form?: string[] } }
  | undefined;
