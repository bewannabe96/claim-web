"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { retryPlanProposalAnalysis } from "@/features/plan-proposals/actions";
import { cn } from "@/lib/utils";

/**
 * 분석 재시도 버튼 — 어드민 "분석 실패" 페이지 + 요청 상세에서 공유.
 *
 * 클릭 → `retryPlanProposalAnalysis(proposalId)` 호출 → 결과를 인라인 텍스트로 표시
 * (성공 시 "재요청됨", 실패 시 사유).
 */
export function RetryAnalysisButton({
  proposalId,
  size = "default",
}: {
  proposalId: string;
  size?: "default" | "sm";
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { kind: "success" }
    | { kind: "error"; message: string }
    | null
  >(null);

  const disabled = pending || result?.kind === "success";

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        disabled={disabled}
        onClick={() =>
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
                      : "이미 분석이 완료된 제안서예요.",
                });
              }
            } catch (e) {
              console.error("[retry-analysis] publish failed", e);
              setResult({
                kind: "error",
                message: "SQS 발행 실패. 잠시 후 다시 시도해주세요.",
              });
            }
          })
        }
        className={cn(
          "rounded-full font-medium",
          size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        )}
      >
        {pending ? "재요청 중…" : "분석 재시도"}
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
