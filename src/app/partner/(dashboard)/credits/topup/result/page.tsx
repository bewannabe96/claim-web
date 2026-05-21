import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { acknowledgeTopup } from "@/features/credits/actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "결제 결과",
  description: "크레딧 충전 결제 결과를 확인하세요.",
};

/**
 * 모바일 SDK redirectUrl 착지 페이지.
 *
 * PortOne SDK 가 모바일에서 결제창 종료 후 navigate. URL query:
 *   - 성공: `?paymentId=...`
 *   - 실패: `?paymentId=...&code=...&message=...&pgCode=...&pgMessage=...`
 *
 * 처리:
 *   - code 있음 → 실패 안내 + 재시도 링크.
 *   - code 없음 → server 측에서 acknowledgeTopup 직접 호출 → 잔액 갱신 + 성공 안내.
 *     ack 가 실패해도 webhook 가 redundant safety net 이라 잔액은 결국 들어옴 — 사용자에겐
 *     "잠시 후 잔액 확인" 폴백 메시지.
 *
 * 인증: (dashboard) layout 의 requirePartnerSession 이 보장. acknowledgeTopup 내부에서
 *       partnerId 교차 검증 한 번 더.
 *
 * cacheComponents: searchParams 사용으로 자동 dynamic. 루트 loading.tsx 가 fallback.
 */
export default async function TopupResultPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentId?: string;
    code?: string;
    message?: string;
    pgCode?: string;
    pgMessage?: string;
  }>;
}) {
  const params = await searchParams;
  const paymentId = params.paymentId;
  const code = params.code;

  if (!paymentId) {
    return (
      <ResultShell
        tone="error"
        title="결제 정보가 없어요"
        body="잘못된 경로로 도착했어요. 다시 시도해주세요."
        cta="크레딧 페이지로"
        href="/partner/credits"
      />
    );
  }

  if (code) {
    return (
      <ResultShell
        tone="error"
        title="결제가 완료되지 않았어요"
        body={params.message ?? params.pgMessage ?? `오류 코드: ${code}`}
        cta="다시 충전하기"
        href="/partner/credits/topup"
      />
    );
  }

  const ack = await acknowledgeTopup({ paymentId });

  if (ack.ok) {
    return (
      <ResultShell
        tone="success"
        title={ack.alreadyApplied ? "이미 처리된 결제예요" : "충전이 완료됐어요"}
        body="잔액에 즉시 반영됐어요."
        cta="크레딧 페이지로"
        href="/partner/credits"
      />
    );
  }

  // ack 실패 — webhook safety net 에 위임.
  return (
    <ResultShell
      tone="pending"
      title="결제 확인 중이에요"
      body={`잔액 페이지에서 곧 반영을 확인해주세요. (사유: ${ack.error})`}
      cta="크레딧 페이지로"
      href="/partner/credits"
    />
  );
}

function ResultShell({
  tone,
  title,
  body,
  cta,
  href,
}: {
  tone: "success" | "error" | "pending";
  title: string;
  body: string;
  cta: string;
  href: "/partner/credits" | "/partner/credits/topup";
}) {
  const accent =
    tone === "success"
      ? "text-emerald-600"
      : tone === "error"
        ? "text-red-600"
        : "text-amber-600";

  return (
    <main className="flex flex-col flex-1 gap-8 px-6 pt-16 pb-8 bg-white">
      <div className="flex flex-col gap-2 text-center">
        <p className={cn("text-xs font-medium uppercase tracking-wide", accent)}>
          {tone === "success" ? "완료" : tone === "error" ? "실패" : "확인 중"}
        </p>
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          {title}
        </h1>
        <p className="text-sm text-[#4b4b4b]">{body}</p>
      </div>
      <Link
        href={href}
        className={cn(
          buttonVariants(),
          "h-12 rounded-full text-sm font-medium",
        )}
      >
        {cta}
      </Link>
    </main>
  );
}
