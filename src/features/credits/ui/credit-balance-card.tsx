import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getCreditBalance } from "../queries";

/**
 * 잔액 카드 — Server Component. 어드민/파트너 양쪽에서 임베드.
 *
 * `'use cache'` 미사용 — 호출 상위 페이지가 require*Session() 으로 쿠키를 읽어
 * 자동 dynamic. 새 잔액은 revalidatePath 만으로 충분.
 */
export async function CreditBalanceCard({
  partnerId,
  showActions = false,
  className,
}: {
  partnerId: string;
  showActions?: boolean;
  className?: string;
}) {
  const { balance } = await getCreditBalance(partnerId);

  return (
    <section
      className={cn(
        "rounded-xl border border-[#efefef] bg-white p-6 flex flex-col gap-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-[#4b4b4b]">현재 보유 크레딧</p>
        <p className="text-3xl font-bold tracking-tight text-black">
          {formatKrw(balance)}
          <span className="text-base font-medium text-[#4b4b4b] ml-1.5">원</span>
        </p>
      </div>
      {showActions && (
        <div className="flex items-center gap-2">
          <Button
            render={<Link href="/partner/credits/topup" />}
            nativeButton={false}
            size="lg"
            className="rounded-full px-6"
          >
            충전하기
          </Button>
          <Button
            render={<Link href="/partner/credits" />}
            nativeButton={false}
            variant="secondary"
            size="lg"
            className="rounded-full px-6"
          >
            내역 보기
          </Button>
        </div>
      )}
    </section>
  );
}

const KRW = new Intl.NumberFormat("ko-KR");
export function formatKrw(n: number): string {
  return KRW.format(n);
}
