"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

type LandingCtaButtonProps = {
  variant?: "default" | "secondary";
  className?: string;
  children: React.ReactNode;
  /**
   * Google Ads conversion `send_to` 대상 (예: `AW-18152072488` 또는
   * `AW-18152072488/AbCdEfG`). undefined 면 gtag 발화 스킵 — dev/staging 등
   * 광고 픽셀이 비활성인 환경에서 무해하게 동작.
   */
  googleAdsConversionTarget?: string;
};

/**
 * 랜딩 "요청서 작성하고 제안 받기" CTA — 클릭 시 광고 컨버전 이벤트 firing.
 * - Meta Pixel: `Lead` 표준 이벤트 (요청서 작성 의향 표명).
 *   fbq 글로벌이 없으면 (env 미설정) 옵셔널 체이닝으로 no-op.
 * - Google Ads: `conversion` 이벤트 (`send_to`).
 *   타깃 미지정 시 발화 스킵.
 *
 * 베이스 픽셀은 (marketing) layout 의 <Script> 가 주입 — 이 컴포넌트는 클릭
 * 이벤트만 책임. Next.js soft nav 이므로 onClick 동기 firing 후 `/plan-request/new`
 * 로 이동해도 fbq/gtag 글로벌이 유지돼 이벤트 손실 없음.
 */
export function LandingCtaButton({
  variant = "default",
  className,
  children,
  googleAdsConversionTarget,
}: LandingCtaButtonProps) {
  const handleClick = () => {
    window.fbq?.("track", "Lead");
    if (googleAdsConversionTarget) {
      window.gtag?.("event", "conversion", {
        send_to: googleAdsConversionTarget,
      });
    }
  };

  return (
    <Button
      render={<Link href="/plan-request/new" onClick={handleClick} />}
      nativeButton={false}
      variant={variant}
      className={className}
    >
      {children}
    </Button>
  );
}
