import { CreditBalanceCard } from "@/features/credits/ui/credit-balance-card";
import { requirePartnerSession } from "@/server/dal";

/**
 * 설계사 대시보드 — 로그인 직후 진입 페이지.
 *
 * 현재 위젯: 크레딧 잔액 카드 (충전/내역 CTA 포함). 본인 받은 요청 / 진행 현황 /
 * 정산 위젯은 후속 PR.
 */
export default async function PartnerDashboardPage() {
  const session = await requirePartnerSession();

  return (
    <main className="flex flex-col flex-1 gap-6 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        환영합니다, {session.user.name} 님
      </h1>
      <CreditBalanceCard partnerId={session.partnerId} showActions />
    </main>
  );
}
