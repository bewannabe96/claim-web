"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

/* ============================================================
 * 회원가입 게이트 modal — v2 PRD §4.5.
 *
 * 책임은 **카카오 OAuth 진입 한 hop** 으로 좁히되, 표준 OAuth 모달의 minimal chrome
 * (브랜드 + 짧은 헤드라인 + 약관 footer) 은 유지 — 사용자가 "지금 무엇을 누르는지"
 * 컨텍스트가 한눈에 잡혀야 함.
 *
 *   - "왜 가입이 필요한가" 안내는 모달 트리거 전 entry 옆 (빈 워크벤치 CTA 카드
 *     하단 등) 에서 자연스럽게 전달.
 *   - 휴대폰 인증 같은 온보딩 단계는 모달 안이 아닌 별도 페이지 (/v2-mock/onboarding).
 *
 * trigger enum 은 analytics 라벨용으로 유지 (`signup_via=second_upload|pool_entry|provisional_cta`).
 *
 * 실 라우트에서는 카카오 OAuth redirect → callback 으로 복귀 + 세션 set → onboarding
 * 페이지로 push. mock 은 즉시 onboarding 으로 navigate.
 * ============================================================ */

export type SignupTrigger = "second_upload" | "pool_entry" | "provisional_cta";

export function SignupModal({
  open,
  trigger,
  onClose,
}: {
  open: boolean;
  /** open=true 일 때만 의미. null 이면 modal 표시 안 함. analytics trigger 라벨용. */
  trigger: SignupTrigger | null;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!open || !trigger) return null;

  function handleKakaoLogin() {
    // mock 카카오 OAuth — 실 라우트에서는 redirect 후 callback. 여기서는 즉시 onboarding.
    router.push(`/v2-mock/onboarding?from=${trigger}`);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-[#efefef] flex items-center justify-center text-[#4b4b4b]"
            aria-label="닫기"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Brand + 짧은 헤드라인 — 사용자가 어떤 product 의 OAuth 인지 한눈에. */}
        <header className="px-6 pt-2 pb-6 flex flex-col items-center text-center gap-3">
          <p className="text-[11px] font-bold tracking-[0.2em] text-[#afafaf]">
            CLAIM
          </p>
          <h2 className="text-xl font-bold tracking-tight text-black leading-tight">
            3초 만에 시작하세요
          </h2>
          <p className="text-xs text-[#4b4b4b] leading-relaxed">
            카카오 계정으로 간편하게 로그인해요.
          </p>
        </header>

        <div className="px-6">
          <button
            type="button"
            onClick={handleKakaoLogin}
            className="w-full h-14 rounded-xl bg-[#FEE500] text-[#191919] text-base font-semibold flex items-center justify-center gap-2 hover:brightness-95 transition-all"
          >
            <KakaoIcon />
            카카오로 시작하기
          </button>
        </div>

        {/* Footer — 약관/개인정보 안내. 정통 OAuth 모달 chrome. */}
        <footer className="px-6 pt-4 pb-6 text-[10px] text-[#afafaf] leading-relaxed text-center">
          계속 진행하면 CLAIM 의{" "}
          <a className="underline hover:text-black" href="#" onClick={(e) => e.preventDefault()}>
            이용약관
          </a>{" "}
          과{" "}
          <a className="underline hover:text-black" href="#" onClick={(e) => e.preventDefault()}>
            개인정보 처리방침
          </a>
          에 동의하는 것으로 간주돼요.
        </footer>
      </div>
    </div>
  );
}

/** 카카오톡 말풍선 inline SVG — 간단화된 형태. */
function KakaoIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.86 1.88 5.36 4.7 6.76l-1.04 3.78c-.1.36.3.66.62.46l4.52-2.96c.4.04.8.06 1.2.06 5.52 0 10-3.58 10-8C22 6.58 17.52 3 12 3z" />
    </svg>
  );
}
