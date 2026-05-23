import type { Metadata } from "next";
import Link from "next/link";

import { PosthogBootstrap } from "@/components/analytics/posthog-bootstrap";
import { BrandMark } from "@/components/brand-mark";

/**
 * (partner) 레이아웃 — 설계사 영역.
 * 일회용 토큰 진입과 로그인 진입 두 흐름이 공존.
 *
 * DESIGN.md — 모노크롬 헤더, 워드마크 옆에 작은 sub-mark.
 *
 * metadata.robots — `/partner/*` 전 페이지 noindex. 로그인 / 토큰 / 가입 초청
 * 흐름이라 검색 노출 가치 없음. admin 처럼 HTTP X-Robots-Tag 까지 가지 않고
 * `<meta name="robots">` 만으로도 충분 (의도적 공개 페이지 아니라 hostile 크롤러
 * 차단 목적 아님 — 일반 검색엔진에게만 색인 제외 신호).
 *
 * 행동 분석 (PostHog) 은 `<PosthogBootstrap />` 가 책임 — (marketing) 과
 * 동일하게 partner 가입 / 대시보드 흐름까지 funnel 추적. admin layout 은
 * 의도적으로 미적용 (operator 행동은 추적 X). 도메인 코드와 분리된 격리
 * 경계는 [src/components/analytics/CLAUDE.md](src/components/analytics/CLAUDE.md) 참조.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col bg-white min-[480px]:border-x min-[480px]:border-[#e2e2e2] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
      <PosthogBootstrap />
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
