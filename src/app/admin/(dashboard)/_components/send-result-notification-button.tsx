"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  type SendResultNotificationResult,
  sendRequestResultNotification,
} from "@/features/plan-requests/actions";

/**
 * 완료 알림톡 수동 발송 버튼 — 어드민 요청 상세 페이지 (`completed` 요청 전용).
 *
 * 분석 완료 자동 발송이 비활성화돼 있어 어드민이 직접 트리거. 가입자에게 알림톡이
 * 가는 작업이라 클릭 → 확인 → 발송 2-스텝으로 실수 발송을 막는다. 발송 이력은
 * 서버에 추적하지 않으므로 새로고침하면 결과 표시는 사라진다 (의도된 단순화).
 */
export function SendResultNotificationButton({
  planRequestId,
}: {
  planRequestId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<
    { kind: "success" } | { kind: "error"; message: string } | null
  >(null);

  function send() {
    startTransition(async () => {
      try {
        const res = await sendRequestResultNotification(planRequestId);
        setResult(
          res.ok
            ? { kind: "success" }
            : { kind: "error", message: ERROR_MESSAGE[res.error] },
        );
      } catch (e) {
        console.error("[send-result-notification] failed", e);
        setResult({
          kind: "error",
          message: "발송 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        });
      } finally {
        setArmed(false);
      }
    });
  }

  const btnClass = "rounded-full font-medium h-8 px-3 text-xs";

  if (armed) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-xs text-[#4b4b4b]">가입자에게 발송할까요?</span>
        <Button
          type="button"
          disabled={pending}
          onClick={send}
          className={btnClass}
        >
          {pending ? "발송 중…" : "발송"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setArmed(false)}
          className={btnClass}
        >
          취소
        </Button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        onClick={() => {
          setResult(null);
          setArmed(true);
        }}
        className={btnClass}
      >
        완료 알림톡 발송
      </Button>
      {result?.kind === "success" && (
        <span className="text-xs text-black">발송됐어요</span>
      )}
      {result?.kind === "error" && (
        <span className="text-xs text-red-600">{result.message}</span>
      )}
    </div>
  );
}

const ERROR_MESSAGE: Record<
  Extract<SendResultNotificationResult, { ok: false }>["error"],
  string
> = {
  not_found: "요청서를 찾지 못했어요.",
  not_completed: "분석이 완료된 요청서만 발송할 수 있어요.",
  missing_contact: "휴대폰 번호 또는 결과 토큰이 없어요.",
  send_failed: "알림톡 발송에 실패했어요. 잠시 후 다시 시도해주세요.",
};
