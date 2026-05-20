import { requirePartnerSession } from "@/server/dal";

import { signOutPartner } from "./_actions/logout";

/**
 * 설계사 (dashboard) 레이아웃 — 로그인 필요 영역.
 *
 * `partner/layout.tsx` 셸 (480px + 브랜드 헤더) 안에 nested. 로그인이 필요한 페이지
 * (`/partner` 대시보드 등) 만 이 (dashboard) 라우트 그룹으로 들여 가드.
 *
 * 알림톡 토큰 진입 (`/partner/plan-request-assignments/[token]`) 과 로그인 페이지는 이 그룹 밖에
 * 배치 — 로그인 없이도 접근 가능해야 함.
 *
 * `requirePartnerSession()` = single source of truth (Supabase + partner 화이트리스트).
 * middleware 는 PPR fallback 차단용 optimistic 게이트일 뿐.
 */
export default async function PartnerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePartnerSession();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-end px-6 py-3 border-b border-[#efefef]">
        <form action={signOutPartner}>
          <button
            type="submit"
            className="text-xs text-[#4b4b4b] hover:text-black transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
      {children}
    </div>
  );
}
