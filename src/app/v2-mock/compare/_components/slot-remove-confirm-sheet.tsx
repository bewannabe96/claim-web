"use client";

import { AlertTriangle } from "lucide-react";

import type { MockSlot } from "../../_lib/mock-slots";

/* ============================================================
 * SlotRemoveConfirmSheet — 슬롯 제거 확인 bottom sheet.
 *
 * 슬롯 제거는 비가역 (mock 에서는 in-memory 제거, 실 라우트에서는 soft delete 지만
 * 가입자가 같은 슬롯을 다시 가져오기 어려움). 명시 confirm 필수.
 *
 * 시각 언어는 signup-modal 과 같은 bottom sheet 패턴 — 배경 dim + sheet from bottom.
 * destructive tone (빨강 강조) 으로 결정의 무게를 알린다.
 * ============================================================ */
export function SlotRemoveConfirmSheet({
  open,
  slot,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** open=true 일 때만 의미. close 시 null 로 닫음. */
  slot: MockSlot | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !slot) return null;

  const label =
    slot.origin === "customer_upload"
      ? (slot.externalMeta?.insurerName ?? slot.view.insurer)
      : `${slot.meta.partner.name} 설계사`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 px-6 pt-6 pb-3">
          <span
            aria-hidden
            className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-700"
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold tracking-tight text-black">
              이 제안서를 비교에서 제거할까요?
            </h2>
            <p className="mt-1 text-xs text-[#4b4b4b] leading-relaxed">
              <b>{label}</b> 의 분석 결과가 비교 화면에서 사라져요.
              <br />
              <span className="text-red-700 font-semibold">
                되돌릴 수 없어요.
              </span>{" "}
              필요하면 같은 파일을 다시 업로드해야 해요.
            </p>
          </div>
        </header>

        <div className="flex items-stretch gap-2 px-6 pb-6 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full border border-[#e2e2e2] bg-white text-[#4b4b4b] text-sm font-semibold hover:border-black hover:text-black transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 h-12 rounded-full bg-red-700 text-white text-sm font-semibold hover:bg-red-800 transition-colors"
          >
            제거
          </button>
        </div>
      </div>
    </div>
  );
}
