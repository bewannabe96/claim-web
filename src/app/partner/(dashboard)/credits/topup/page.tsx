import type { Metadata } from "next";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { TopupAmountForm } from "@/features/credits/ui/topup-amount-form";
import { cn } from "@/lib/utils";
import { requirePartnerSession } from "@/server/dal";

export const metadata: Metadata = {
  title: "크레딧 충전",
  description: "충전할 금액을 입력하면 결제 페이지로 이동해요.",
};

/**
 * 충전 페이지 — 금액 입력 → server action 이 paymentId 생성 + stash + provider 초기화 →
 * redirectUrl 반환 → 클라이언트가 PG 위젯 / stub webhook URL 로 이동.
 *
 * 실 PG (PortOne/Toss) 연동 시 이 페이지가 PG 위젯 mount point 가 됨.
 *
 * `<main>` 자체에 `NO_TRACK_CLASS` — PG 결제 흐름 전체를 session replay 에서
 * 블록 (PortOne iframe 밖의 금액 입력 / 결제 요약도 포함). autocapture 도
 * 함께 차단되지만 어차피 결제 클릭 행동만 빠지는 정도라 분석 손실 미미.
 */
export default async function PartnerTopupPage() {
  await requirePartnerSession();

  return (
    <main
      className={cn(
        "flex flex-col flex-1 gap-6 px-6 pt-10 pb-8 bg-white",
        NO_TRACK_CLASS,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          크레딧 충전
        </h1>
        <p className="text-sm text-[#4b4b4b]">
          충전할 금액을 입력하면 결제 페이지로 이동해요.
        </p>
      </div>

      <section className="rounded-xl border border-[#efefef] bg-white p-6">
        <TopupAmountForm />
      </section>
    </main>
  );
}
