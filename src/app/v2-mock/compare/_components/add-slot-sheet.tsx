"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { EntryCard } from "../../_components/entry-card";

/* ============================================================
 * AddSlotSheet — 채워진 워크스페이스의 chip [+ 제안서 추가] picker.
 *
 * v2 PRD §4.4 의 흐름:
 *   chip [+ 제안서 추가] 클릭 → 본 sheet 노출 ([업로드] / [클레임 파트너로부터 받기])
 *     → 옵션 선택 → **비회원이면 §4.5 가입 게이트, 회원이면 바로 해당 action 진입**.
 *
 * 호출자 (compare-page-body) 가 `authed` 값을 받아 분기 처리:
 *   - 회원 + [업로드]      → `/v2-mock/upload` navigate
 *   - 회원 + [받기]        → 요청서 wizard (mock 미구현, 호출자가 alert)
 *   - 비회원 + [업로드]   → SignupModal (second_upload trigger)
 *   - 비회원 + [받기]     → SignupModal (pool_entry trigger)
 *
 * 헤더 밑 **mock 전용 toggle** [비회원 / 회원] — 같은 sheet 안에서 두 분기를
 * 시연하기 위한 dev-only 위젯. 실 라우트에서는 서버가 세션으로 자동 판별하므로
 * toggle 없음.
 *
 * Portal 로 document.body 에 렌더 — chip strip 의 sticky stacking context 회피.
 * ============================================================ */
export function AddSlotSheet({
  open,
  onClose,
  onSelectUpload,
  onSelectPool,
}: {
  open: boolean;
  onClose: () => void;
  /** [PDF 또는 사진 업로드] 선택. `authed` 에 따라 호출자가 navigate 또는 modal 분기. */
  onSelectUpload: (authed: boolean) => void;
  /** [클레임 파트너로부터 받기] 선택. `authed` 에 따라 호출자가 wizard 또는 modal 분기. */
  onSelectPool: (authed: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => setMounted(true), []);

  // open 토글 시 mock authed 상태 리셋 (기본 비회원).
  useEffect(() => {
    if (open) setAuthed(false);
  }, [open]);

  if (!open || !mounted) return null;

  const sheet = (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 className="text-base font-bold tracking-tight text-black">
            제안서 추가
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-[#efefef] flex items-center justify-center text-[#4b4b4b]"
            aria-label="닫기"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        {/* MOCK toggle — 비회원/회원 시뮬레이션. 실 라우트에는 없음. */}
        <div className="mx-6 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold tracking-wide text-amber-900 px-1">
            MOCK · 가입 상태
          </span>
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-white border border-amber-200">
            <ToggleChip
              active={!authed}
              onClick={() => setAuthed(false)}
              label="비회원"
            />
            <ToggleChip
              active={authed}
              onClick={() => setAuthed(true)}
              label="회원"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-3">
          <EntryCard
            label="PDF 또는 사진 업로드"
            desc={
              <>
                외부에서 받은 제안서의 PDF 나 사진을 올리면 객관 리포트로
                변환해드려요. 다른 제안서와 함께 비교에 활용할 수 있어요.
              </>
            }
            onClick={() => onSelectUpload(authed)}
          />
          <EntryCard
            label="클레임 파트너로부터 받기"
            desc={
              <>
                CLAIM 에서 활동하는 독립 설계사를 직접 선택해 제안서를 요청하고
                비교해보세요.{" "}
                <b className="text-black">영업 전화는 절대 없어요.</b>
              </>
            }
            onClick={() => onSelectPool(authed)}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-900 text-white"
          : "px-2.5 py-1 rounded text-[11px] font-medium text-amber-900 hover:bg-amber-100"
      }
    >
      {label}
    </button>
  );
}
