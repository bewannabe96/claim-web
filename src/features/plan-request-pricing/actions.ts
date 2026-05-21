"use server";

import { revalidatePath } from "next/cache";

import { newId } from "@/lib/id";
import { requireAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";

import {
  PriceTierBulkSaveInputSchema,
  type PriceTierBulkSaveMutationState,
} from "./schema";

/**
 * 가격 tier 일괄 저장 — admin 만.
 *
 * 전략: 비중첩 + 연속 구간이라는 invariant 를 가장 단순하게 보장하는 방법은
 * "전체 row 갈아끼우기". $transaction 안에서 deleteMany → createMany 를 묶어
 * atomic. 외부 connection 은 READ COMMITTED 격리로 인해 commit 전엔 옛 row 를
 * 보거나, commit 후엔 새 row 를 봄 — 부분 상태 노출 없음.
 *
 * 만원 → 원 변환은 여기서만 수행:
 *   - row i (0-base) 의 budgetMin = i === 0 ? 0 : tiers[i-1].budgetMaxManwon * 10000
 *   - row i 의 budgetMax = i === last ? 9_999_999 : tiers[i].budgetMaxManwon * 10000 - 1
 *   - 인접 (budgetMax+1 === 다음 budgetMin) 의 1원 갭 패턴 유지 — getPriceForBudget
 *     의 containment 쿼리가 이 갭 위에서 정확히 동작.
 *
 * server action 은 layout 게이트 우회하므로 함수 진입부에서 명시적 requireAdminSession.
 * 동시성: 두 어드민이 동시에 저장하면 last-write-wins (트랜잭션 단위). 운영 변동
 * 빈도가 매우 낮아 충돌은 사실상 0.
 */
export async function saveAllPriceTiers(
  _prev: PriceTierBulkSaveMutationState,
  formData: FormData,
): Promise<PriceTierBulkSaveMutationState> {
  await requireAdminSession();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { ok: false, errors: { _form: ["입력 형식이 잘못됐어요."] } };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, errors: { _form: ["입력 형식이 잘못됐어요."] } };
  }

  const validated = PriceTierBulkSaveInputSchema.safeParse(parsedJson);
  if (!validated.success) {
    const msgs = validated.error.issues.map((iss) => {
      const tierIdx = iss.path[1];
      return typeof tierIdx === "number"
        ? `${tierIdx + 1}번째 tier: ${iss.message}`
        : iss.message;
    });
    return { ok: false, errors: { _form: msgs } };
  }

  const { tiers } = validated.data;

  // 클라이언트가 정렬해 보냈다고 가정하지만 server 도 한 번 더 정렬 — 마지막 row
  // (budgetMaxManwon=null) 는 항상 끝으로.
  const sorted = tiers.slice().sort((a, b) => {
    if (a.budgetMaxManwon === null) return 1;
    if (b.budgetMaxManwon === null) return -1;
    return a.budgetMaxManwon - b.budgetMaxManwon;
  });

  const N = sorted.length;
  const dbRows = sorted.map((t, i) => {
    const prevMax = i === 0 ? null : sorted[i - 1].budgetMaxManwon;
    const budgetMin = prevMax === null ? 0 : prevMax * 10_000;
    const budgetMax =
      i === N - 1 ? 9_999_999 : (t.budgetMaxManwon as number) * 10_000 - 1;
    return {
      id: newId(),
      position: i,
      budgetMin,
      budgetMax,
      price: t.priceManwon * 10_000,
    };
  });

  await prisma.$transaction([
    prisma.planRequestPriceTier.deleteMany({}),
    prisma.planRequestPriceTier.createMany({ data: dbRows }),
  ]);

  revalidatePath("/admin/settings");
  revalidatePath("/plan-request/new");

  return { ok: true };
}
