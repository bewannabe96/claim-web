import Script from "next/script";

import { PosthogBootstrap } from "@/components/analytics/posthog-bootstrap";

/**
 * (marketing) 레이아웃 — 가입자 비인증 영역.
 * 480px 모바일 컨테이너. 페이지가 직접 hero 를 그림 (chrome 헤더 없음).
 *
 * 광고 픽셀은 이 레이아웃에서만 주입 — admin/partner 내부 영역에는 광고 추적
 * 불필요. ID 는 env 로 주입 (prod/staging 만 설정). 미설정 환경 (dev) 에선
 * <Script> 자체가 렌더되지 않아 외부 픽셀 호출 0건. PageView 는 베이스
 * 스크립트가 로드 시 자동 firing. CTA 클릭 conversion 은
 * _components/landing-cta-button.tsx 가 책임.
 *
 * 행동 분석 (PostHog) 은 `<PosthogBootstrap />` 가 책임 — 도메인 코드와 분리된
 * 격리 경계는 [src/components/analytics/CLAUDE.md](src/components/analytics/CLAUDE.md) 참조.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const metaPixelId = process.env.META_PIXEL_ID;
  const googleAdsId = process.env.GOOGLE_ADS_ID;

  return (
    <>
      <PosthogBootstrap />
      {metaPixelId && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(metaPixelId)});
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element -- Meta Pixel 1x1 추적용 비콘. next/image 부적합. */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(metaPixelId)}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}
      {googleAdsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId)}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads-gtag" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(googleAdsId)});`}
          </Script>
        </>
      )}
      <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col bg-white min-[480px]:border-x min-[480px]:border-[#e2e2e2] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
        {children}
      </div>
    </>
  );
}
