import type { Metadata } from "next";

import { VariantV1 } from "../_components/variants/v1";
import { buildGoogleAdsConversionTarget } from "../_lib/google-ads";

/**
 * `/demo` — 상세 데모 라우트.
 *
 * v3 (현재 단독 운영 중인 1뷰포트 랜딩) 의 "자세히 보기" 링크가 여기로 보낸다.
 * v1 의 인터랙티브 스크롤 랜딩 (요청→제안→AI 비교 흐름을 실제 화면 데모로
 * 체험) 을 그대로 재사용 — 광고 변형 풀에서는 비활성이지만 디렉토리/컴포넌트는
 * 보존되어 있어 import 가능.
 *
 * # A/B 시스템과 격리
 *
 * 이 라우트는 `resolveLpVariant` 우회 (Redis 카운터/쿠키 영향 0), PostHog
 * `lp_exposure` 미발화 — 실험 모집단 통계에 안 섞인다. 가입자가 v3 광고 클릭
 * → v3 의 "자세히 보기" 클릭 → `/demo` 진입 흐름은 v3 의 단일 lp_variant
 * super-property 로만 측정됨.
 *
 * 광고 conversion 픽셀 (Meta Pixel, Google Ads gtag) 은 `(marketing)/layout.tsx`
 * 가 책임이라 이 페이지에서도 자동 발화. `/demo` 의 CTA 클릭 시 `LandingCtaButton`
 * 이 conversion 이벤트 발화 — v3 광고 캠페인의 conversion 으로 잡힘.
 */
export const metadata: Metadata = {
  title: "서비스 자세히 보기",
};

export default function DemoPage() {
  return (
    <VariantV1
      googleAdsConversionTarget={buildGoogleAdsConversionTarget()}
    />
  );
}
