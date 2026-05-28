import { cn } from "@/lib/utils";

import type { SlotOrigin } from "../../_lib/mock-slots";

/**
 * 슬롯 origin 배지 — v2 PRD §4.4 의 "직접 업로드" / "CLAIM 매칭".
 *
 * 비교 화면 본문의 attribution 카드에서 어떻게 들어온 슬롯인지 한눈에. emoji
 * 시각 노이즈 (🟦/🟩) 는 제거하고 작은 색상 dot + 텍스트만으로 절제 — chip strip
 * 의 아바타 색상과 같은 톤이라 mental model 일관.
 */
export function OriginBadge({
  origin,
  size = "xs",
  className,
}: {
  origin: SlotOrigin;
  size?: "xs" | "sm";
  className?: string;
}) {
  const isUpload = origin === "customer_upload";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
        isUpload
          ? "bg-[#e6f0ff] text-[#1d4ed8]"
          : "bg-[#dcfce7] text-[#15803d]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block rounded-full",
          size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2",
          isUpload ? "bg-[#1d4ed8]" : "bg-[#15803d]",
        )}
      />
      {isUpload ? "직접 업로드" : "CLAIM 매칭"}
    </span>
  );
}
