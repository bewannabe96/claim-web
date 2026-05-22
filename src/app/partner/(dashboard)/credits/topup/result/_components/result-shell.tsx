import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 결제 결과 안내 셸 — 결과 페이지 (서버) 의 에러 분기와 TopupAck (클라이언트) 의
 * ack 결과 분기가 공용으로 쓰는 순수 프레젠테이션 컴포넌트. server-only 의존 없음.
 */
export function ResultShell({
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
