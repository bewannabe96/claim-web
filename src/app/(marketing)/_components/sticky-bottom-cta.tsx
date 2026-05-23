"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { LandingCtaButton } from "./landing-cta-button";

/**
 * 스크롤 어디에서도 한 번에 진입할 수 있는 고정 CTA 바.
 *
 * 분석: 광고 유입 71 세션 중 76% 가 0–25% 에서 이탈. 첫 뷰포트 intro 의 CTA
 * (HeroExperience) 가 첫 인상을 잡고, 이 바는 그 뒤 스크롤 어디에서나 행동을
 * 유지해 데모 중간 이탈을 회수한다.
 *
 * 표시 규칙 (중복 CTA 회피):
 * - 0 → SHOW_THRESHOLD: 숨김 — 첫 뷰포트 inline CTA 가 보이는 구간.
 * - SHOW_THRESHOLD → 페이지 하단 NEAR_BOTTOM: 표시 — sticky 헤더 아래에서
 *   유일하게 보이는 행동 경로.
 * - 페이지 하단 NEAR_BOTTOM 이내: 숨김 — zone 3 inline CTA + 푸터 영역.
 *
 * 480px 마케팅 컨테이너에 시각적으로 정렬되도록 left-1/2 + -translate-x-1/2 +
 * max-w-[480px]. iOS safe area 고려 (env(safe-area-inset-bottom)).
 */
const SHOW_THRESHOLD_PX = 320;
const NEAR_BOTTOM_PX = 240;

export function StickyBottomCta({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const pageHeight = document.documentElement.scrollHeight;
      const viewport = window.innerHeight;
      const nearBottom = y + viewport > pageHeight - NEAR_BOTTOM_PX;
      setVisible(y > SHOW_THRESHOLD_PX && !nearBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 px-4 pt-3 transition-all duration-300 ease-out",
        "pb-[calc(env(safe-area-inset-bottom)+12px)]",
        // fade + slide-up. 숨김 상태에서도 layout 차지하지 않게 transform 만 변경.
        // pointer-events-none 은 base 가 이미 부여 (inner div 의 pointer-events-auto
        // 로 button 만 클릭 가능) — 여기선 visual state 만 토글.
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto rounded-full bg-white",
          // 부드러운 후광 — 데모 카드 위에 떠 보이도록.
          "shadow-[0_-8px_24px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.18)]",
        )}
      >
        <LandingCtaButton
          className="h-14 w-full rounded-full text-[0.95rem] font-semibold"
          googleAdsConversionTarget={googleAdsConversionTarget}
        >
          1분만에 무료로 제안받기
        </LandingCtaButton>
      </div>
    </div>
  );
}
