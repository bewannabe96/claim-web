"use client";

import { HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/* ============================================================
 * 임시 분석 배너 — v2 PRD §4.2 의 soft CTA + 분석 종류 시그널.
 *
 * 슬롯이 customer_upload + provisional 일 때 본문 최상단에 노출. 한 줄 디자인:
 *
 *   [ ⚠️ 임시 분석 (?)              [정식 분석 받기] ]
 *
 *   - 좌측 라벨: "이 분석은 임시 분석" 이라는 사실만 전달. (?) 클릭 → 세부 모달.
 *   - 우측 액션: 작은 amber 톤 채워진 버튼 "정식 분석 받기" — 호출자가 회원 가입 modal
 *               띄움. soft hook (PRD §4.5 의 provisional_cta trigger).
 *
 * 세부 안내 (왜 임시인지 / fallback 약관 / swap 정책) 는 (?) 모달이 책임 — banner
 * 자체는 한 줄로 깔끔하게 본문 시각 흐름을 끊지 않음.
 *
 * 모달 state 는 banner 자체 useState — workbench-view 가 관리하는 회원 가입 게이트
 * modal 과 책임 분리 (이건 정보성, 회원 가입은 funnel 액션).
 * ============================================================ */
export function ProvisionalBanner({
  fallbackTermsLabel,
  onSignupClick,
}: {
  /** customer_upload 슬롯의 fallback 약관 라벨 (모달 본문에 노출). */
  fallbackTermsLabel?: string;
  /** 게스트 → 회원 soft hook. */
  onSignupClick: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <section className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity"
          aria-label="임시 분석이 무엇인지 자세히 보기"
        >
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold shrink-0"
          >
            !
          </span>
          <span className="text-sm font-bold text-amber-900">임시 분석</span>
          <HelpCircle
            size={14}
            strokeWidth={2}
            className="text-amber-700/70 shrink-0"
            aria-hidden
          />
        </button>

        <button
          type="button"
          onClick={onSignupClick}
          className="shrink-0 rounded-full bg-amber-900 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-950 transition-colors"
        >
          정식 분석 받기
        </button>
      </section>

      <ProvisionalDetailSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        fallbackTermsLabel={fallbackTermsLabel}
      />
    </>
  );
}

/* ============================================================
 * 임시 분석 세부 안내 sheet — banner 의 라벨 클릭으로 open.
 *
 * banner 가 한 줄로 단순화되면서 세부 안내 (왜 임시인지, fallback 약관, swap 정책)
 * 가 모달로 격리. signup-modal / slot-remove-confirm-sheet 과 같은 bottom sheet 톤.
 *
 * Portal 로 document.body 에 렌더 — banner 가 article 안에 있고 article 이
 * provisional dimming 때문에 `opacity: 0.85` (새 stacking context) 가 박히면,
 * 그 안의 fixed inset-0 z-100 이 형제 nav 의 z-10 위로 못 올라가 chip strip 이
 * dim 위로 떠 보이는 stacking 버그가 생긴다. body 에 portal 하면 stacking context
 * 가 root 가 되어 모든 sticky/fixed 위에 정상 표시.
 *
 * 정보성 modal 이라 destructive 아닌 톤 — 배경 클릭으로 닫기 허용.
 * ============================================================ */
function ProvisionalDetailSheet({
  open,
  onClose,
  fallbackTermsLabel,
}: {
  open: boolean;
  onClose: () => void;
  fallbackTermsLabel?: string;
}) {
  // SSR 안전 — portal 은 client mount 후에만.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
        <header className="flex items-start justify-between gap-3 px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-sm font-bold"
            >
              !
            </span>
            <h2 className="text-base font-bold tracking-tight text-black">
              임시 분석이란?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-8 w-8 rounded-full hover:bg-[#efefef] flex items-center justify-center text-[#4b4b4b]"
            aria-label="닫기"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="px-6 pb-6 pt-2 flex flex-col gap-3">
          <p className="text-sm text-[#4b4b4b] leading-relaxed">
            아직 이 상품의 약관을 자세히 살펴보지 못했어요.
          </p>
          <p className="text-sm text-[#4b4b4b] leading-relaxed">
            우선은{" "}
            <b className="text-black">
              {fallbackTermsLabel ?? "비슷한 상품의 약관"}
            </b>
            을 참고해 대략적인 결과를 보여드리고 있어요. 실제와는 차이가 있을 수
            있어요.
          </p>
          <p className="text-sm text-[#4b4b4b] leading-relaxed">
            <b className="text-black">회원 가입</b>하시면 정확한 분석이 끝나는
            대로 알림톡으로 알려드리고, 결과를 자동으로 바꿔드려요.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
