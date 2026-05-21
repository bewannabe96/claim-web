"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { acknowledgeTopup, initiateTopup } from "../actions";
import type { TopupInitMutationState } from "../schema";

const PRESETS = [10_000, 30_000, 50_000, 100_000];

/**
 * 충전 금액 입력 폼.
 *
 * 결과 분기:
 *   - state.kind === "redirect" (stub) → window.location.href = state.redirectUrl
 *     → /api/webhooks/credits/stub 가 GET 으로 받아 ledger 작성 후 /partner/credits 로 redirect.
 *   - state.kind === "sdk" (portone) → 동적 import 로 @portone/browser-sdk 로드 →
 *     PortOne.requestPayment(state.sdkPayload) 호출:
 *     · PC: 모달 닫힘 + Promise resolve → acknowledgeTopup 으로 즉시 잔액 갱신.
 *     · 모바일: SDK 가 redirectUrl 로 navigate, Promise 미해결 — result 페이지가 후속 처리.
 *
 * 같은 state 가 두 번 처리되지 않도록 paymentId 기반 가드.
 */
export function TopupAmountForm() {
  const [state, formAction, pending] = useActionState<
    TopupInitMutationState,
    FormData
  >(initiateTopup, undefined);

  const [amount, setAmount] = useState<string>("");
  const [pgError, setPgError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const handledPaymentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state || !("ok" in state) || !state.ok) return;
    if (handledPaymentIdRef.current === state.paymentId) return;
    handledPaymentIdRef.current = state.paymentId;

    if (state.kind === "redirect") {
      window.location.href = state.redirectUrl;
      return;
    }

    // state.kind === "sdk"
    void (async () => {
      setProcessing(true);
      setPgError(null);
      try {
        const { default: PortOne } = await import("@portone/browser-sdk/v2");
        const response = await PortOne.requestPayment(state.sdkPayload);

        // 모바일은 redirectUrl 로 SDK 가 navigate — Promise 미해결 (여기 도달 안 함).
        // PC 는 모달 닫힘 시 response 반환.
        if (!response) {
          // 비정상 — 정의되지 않은 SDK 상태.
          setPgError("결제 응답이 비어 있어요. 다시 시도해주세요.");
          setProcessing(false);
          handledPaymentIdRef.current = null;
          return;
        }

        if (response.code !== undefined) {
          setPgError(response.message ?? "결제가 취소되거나 실패했어요.");
          setProcessing(false);
          handledPaymentIdRef.current = null;
          return;
        }

        const ack = await acknowledgeTopup({ paymentId: state.paymentId });
        if (!ack.ok) {
          setPgError(
            `결제 확인 실패 (${ack.error}). 잔액 페이지에서 곧 반영을 확인해주세요.`,
          );
          setProcessing(false);
          handledPaymentIdRef.current = null;
          return;
        }
        window.location.href = "/partner/credits";
      } catch (e) {
        setPgError(
          e instanceof Error ? e.message : "결제 처리 중 오류가 발생했어요.",
        );
        setProcessing(false);
        handledPaymentIdRef.current = null;
      }
    })();
  }, [state]);

  const errors = state && "errors" in state ? state.errors : undefined;
  const busy = pending || processing;

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

      {pgError && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {pgError}
        </p>
      )}

      <Button
        type="submit"
        disabled={busy}
        className="h-12 rounded-full text-sm font-medium"
      >
        {busy ? "결제 진행 중..." : "결제 진행"}
      </Button>

      <p className="text-xs text-[#afafaf] text-center">
        {process.env.NODE_ENV === "production"
          ? "안전한 PG 위젯으로 결제가 진행돼요."
          : "현재 dev 환경 기준 — Stub provider 면 즉시 충전, PortOne 설정 시 실제 위젯."}
      </p>
    </form>
  );
}
