"use client";

import { useState, useTransition } from "react";

import { retryProposalAnalysis } from "@/features/proposals/actions";
import { cn } from "@/lib/utils";

/**
 * 분석 재시도 버튼 — 어드민 "분석 실패" 페이지 + 요청 상세에서 공유.
 *
 * 클릭 → `retryProposalAnalysis(proposalId)` 호출 → 결과를 인라인 텍스트로 표시
 * (성공 시 "재요청됨", 실패 시 사유). 서버가 `revalidatePath` 를 부르므로 위 row
 * 는 곧 사라지지만, 1) 네비게이션 race, 2) 동시 다른 row 처리 가능성 때문에 버튼
 * 자체는 결과 메시지를 자신의 상태로 들고 있음.
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
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          startTransition(async () => {
            try {
              const res = await retryProposalAnalysis(proposalId);
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
          "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          disabled
            ? "bg-[#efefef] text-[#afafaf] cursor-not-allowed"
            : "bg-black text-white hover:bg-[#1f1f1f]",
        )}
      >
        {pending ? "재요청 중…" : "분석 재시도"}
      </button>
      {result?.kind === "success" && (
        <span className="text-xs text-black">재요청됨</span>
      )}
      {result?.kind === "error" && (
        <span className="text-xs text-[#c2410c]">{result.message}</span>
      )}
    </div>
  );
}
