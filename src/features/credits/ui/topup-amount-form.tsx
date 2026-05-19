"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { initiateTopup } from "../actions";
import type { TopupInitMutationState } from "../schema";

const PRESETS = [10_000, 30_000, 50_000, 100_000];

/**
 * 충전 금액 입력 폼.
 *
 * 성공 시 PG 위젯/리다이렉트 URL 로 이동. router.push 는 typedRoutes 영역 밖이라
 * window.location.href 사용 (외부 / 동적 URL 안전).
 */
export function TopupAmountForm() {
  const [state, formAction, pending] = useActionState<
    TopupInitMutationState,
    FormData
  >(initiateTopup, undefined);

  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (state && "ok" in state && state.ok && state.redirectUrl) {
      window.location.href = state.redirectUrl;
    }
  }, [state]);

  const errors = state && "errors" in state ? state.errors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#4b4b4b]" htmlFor="amount">
          충전 금액 (1,000원 ~ 10,000,000원)
        </label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step={1000}
          min={1000}
          max={10_000_000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="예: 50000"
          className="h-12 text-base"
        />
        {errors?.amount && (
          <p className="text-xs text-red-600">{errors.amount[0]}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(String(preset))}
            className="px-3 py-1.5 rounded-full border border-[#e2e2e2] text-xs font-medium text-[#4b4b4b] hover:bg-[#fafafa] transition-colors"
          >
            +{preset.toLocaleString("ko-KR")}원
          </button>
        ))}
      </div>

      {errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {errors._form[0]}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="h-12 rounded-full text-sm font-medium"
      >
        {pending ? "결제 페이지로 이동 중..." : "결제 진행"}
      </Button>

      <p className="text-xs text-[#afafaf] text-center">
        현재 dev 환경에서는 stub 결제로 즉시 충전이 반영돼요.
      </p>
    </form>
  );
}
