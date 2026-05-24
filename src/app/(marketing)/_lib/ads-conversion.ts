/**
 * 광고 conversion 발화 헬퍼 — `(marketing)` 그룹 공용.
 *
 * 랜딩 첫 인터랙션(첫 버튼 클릭) 시 호출. 베이스 픽셀 스크립트는
 * `(marketing)/layout.tsx` 가 주입 — 이 헬퍼는 클릭 이벤트만 책임.
 *
 * - Meta Pixel: `SubmitApplication` 표준 이벤트.
 *   fbq 글로벌이 없으면 (META_PIXEL_ID 미설정 env) 옵셔널 체이닝으로 no-op.
 * - Google Ads: `conversion` 이벤트 (`send_to`).
 *   target 미지정 (GOOGLE_ADS_* env 미설정) 이면 발화 스킵.
 *
 * v4 (챗봇) 가 자체 CTA 가 없는 흐름이라 Q1 응답을 첫 버튼 클릭으로 본다.
 * v1 (`LandingCtaButton`) 은 자체적으로 firing 하므로 이 헬퍼를 안 씀 — Meta
 * 이벤트 이름이 다른 funnel 단계 (`Lead` vs `SubmitApplication`) 라 굳이
 * 공유하지 않는다.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export function fireLandingConversion(
  googleAdsConversionTarget: string | undefined,
): void {
  if (typeof window === "undefined") return;
  window.fbq?.("track", "SubmitApplication");
  if (googleAdsConversionTarget) {
    window.gtag?.("event", "conversion", {
      send_to: googleAdsConversionTarget,
    });
  }
}
