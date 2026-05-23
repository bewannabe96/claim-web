import { resolveLpVariant } from "@/server/lp-variant";

import { CookieSetter } from "./_components/cookie-setter";
import { ExposureBeacon } from "./_components/exposure-beacon";
import { LandingVariant } from "./_components/landing-variant";
import { buildGoogleAdsConversionTarget } from "./_lib/google-ads";

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
 * 가 각자 책임. 현재는 v3 단독 운영 (v1 / v2 는 디렉토리 보존 + dispatcher 에서만
 * 제거).
 */

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
