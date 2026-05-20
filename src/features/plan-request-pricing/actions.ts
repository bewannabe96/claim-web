"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";

import {
  PriceTierUpdateInputSchema,
  type PriceTierUpdateMutationState,
} from "./schema";

/**
 * 가격 tier 수정 — admin 만. position 으로 lookup, price 만 update.
 *
 * server action 은 layout 게이트 우회하므로 함수 진입부에서 명시적 requireAdminSession.
 * (budgetMin, budgetMax) 는 step1-wizard 의 BUDGET_OPTIONS 와 lock-step 이라
 * immutable — admin 페이지는 price 만 입력받음.
 *
 * 동시성: 두 어드민이 동시에 같은 row 편집하면 last-write-wins. 본 row 는 운영 변동
 * 빈도가 매우 낮아 충돌은 사실상 0 — 명시 lock 안 추가.
 */
export async function updatePriceTier(
  _prev: PriceTierUpdateMutationState,
  formData: FormData,
): Promise<PriceTierUpdateMutationState> {
  await requireAdminSession();

  const rawPosition = formData.get("position");
  const rawPrice = formData.get("price");
  const positionNum =
    typeof rawPosition === "string" && rawPosition.trim().length > 0
      ? Number(rawPosition)
      : Number.NaN;
  const priceNum =
    typeof rawPrice === "string" && rawPrice.trim().length > 0
      ? Number(rawPrice)
      : Number.NaN;

  const parsed = PriceTierUpdateInputSchema.safeParse({
    position: Number.isFinite(positionNum) ? positionNum : undefined,
    price: Number.isFinite(priceNum) ? priceNum : undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const updated = await prisma.planRequestPriceTier.updateMany({
    where: { position: parsed.data.position },
    data: { price: parsed.data.price },
  });
  if (updated.count !== 1) {
    return {
      ok: false,
      errors: {
        _form: [
          "해당 tier 를 찾을 수 없습니다. seeder 가 누락됐는지 확인해주세요.",
        ],
      },
    };
  }

  revalidatePath("/admin/settings");

  return { ok: true };
}
