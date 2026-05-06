"use client";

import { BrandMark } from "@/components/brand-mark";
import { AlertIcon } from "@/components/status-screen";

/**
 * 루트 에러 boundary.
 * Next.js 컨벤션: 'use client' 필수, { error, reset } prop.
 *
 * StatusScreen 을 직접 쓰지 않는 이유 — reset() 은 Link 가 아닌 button.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <BrandMark />

      <div className="mt-20 flex flex-col items-center text-center gap-5">
        <span
          className="flex items-center justify-center w-16 h-16 rounded-full bg-[#efefef] text-black"
          aria-hidden
        >
          <AlertIcon />
        </span>
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          문제가 발생했어요
        </h1>
        <p className="text-sm text-[#4b4b4b] leading-relaxed max-w-xs">
          {error.message || "알 수 없는 오류입니다. 잠시 후 다시 시도해주세요."}
        </p>
      </div>

      <div className="mt-auto pt-10">
        <button
          type="button"
          onClick={reset}
          className="w-full h-14 rounded-full text-base font-medium bg-black text-white hover:bg-[#1a1a1a] transition-colors"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
