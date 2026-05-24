"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { retryPlanProposalAnalysis } from "@/features/plan-proposals/actions";
import { cn } from "@/lib/utils";

/**
 * 분석 재시도 버튼 — 어드민 "분석 실패" 페이지 + 요청 상세에서 공유.
 *
 * 두 모드:
 *   - 기본 (`requireConfirm` 미지정): 단일 클릭으로 즉시 발화. 실패/정체 케이스 —
 *     기존 분석 리포트가 없어 비파괴적.
 *   - `requireConfirm`: 두 단계 confirm. 이미 분석 완료된 제안서를 재분석하는
 *     destructive 케이스용 — 기존 `PlanProposalAnalysisReport` row 가 삭제되고
 *     새 분석 결과로 교체됨. SkipAnalysisButton 과 동일한 비가역 가드 패턴.
 *
 * 클릭 → `retryPlanProposalAnalysis(proposalId)` 호출 → 결과를 인라인 텍스트로 표시.
 */
export function RetryAnalysisButton({
  proposalId,
  size = "default",
  requireConfirm = false,
  label,
}: {
  proposalId: string;
  size?: "default" | "sm";
  requireConfirm?: boolean;
  /** 기본 라벨 (`분석 재시도`) 을 덮어쓰고 싶을 때. confirm 단계 라벨은 고정. */
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<
    | { kind: "success" }
    | { kind: "error"; message: string }
    | null
  >(null);

  // confirm 자동 해제 timeout — unmount / 다음 클릭 / 액션 종료 시 정리.
  // SkipAnalysisButton 과 동일 패턴.
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

  function execute() {
    startTransition(async () => {
      try {
        const res = await retryPlanProposalAnalysis(proposalId);
        if (res.ok) {
          setResult({ kind: "success" });
        } else {
          setResult({
            kind: "error",
            message:
              res.error === "not_found"
                ? "제안서를 찾지 못했어요."
                : "이미 건너뜀 처리된 제안서는 재시도할 수 없어요.",
          });
        }
      } catch (e) {
        console.error("[retry-analysis] publish failed", e);
        setResult({
          kind: "error",
          message: "SQS 발행 실패. 잠시 후 다시 시도해주세요.",
        });
      } finally {
        setConfirming(false);
      }
    });
  }

  function onClick() {
    if (!requireConfirm) {
      execute();
      return;
    }
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
    execute();
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        disabled={disabled}
        onClick={onClick}
        // confirm 모드의 pre-confirm 단계는 outline 으로 약하게 보여줘 클릭 직후
        // 시각이 변하는 두 단계 가드임을 노출 (SkipAnalysisButton 패턴 일치).
        variant={requireConfirm && !confirming ? "outline" : "default"}
        className={cn(
          "rounded-full font-medium",
          size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        )}
      >
        {pending
          ? "재요청 중…"
          : requireConfirm && confirming
            ? "정말 다시 분석할까요?"
            : (label ?? "분석 재시도")}
      </Button>
      {result?.kind === "success" && (
        <span className="text-xs text-black">재요청됨</span>
      )}
      {result?.kind === "error" && (
        <span className="text-xs text-red-600">{result.message}</span>
      )}
    </div>
  );
}
