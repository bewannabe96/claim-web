"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { skipPlanProposalAnalysis } from "@/features/plan-proposals/actions";
import { cn } from "@/lib/utils";

/**
 * 분석 건너뛰기 버튼 — 어드민 "분석 실패" 페이지 + 요청 상세에서 공유.
 *
 * 외부 파이프라인이 끝내 회복 안 되는 제안서를 운영자가 "이건 분석 못 살린다, 그냥
 * 결과 마감으로 보내자" 라고 결정하는 escape hatch. 두 단계 confirm 으로
 * 비가역성 가드.
 *
 * 동작:
 *   1. 첫 클릭 → "정말 건너뛸까요?" confirm 단계로 전환 (10초 안에 한 번 더).
 *   2. 두 번째 클릭 → `skipPlanProposalAnalysis(proposalId)` 호출.
 *   3. 응답을 인라인 텍스트로 표시 (성공 시 "건너뜀", 실패 시 사유).
 */
export function SkipAnalysisButton({
  proposalId,
  size = "default",
}: {
  proposalId: string;
  size?: "default" | "sm";
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<
    | { kind: "success" }
    | { kind: "error"; message: string }
    | null
  >(null);

  // confirm 자동 해제 timeout 식별자 — unmount / 다음 클릭 / 액션 종료 시 정리해
  // (1) 언마운트된 컴포넌트의 setState 경고와 (2) 중복 클릭으로 누적되는 stale
  // timeout 을 모두 차단.
  const resetTimeoutRef = useRef<number | null>(null);

  function clearResetTimeout() {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    return clearResetTimeout;
  }, []);

  const disabled = pending || result?.kind === "success";

  function onClick() {
    if (!confirming) {
      setConfirming(true);
      // 10초 후 자동 해제 — 우연한 두 번째 클릭으로 비가역 액션이 발화하지 않도록.
      clearResetTimeout();
      resetTimeoutRef.current = window.setTimeout(() => {
        resetTimeoutRef.current = null;
        setConfirming(false);
      }, 10_000);
      return;
    }
    // 두 번째 클릭으로 실제 실행 — 대기 중인 자동 해제는 무의미하므로 정리.
    clearResetTimeout();
    startTransition(async () => {
      try {
        const res = await skipPlanProposalAnalysis(proposalId);
        if (res.ok) {
          setResult({ kind: "success" });
        } else {
          setResult({
            kind: "error",
            message:
              res.error === "not_found"
                ? "제안서를 찾지 못했어요."
                : res.error === "already_analyzed"
                  ? "이미 분석이 완료된 제안서예요."
                  : "분석 실패가 기록된 경우에만 건너뛸 수 있어요.",
          });
        }
      } catch (e) {
        console.error("[skip-analysis] action failed", e);
        setResult({
          kind: "error",
          message: "건너뛰기에 실패했어요. 잠시 후 다시 시도해주세요.",
        });
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        disabled={disabled}
        onClick={onClick}
        variant={confirming ? "default" : "outline"}
        className={cn(
          "rounded-full font-medium",
          size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        )}
      >
        {pending
          ? "건너뛰는 중…"
          : confirming
            ? "정말 건너뛸까요?"
            : "분석 건너뛰기"}
      </Button>
      {result?.kind === "success" && (
        <span className="text-xs text-black">건너뜀</span>
      )}
      {result?.kind === "error" && (
        <span className="text-xs text-red-600">{result.message}</span>
      )}
    </div>
  );
}
