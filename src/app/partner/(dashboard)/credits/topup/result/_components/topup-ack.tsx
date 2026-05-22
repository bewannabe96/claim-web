"use client";

import { useEffect, useRef, useState } from "react";

import { acknowledgeTopup } from "@/features/credits/actions";

import { ResultShell } from "./result-shell";

type AckResult =
  | { ok: true; alreadyApplied: boolean }
  | { ok: false; error: string };

/**
 * 모바일 redirect 착지 후 충전 ack 를 수행하는 클라이언트 러너.
 *
 * 왜 클라이언트인가: acknowledgeTopup → confirmTopup 이 revalidatePath 를 호출하는데,
 * Next 16 은 render 중 revalidatePath 를 금지한다 (mutation 은 render 밖에서만).
 * 서버 컴포넌트 render 안에서 await 하면 위반 — 그래서 마운트 후 server action 으로
 * 호출해 render 경계 밖에서 실행시킨다.
 *
 * 멱등: acknowledgeTopup 는 idempotencyKey=paymentId 라 재호출해도 alreadyApplied.
 * StrictMode 더블 마운트 / 리렌더 대비 ref 가드로 1 회만 발화.
 *
 * ack 실패해도 webhook 가 redundant safety net 이라 잔액은 결국 들어옴 — 사용자에겐
 * "잠시 후 잔액 확인" 폴백 메시지.
 */
export function TopupAck({ paymentId }: { paymentId: string }) {
  const [result, setResult] = useState<AckResult | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        setResult(await acknowledgeTopup({ paymentId }));
      } catch {
        setResult({ ok: false, error: "unexpected" });
      }
    })();
  }, [paymentId]);

  if (!result) {
    return (
      <ResultShell
        tone="pending"
        title="결제 확인 중이에요"
        body="잠시만 기다려주세요."
        cta="크레딧 페이지로"
        href="/partner/credits"
      />
    );
  }

  if (result.ok) {
    return (
      <ResultShell
        tone="success"
        title={result.alreadyApplied ? "이미 처리된 결제예요" : "충전이 완료됐어요"}
        body="잔액에 즉시 반영됐어요."
        cta="크레딧 페이지로"
        href="/partner/credits"
      />
    );
  }

  // ack 실패 — webhook safety net 에 위임.
  return (
    <ResultShell
      tone="pending"
      title="결제 확인 중이에요"
      body={`잔액 페이지에서 곧 반영을 확인해주세요. (사유: ${result.error})`}
      cta="크레딧 페이지로"
      href="/partner/credits"
    />
  );
}
