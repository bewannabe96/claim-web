import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { requireAdminSession } from "@/server/dal";

import { signOutAdmin } from "./_actions/logout";
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
 * `requireAdminSession()` 가 진짜 인증 boundary — Supabase 인증 + admin_users 권한
 * 체크 둘 다 통과해야 자식이 렌더링됨. 실패 시 /admin/login 으로 redirect.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSession();

  return (
    <div className="w-full flex-1 flex flex-col bg-white min-h-screen">
      {/* Top bar */}
      <header className="border-b border-[#efefef] bg-white">
        <div className="mx-auto max-w-[1280px] px-8 h-14 flex items-center justify-between gap-4">
          <Link href="/admin" className="inline-flex items-baseline gap-2">
            <BrandMark />
            <span className="text-sm text-[#4b4b4b]">운영자</span>
          </Link>
          <form action={signOutAdmin}>
            <button
              type="submit"
              className="text-xs text-[#4b4b4b] hover:text-black transition-colors"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <AdminNav />

      <div className="mx-auto max-w-[1280px] w-full px-8 py-10 flex-1">
        {children}
      </div>
    </div>
  );
}
