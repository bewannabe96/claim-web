import { cookies } from "next/headers";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

import { AdminNav } from "./_components/admin-nav";

/**
 * 어드민 (dashboard) 레이아웃 — 운영자 PC 환경.
 *
 * 480px 가입자 컨테이너에서 벗어나 max-w-[1280px] 와이드. 모든 본문은
 * 같은 max-width 로 정렬해 정보 밀도와 가독성을 유지.
 *
 * `/admin/login` 은 이 레이아웃 밖 (route group `(dashboard)` 비포함) — 로그인 전엔
 * nav 가 보이지 않아야 함.
 *
 * cacheComponents=true — 어드민은 항상 최신 운영 데이터를 봐야 하므로 `cookies()` 를
 * 한 번 읽어 서브트리 전체를 dynamic 으로 마킹. (실 인증은 후속 단계에서 이 cookie 검증.)
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await cookies();
  return (
    <div className="w-full flex-1 flex flex-col bg-white min-h-screen">
      {/* Top bar */}
      <header className="border-b border-[#efefef] bg-white">
        <div className="mx-auto max-w-[1280px] px-8 h-14 flex items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex items-baseline gap-2">
            <BrandMark />
            <span className="text-sm text-[#4b4b4b]">운영자</span>
          </Link>
          <Link
            href="/admin/login"
            className="text-xs text-[#4b4b4b] hover:text-black transition-colors"
          >
            로그아웃
          </Link>
        </div>
      </header>

      <AdminNav />

      <div className="mx-auto max-w-[1280px] w-full px-8 py-10 flex-1">
        {children}
      </div>
    </div>
  );
}
