import { CreditBalanceCard } from "@/features/credits/ui/credit-balance-card";
import { LedgerList } from "@/features/credits/ui/ledger-list";
import { requirePartnerSession } from "@/server/dal";

/**
 * 파트너 크레딧 페이지 — 잔액 + 거래 내역 (페이지네이션).
 *
 * `searchParams.cursor` 는 base64url 인코딩된 (createdAt|id) 쌍. queries.ts 가 decode.
 */
export default async function PartnerCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requirePartnerSession();
  const { cursor } = await searchParams;

  return (
    <main className="flex flex-col flex-1 gap-6 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        크레딧
      </h1>
      <CreditBalanceCard partnerId={session.partnerId} showActions />

      <section className="rounded-xl border border-[#efefef] bg-white p-6">
        <h2 className="text-base font-bold text-black tracking-tight mb-3">
          거래 내역
        </h2>
        <LedgerList
          partnerId={session.partnerId}
          mode="full"
          cursor={cursor ?? null}
        />
      </section>
    </main>
  );
}
