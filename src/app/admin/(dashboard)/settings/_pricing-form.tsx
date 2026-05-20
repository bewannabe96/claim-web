"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePriceTier } from "@/features/plan-request-pricing/actions";
import type { PriceTier } from "@/features/plan-request-pricing/schema";

/**
 * 가격 tier 6 row 편집 — 각 row 자체 form (개별 server action 호출).
 *
 * settings-form 과 같은 uncontrolled + key remount 패턴. 저장 성공 시 revalidatePath 가
 * 새 initial 을 prop 으로 흘리고, 입력만 key 로 remount 되어 새 defaultValue 로 초기화.
 *
 * row 단위로 form 분리한 이유: 6 row 를 한 form 으로 묶으면 한 row 검증 실패 시 다른
 * row 입력도 막혀 운영 편의 손상. 또한 admin 이 한 번에 하나만 바꾸는 운영 패턴이 일반적.
 */
export function PricingForm({ tiers }: { tiers: PriceTier[] }) {
  return (
    <div className="flex flex-col gap-3">
      {tiers.map((tier) => (
        <PriceTierRow key={tier.id} tier={tier} />
      ))}
    </div>
  );
}

function PriceTierRow({ tier }: { tier: PriceTier }) {
  const [state, formAction, pending] = useActionState(
    updatePriceTier,
    undefined,
  );
  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  return (
    <form
      action={formAction}
      className="rounded-xl border border-[#efefef] bg-white p-5 grid grid-cols-[1fr_auto] gap-4 items-center"
    >
      <input type="hidden" name="position" value={tier.position} />

      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-black">
          {formatBudgetRange(tier.budgetMin, tier.budgetMax)}
        </p>
        <p className="text-xs text-[#4b4b4b]">
          요청서 1건당 차감 가격 (계약/문자보내기 시점)
        </p>
        {errors?._form && (
          <p className="text-xs text-red-600">{errors._form[0]}</p>
        )}
        {errors?.price && (
          <p className="text-xs text-red-600">{errors.price[0]}</p>
        )}
        {success && (
          <p className="text-xs text-black">
            저장되었습니다. 다음 신규 요청부터 적용돼요.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <PriceField
          key={tier.price}
          defaultValue={tier.price}
        />
        <Button
          type="submit"
          disabled={pending}
          variant="secondary"
          className="h-11 rounded-full px-5 text-sm font-medium shrink-0"
        >
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}

function PriceField({ defaultValue }: { defaultValue: number }) {
  return (
    <div className="relative">
      <Input
        name="price"
        type="number"
        defaultValue={defaultValue}
        min={0}
        className="h-11 w-36 pr-10 text-right tabular-nums"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#4b4b4b] pointer-events-none">
        원
      </span>
    </div>
  );
}

const KRW = new Intl.NumberFormat("ko-KR");

function formatBudgetRange(min: number, max: number): string {
  // step1-wizard 의 BUDGET_OPTIONS 라벨 ("5만원 미만" 등) 과 시각적으로 같게 표시.
  if (min === 0) return `${KRW.format(Math.ceil((max + 1) / 10_000))}만원 미만`;
  if (max >= 9_999_999) return `${KRW.format(min / 10_000)}만원 이상`;
  return `${KRW.format(min / 10_000)}~${KRW.format(max / 10_000)}만원`;
}
