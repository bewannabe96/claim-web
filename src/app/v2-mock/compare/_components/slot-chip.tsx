"use client";

import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { cn } from "@/lib/utils";

import type { MockSlot } from "../../_lib/mock-slots";

/* ============================================================
 * Slot chip — v1 의 ProposalTabChip 의 v2 origin-aware 일반화.
 *
 * v1 chip 은 항상 "설계사 아바타 + 이름" (partner_submit 만 존재했음). v2 에서는
 * 슬롯이 1차 시민이라 origin 별로 표시가 다르되, 시각 노이즈는 절제:
 *
 *   - partner_submit  → 설계사 아바타 (검정 fallback) + 이름
 *   - customer_upload → 보험사 첫 글자 fallback (파랑 fallback) + 보험사명
 *
 * origin 구분은 **아바타 색상만**으로 — ◆/● 같은 prefix 심벌은 시각 노이즈라
 * 제거. 자세한 origin 컨텍스트는 활성화 시 본문 attribution 카드에서 다시 노출.
 *
 * 임시 분석 표시 (mode) 도 chip 에서는 마킹하지 않음 — chip 은 슬롯 식별 단일 책임,
 * 임시 분석은 활성화 시 본문 최상단 ProvisionalBanner 가 책임.
 *
 * v1 ProposalTabChip 은 한 줄도 안 건드림. 같은 sticky strip 안에 ul > li 자리에
 * 끼우는 형태로만 호환.
 * ============================================================ */
export function SlotChip({
  slot,
  selected,
  onSelect,
}: {
  slot: MockSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  const isPending = !slot.meta.analyzed;
  const isUpload = slot.origin === "customer_upload";

  // 분석 중 슬롯 — chip 라벨이 "분석 중..." generic (분석기가 메타 추출 전이라 보험사 모름).
  // 아바타 자리에 pulse dot.
  if (isPending) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "inline-flex shrink-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium whitespace-nowrap transition-colors",
          selected
            ? "bg-black text-white"
            : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center",
            selected ? "bg-white" : "bg-[#e2e2e2]",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full animate-pulse",
              selected ? "bg-black" : "bg-[#4b4b4b]",
            )}
          />
        </span>
        <span>분석 중…</span>
      </button>
    );
  }

  // 보험사명 (업로드) 또는 설계사명 (풀) — chip 의 1차 식별자.
  const label = isUpload
    ? (slot.externalMeta?.insurerName ?? slot.view.insurer)
    : slot.meta.partner.name;
  // 아바타 표시용 글자 — 풀 슬롯은 설계사 이름, 업로드는 보험사 첫 글자.
  const avatarName = isUpload ? label : slot.meta.partner.name;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium whitespace-nowrap transition-colors",
        selected
          ? "bg-black text-white"
          : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
      )}
    >
      <PartnerAvatar
        name={avatarName}
        avatarUrl={null}
        className="h-7 w-7 text-xs font-bold"
        fallbackClassName={
          selected
            ? "bg-white text-black"
            : isUpload
              ? "bg-[#1d4ed8] text-white"
              : "bg-black text-white"
        }
      />
      <span>{label}</span>
    </button>
  );
}
