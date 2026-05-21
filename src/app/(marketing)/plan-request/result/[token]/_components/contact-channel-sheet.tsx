"use client";

import { useEffect } from "react";

import type { ContactChannel } from "@/features/plan-proposals/schema";
import { cn } from "@/lib/utils";

/* ============================================================
 * 연락 수단 선택 — 상담 진행하기 CTA 클릭 시 노출되는 바텀 시트.
 *
 * scenario-modal.tsx 와 동일 패턴 (모바일 bottom sheet / 데스크탑 centered modal,
 * ESC + body scroll lock, bg-black/40 백드롭, max-w-[480px] 패널). 두 옵션만
 * 노출하므로 검색/리스트 영역 없이 큰 버튼 두 개만 배치.
 * ============================================================ */

export function ContactChannelSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (channel: ContactChannel) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="상담 방법 선택"
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative w-full max-w-[480px] flex flex-col bg-white rounded-t-xl sm:rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.16)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#efefef]">
          <h2 className="text-xl font-bold text-black">상담 방법 선택</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-[#f3f3f3] text-[#4b4b4b]"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-5 flex flex-col gap-3">
          <ChannelButton
            title="카카오톡으로 상담"
            onClick={() => onSelect("kakao")}
          />
          <ChannelButton
            title="문자로 상담"
            onClick={() => onSelect("sms")}
          />
        </div>
      </div>
    </div>
  );
}

function ChannelButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full px-5 py-4 rounded-xl border border-[#efefef]",
        "hover:bg-[#f3f3f3] transition-colors",
        "text-base font-semibold text-black",
      )}
    >
      {title}
    </button>
  );
}
