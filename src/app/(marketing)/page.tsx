import { resolveLpVariant } from "@/server/lp-variant";

import { CookieSetter } from "./_components/cookie-setter";
import { ExposureBeacon } from "./_components/exposure-beacon";
import { LandingVariant } from "./_components/landing-variant";

/**
 * 마케팅 랜딩 — 가입자(고객) 진입 페이지.
 *
 * 같은 URL (`/`) 에서 서버가 device 마다 변형을 라운드로빈으로 배정하고
 * (Redis INCR + 쿠키 sticky), PostHog 의 `lp_variant` super-property 로
 * 모든 후속 이벤트에 자동 첨부 — 변형별 conversion 을 PostHog UI 의 일반
 * funnel / insight 로 비교한다. 흐름 전체는:
 *   - [src/server/lp-variant.ts](../../server/lp-variant.ts) 모듈 헤더
 *   - [src/lib/lp-variant.ts](../../lib/lp-variant.ts) (변형 ID / epoch / 쿠키 상수)
 *   - [src/components/analytics/CLAUDE.md](../../components/analytics/CLAUDE.md) (PostHog 측 인벤토리)
 *
 * 페이지 자체는 dispatcher 만 — 실제 마크업은 `_components/variants/<id>/index.tsx`
 * 가 각자 책임. v1 (control) = 기존 운영 중인 랜딩.
 */

// gtag 의 두 호출은 send_to 형식이 다르다:
//   - 베이스 스크립트의 gtag('config', …) 는 계정 ID `AW-XXXXXXXXXX` 만 (layout.tsx).
//   - conversion 이벤트의 send_to 는 `AW-XXXXXXXXXX/<label>` — conversion action
//     마다 발급되는 label 을 붙여야 Google Ads 에 conversion 으로 매핑된다.
// 그래서 계정 ID 와 label 을 별도 env 로 받아 여기서 합성한다. 둘 중 하나라도
// 미설정이면 undefined → CTA 가 gtag 발화를 스킵 (dev/staging 에서 무해).
function buildGoogleAdsConversionTarget(): string | undefined {
  const googleAdsId = process.env.GOOGLE_ADS_ID;
  const googleAdsConversionLabel = process.env.GOOGLE_ADS_CONVERSION_LABEL;
  if (!googleAdsId || !googleAdsConversionLabel) return undefined;
  return `${googleAdsId}/${googleAdsConversionLabel}`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const { variant, justAssigned, fromForce } =
    await resolveLpVariant(resolvedParams);

  const googleAdsConversionTarget = buildGoogleAdsConversionTarget();

  return (
    <>
      <LandingVariant
        variant={variant}
        googleAdsConversionTarget={googleAdsConversionTarget}
      />
      {/* 첫 배정 + 강제 override 가 아닐 때만 쿠키 박음. 강제는 휘발성 (다음 방문 영향 없음). */}
      {justAssigned && !fromForce && <CookieSetter variant={variant} />}
      <ExposureBeacon
        variant={variant}
        justAssigned={justAssigned}
        fromForce={fromForce}
      />
    </>
  );
}
