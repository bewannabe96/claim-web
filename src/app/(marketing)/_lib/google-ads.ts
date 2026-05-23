/**
 * Google Ads conversion target 합성 — `(marketing)` 그룹 공용 헬퍼.
 *
 * gtag 의 두 호출은 send_to 형식이 다르다:
 *   - 베이스 스크립트의 gtag('config', …) 는 계정 ID `AW-XXXXXXXXXX` 만 (layout.tsx).
 *   - conversion 이벤트의 send_to 는 `AW-XXXXXXXXXX/<label>` — conversion action
 *     마다 발급되는 label 을 붙여야 Google Ads 에 conversion 으로 매핑된다.
 * 그래서 계정 ID 와 label 을 별도 env 로 받아 여기서 합성한다. 둘 중 하나라도
 * 미설정이면 undefined → CTA 가 gtag 발화를 스킵 (dev/staging 에서 무해).
 *
 * A/B dispatcher (root `page.tsx`) 와 별도 라우트 (`/demo`) 가 동일한 합성
 * 로직을 쓰므로 single source of truth 로 분리.
 */
export function buildGoogleAdsConversionTarget(): string | undefined {
  const googleAdsId = process.env.GOOGLE_ADS_ID;
  const googleAdsConversionLabel = process.env.GOOGLE_ADS_CONVERSION_LABEL;
  if (!googleAdsId || !googleAdsConversionLabel) return undefined;
  return `${googleAdsId}/${googleAdsConversionLabel}`;
}
