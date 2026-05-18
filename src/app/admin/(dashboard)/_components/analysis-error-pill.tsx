import {
  ANALYSIS_ERROR_GROUP_LABEL,
  type AnalysisErrorGroup,
} from "@/features/proposals/schema";
import { cn } from "@/lib/utils";

/**
 * 분석 실패 group 별 색상 + 한글 라벨 pill — 어드민 "분석 실패" 페이지 + 요청
 * 상세에서 공유. group 색상 정책은 여기 한 곳에서만 정의.
 */
export function AnalysisErrorPill({ group }: { group: AnalysisErrorGroup }) {
  const className =
    group === "product_id_match"
      ? "bg-[#fef3c7] text-[#92400e] border border-[#fcd34d]"
      : group === "input_error"
        ? "bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5]"
        : "bg-[#efefef] text-[#4b4b4b] border border-[#d4d4d4]";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap",
        className,
      )}
    >
      {ANALYSIS_ERROR_GROUP_LABEL[group]}
    </span>
  );
}
