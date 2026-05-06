import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

/**
 * (agent) 레이아웃 — 설계사 영역.
 * 일회용 토큰 진입과 로그인 진입 두 흐름이 공존.
 *
 * DESIGN.md — 모노크롬 헤더, 워드마크 옆에 작은 sub-mark.
 */
export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col bg-white border-x border-[#e2e2e2] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
      <header className="border-b border-[#efefef] bg-white sticky top-0 z-10">
        <div className="px-6 h-14 flex items-center gap-2">
          <Link href="/" className="inline-flex items-baseline gap-2">
            <BrandMark />
            <span className="text-sm text-[#4b4b4b]">설계사</span>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
