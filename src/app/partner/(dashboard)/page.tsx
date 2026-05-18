import { requirePartnerSession } from "@/server/dal";

/**
 * 설계사 대시보드 — 로그인 직후 진입 페이지.
 *
 * 현재는 placeholder. 본인 받은 요청 / 진행 현황 / 정산 등 실제 대시보드 UI 는
 * 별도 PR. 인증 흐름 검증 + 라우트 자리 확보 용도.
 */
export default async function PartnerDashboardPage() {
  const session = await requirePartnerSession();

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        환영합니다, {session.user.name} 님
      </h1>
      <p className="mt-3 text-sm text-[#4b4b4b]">
        대시보드는 곧 제공될 예정이에요.
      </p>
    </main>
  );
}
