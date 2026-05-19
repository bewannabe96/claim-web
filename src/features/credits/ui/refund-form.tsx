"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { refundTopup } from "../actions";
import type { RefundableTopup } from "../queries";
import type { RefundMutationState } from "../schema";

type FormAction = (
  state: RefundMutationState,
  formData: FormData,
) => Promise<RefundMutationState>;

const KRW = new Intl.NumberFormat("ko-KR");
const DATE = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * 결제건 환불 폼.
 *
 * 환불 가능한 결제 (잔여 환불액 > 0) 만 드롭다운에 노출. 선택 시 amount 가 잔여 환불액으로
 * 자동 채워지지만 부분 환불을 위해 더 적게 입력 가능. 서버가 누적 환불 ≤ 원본 충전 재검증.
 */
export function RefundForm({
  partnerId,
  refundableTopups,
}: {
  partnerId: string;
  refundableTopups: RefundableTopup[];
}) {
  const action: FormAction = refundTopup.bind(null, partnerId);
  const [state, formAction, pending] = useActionState<
    RefundMutationState,
    FormData
  >(action, undefined);

  const [selectedPaymentId, setSelectedPaymentId] = useState<string>(
    refundableTopups[0]?.paymentId ?? "",
  );
  const selected = useMemo(
    () => refundableTopups.find((t) => t.paymentId === selectedPaymentId),
    [refundableTopups, selectedPaymentId],
  );
  const [amount, setAmount] = useState<string>(
    selected ? String(selected.refundableAmount) : "",
  );

  function onSelectChange(paymentId: string) {
    setSelectedPaymentId(paymentId);
    const next = refundableTopups.find((t) => t.paymentId === paymentId);
    setAmount(next ? String(next.refundableAmount) : "");
  }

  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  if (refundableTopups.length === 0) {
    return (
      <p className="text-sm text-[#4b4b4b] py-2">
        환불 가능한 결제 건이 없어요. (충전 내역이 없거나 모두 전액 환불됨)
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#4b4b4b]" htmlFor="refund-payment">
          환불할 결제 건
        </label>
        <select
          id="refund-payment"
          name="paymentId"
          value={selectedPaymentId}
          onChange={(e) => onSelectChange(e.target.value)}
          className="h-11 px-3 rounded-lg border border-[#e2e2e2] bg-white text-sm focus:outline-none focus:ring-3 focus:ring-ring/50"
        >
          {refundableTopups.map((t) => (
            <option key={t.paymentId} value={t.paymentId}>
              {DATE.format(t.topupAt)} · 충전 {KRW.format(t.originalAmount)}원
              {t.refundedAmount > 0
                ? ` · 환불 잔여 ${KRW.format(t.refundableAmount)}원`
                : ""}
            </option>
          ))}
        </select>
        {errors?.paymentId && (
          <p className="text-xs text-red-600">{errors.paymentId[0]}</p>
        )}
        {selected && (
          <p className="text-xs text-[#afafaf]">
            paymentId: {selected.paymentId} · 환불 가능 최대{" "}
            {KRW.format(selected.refundableAmount)}원
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#4b4b4b]" htmlFor="refund-amount">
          환불 금액 (원, 부분 환불 가능)
        </label>
        <Input
          id="refund-amount"
          name="amount"
          type="number"
          step={1}
          min={1}
          max={selected?.refundableAmount ?? undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="예: 5000"
          className="h-11"
        />
        {errors?.amount && (
          <p className="text-xs text-red-600">{errors.amount[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[#4b4b4b]" htmlFor="refund-reason">
          사유 (감사 기록용, 필수)
        </label>
        <Textarea
          id="refund-reason"
          name="reason"
          rows={3}
          maxLength={200}
          placeholder="예: 결제 오류 / 고객 요청 / 서비스 불만족"
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
          환불이 반영되었습니다.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          variant="destructive"
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? "반영 중..." : "환불 처리"}
        </Button>
      </div>
    </form>
  );
}
