"use client";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";

import type { MockSlot } from "../../_lib/mock-slots";

/* ============================================================
 * Slot action bar — fixed bottom CTA. partner_submit 슬롯 전용 ("상담 진행하기").
 *
 * customer_upload 슬롯은 fixed bar 자체가 없다:
 *   - provisional → "정식 분석 받기" CTA 는 본문 최상단 ProvisionalBanner 가 책임
 *   - final       → 추가 액션 없음 (이미 정식 분석 완료, 외부 설계사 연락은 시스템 밖)
 *
 * 따라서 호출자 (workbench-view) 가 origin === 'partner_submit' 일 때만 본 컴포넌트
 * 를 fixed wrapper 안에 렌더하고, 그 외에는 fixed wrapper 자체를 안 그린다.
 *
 * "제거" 액션은 본문 끝 SlotRemoveSection 책임 — 본 fixed bar 에 없음.
 * ============================================================ */
export function SlotActionBar({
  slot,
  onContactClick,
}: {
  /** 호출자가 partner_submit 슬롯에서만 렌더하므로 origin 분기 불필요. */
  slot: MockSlot;
  /** "상담 진행하기" 클릭. mock 에서는 alert. */
  onContactClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onContactClick}
      className="w-full h-14 rounded-full text-base font-medium transition-colors bg-black text-white hover:bg-[#1a1a1a]"
    >
      <span className={NO_TRACK_CLASS}>{slot.meta.partner.name}</span> 설계사와
      상담 진행하기
    </button>
  );
}
