import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { requireAdminSession } from "@/server/dal";

import { signOutAdmin } from "./_actions/logout";
import { AdminNav } from "./_components/admin-nav";
import { NotificationBell } from "./_components/notification-bell";

/**
 * 어드민 (dashboard) 레이아웃 — 운영자 PC 환경.
 *
 * 단일 가로선만 사용 (브랜드 / 네비 / 본문 사이 분리는 nav 아래 한 줄로 충분).
 *
 * `/admin/login` 은 이 레이아웃 밖 — 로그인 전엔 nav 가 보이지 않아야 함.
 *
 * `requireAdminSession()` 가 진짜 인증 boundary.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSession();

  return (
    <div className="w-full flex-1 flex flex-col bg-[#fafafa] min-h-screen">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-[#efefef]">
        <div className="mx-auto max-w-[1280px] px-8 h-14 flex items-center justify-between gap-6">
          <Link href="/admin" className="inline-flex items-baseline gap-2">
            <BrandMark />
            <span className="text-xs text-[#afafaf] uppercase tracking-wider">
              Admin
            </span>
          </Link>
          <AdminNav />
          <div className="flex items-center gap-3">
            <NotificationBell />
            <form action={signOutAdmin}>
              <button
                type="submit"
                className="text-xs text-[#4b4b4b] hover:text-black transition-colors"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] w-full px-8 py-10 flex-1">
        {children}
      </div>
    </div>
  );
}
