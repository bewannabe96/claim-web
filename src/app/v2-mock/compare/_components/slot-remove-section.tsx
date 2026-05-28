"use client";

import { Trash2 } from "lucide-react";

import type { MockSlot } from "../../_lib/mock-slots";

/* ============================================================
 * SlotRemoveSection — 활성 슬롯 본문의 가장 하단에 위치하는 destructive 영역.
 *
 * "제거" 는 비교 워크플로우에서 자주 쓰이는 액션이 아니라 비가역 결정이므로,
 * primary CTA (fixed bottom action bar) 옆에 두지 않고 본문 끝으로 격리. 사용자가
 * 결과를 다 본 뒤에야 도달하는 위치라 우연한 오탭 위험 낮음.
 *
 * 클릭은 즉시 제거하지 않고 호출자가 confirm sheet 를 띄움 (SlotRemoveConfirmSheet).
 * "되돌릴 수 없음" 안내 후 명시 확인을 받는 두 단계 패턴.
 * ============================================================ */
export function SlotRemoveSection({
  slot,
  onClick,
}: {
  slot: MockSlot;
  onClick: () => void;
}) {
  // chip / attribution 과 일관된 라벨 — partner_submit 은 설계사명, customer_upload 는 보험사명.
  const label =
    slot.origin === "customer_upload"
      ? (slot.externalMeta?.insurerName ?? slot.view.insurer)
      : `${slot.meta.partner.name} 설계사 제안`;

  return (
    <section className="flex flex-col -mt-4 pt-6 border-t border-dashed border-[#efefef]">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center justify-center gap-1.5 self-center px-4 py-2 rounded-full border border-[#e2e2e2] bg-white text-xs font-medium text-red-700 hover:bg-red-50 hover:border-red-200 transition-colors"
      >
        <Trash2 size={13} strokeWidth={2} />
        <span className="break-keep">
          비교에서 <b>{label}</b> 제거
        </span>
      </button>
    </section>
  );
}
