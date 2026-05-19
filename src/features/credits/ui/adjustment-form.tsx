"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { adjustCredit } from "../actions";
import type { AdjustmentMutationState } from "../schema";

type FormAction = (
  state: AdjustmentMutationState,
  formData: FormData,
) => Promise<AdjustmentMutationState>;

/**
 * 어드민 수동 조정 폼.
 *
 * amount 는 부호 있는 정수 (음수 = 차감). 사유 필수. ledger type='adjustment' 고정.
 * 결제건 환불은 RefundForm 사용.
 */
export function AdjustmentForm({ partnerId }: { partnerId: string }) {
  const action: FormAction = adjustCredit.bind(null, partnerId);
  const [state, formAction, pending] = useActionState<
    AdjustmentMutationState,
    FormData
  >(action, undefined);

  const [amount, setAmount] = useState<string>("");

  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#4b4b4b]" htmlFor="adjust-amount">
          조정 금액 (원) — 양수 = 충전, 음수 = 차감
        </label>
        <Input
          id="adjust-amount"
          name="amount"
          type="number"
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="예: 10000 또는 -5000"
          className="h-11"
        />
        {errors?.amount && (
          <p className="text-xs text-red-600">{errors.amount[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#4b4b4b]" htmlFor="adjust-reason">
          사유 (감사 기록용, 필수)
        </label>
        <Textarea
          id="adjust-reason"
          name="reason"
          rows={3}
          maxLength={200}
          placeholder="예: 이벤트 보상 / 운영 보정 / 시스템 오류 보상"
          className="text-sm"
        />
        {errors?.reason && (
          <p className="text-xs text-red-600">{errors.reason[0]}</p>
        )}
      </div>

      {errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {errors._form[0]}
        </p>
      )}
      {success && (
        <p className="text-sm text-black bg-[#efefef] px-3 py-2 rounded-lg">
          조정이 반영되었습니다.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? "반영 중..." : "조정 적용"}
        </Button>
      </div>
    </form>
  );
}
