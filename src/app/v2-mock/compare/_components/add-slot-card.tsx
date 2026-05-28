"use client";

import { Plus } from "lucide-react";

/**
 * [+ 슬롯 추가] chip — sticky strip 끝에 carousel 형태로 항상 노출.
 *
 * v2 PRD §4.4 "빈 슬롯이 0 일 때 빈 카드 carousel 끝에 항상 [+ 추가] 카드 노출".
 * mock 단계에서는 클릭 시 회원 가입 게이트 modal (second_upload trigger) — 채워진
 * 워크벤치에서 두 번째+ 슬롯 추가 시도는 hard gate 라는 PRD §4.5 의 시각화.
 *
 * 사이즈는 SlotChip 와 정확히 동일 — 같은 carousel 안에서 시각 일관성. 색상만
 * dashed border 로 entry affordance 차별화.
 */
export function AddSlotCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-dashed border-black/40 bg-white py-1 pr-3 pl-1 text-sm font-semibold text-black hover:border-black hover:bg-[#fafafa] transition-colors"
    >
      {/* SlotChip 의 PartnerAvatar 와 같은 h-7 w-7 자리 — Plus 아이콘 중앙 정렬. */}
      <span
        aria-hidden
        className="h-7 w-7 rounded-full bg-[#efefef] flex items-center justify-center text-black"
      >
        <Plus size={14} strokeWidth={2.5} />
      </span>
      <span>제안서 추가</span>
    </button>
  );
}
