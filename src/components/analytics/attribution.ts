/**
 * 광고 플랫폼 click ID 추출 — first-touch attribution 의 데이터 layer.
 *
 * 광고 플랫폼은 클릭 시 랜딩 URL 에 자기네 식별자 (`?gclid=...`) 를 부착한다.
 * 사용자가 페이지 내 이동하면 URL 에서 사라지므로 첫 진입 페이지에서만 잡을 수
 * 있다. 잡은 값은 [posthog-client.tsx](./posthog-client.tsx) 가 `register_once`
 * 로 device cookie 에 영구 저장 → 이후 모든 이벤트에 super-property 로 자동 첨부.
 *
 * **UTM 은 여기 없음** — `utm_source` / `utm_medium` / `utm_campaign` /
 * `utm_term` / `utm_content` 5종은 PostHog SDK 가 `$initial_utm_*` 로 자동
 * 처리. 운영 측에서 광고 set 별로 UTM 규약을 박는 게 진짜 작업이고, 코드는
 * 받기만 하면 됨.
 *
 * **자동 first-touch 의미**: `register_once` 는 super-property 가 이미 있으면
 * 덮어쓰지 않음. 따라서 같은 device 가 두 번째 광고로 들어오면 새 click ID 는
 * 추가되지만 (그 키가 비어있었으니), 이전 click ID 는 그대로 유지. 즉
 * 플랫폼별 독립 first-touch.
 *
 * **명명 규약**: PostHog 의 `$initial_*` 는 SDK 예약 namespace 라 우리가 못
 * 씀. 평행하게 `initial_<param>` (no `$`) 으로 통일 — UI 에서 정렬 시 한 묶음.
 */

// 광고 플랫폼별 click ID 파라미터. 새 플랫폼 추가 시 여기 한 줄 + 운영 측에서
// 해당 플랫폼의 광고 URL 에 파라미터가 박혀 들어오는지 확인.
const CLICK_ID_PARAMS = [
  // ── Google Ads ──
  // gclid: 데스크탑/안드로이드 전 사용 (auto-tagging 켜져 있어야 자동).
  // gbraid / wbraid: iOS 14+ ITP 환경에서 gclid 대체. 둘 다 캡처해야 누수 없음.
  "gclid",
  "gbraid",
  "wbraid",

  // ── Meta (Facebook / Instagram) ──
  "fbclid",

  // ── 네이버 검색광고 (Power Link / Brand Search) ──
  // 자동 추적 URL 에 박혀 들어옴. 마케팅이 keyword/campaign 분석에 사용.
  "n_ad",
  "n_query",
  "n_keyword",
  "n_rank",
  "n_campaign_type",
] as const;

type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];

/**
 * Search params 에서 광고 click ID 들을 추출.
 * 값이 있는 키만 결과에 포함 — 빈 객체이면 attribution 데이터 없음 (organic 등).
 *
 * 호출자는 결과가 비어있으면 register 호출을 스킵해야 함 — 빈 객체로
 * `register_once` 를 부르면 의미 없는 호출 + 빈 device cookie 갱신 트리거.
 *
 * `URLSearchParams` 만 받음 — Next.js `useSearchParams()` 의 ReadonlyURLSearchParams
 * 가 그대로 호환되므로 호출지에서 URL 객체를 추가로 만들 필요 없음.
 */
export function extractAdClickIds(
  searchParams: URLSearchParams,
): Partial<Record<`initial_${ClickIdParam}`, string>> {
  const result: Record<string, string> = {};
  for (const key of CLICK_ID_PARAMS) {
    const value = searchParams.get(key);
    // 빈 문자열 ("?gclid=") 도 가치 없으므로 truthy check.
    if (value) {
      result[`initial_${key}`] = value;
    }
  }
  return result;
}
