/**
 * 분석 이벤트 발화 — features/ 와 라우트 코드가 PostHog SDK 를 직접 import 하지
 * 않도록 차단하는 얇은 경계.
 *
 * **의도된 제약**: 이 파일은 `window.posthog` 만 본다. `posthog-js` 를 import
 * 하지 않으므로 features 파일이 `track()` 을 호출해도 SDK 번들이 그 모듈로
 * 끌려 들어가지 않는다. SDK 의 실제 mount 는 [components/analytics/](../components/analytics/)
 * 가 단독 책임.
 *
 * **사용 우선순위 (위로 갈수록 권장)**:
 *
 * 1. **아무것도 안 함** — PostHog autocapture 가 `<button>`/`<a>`/`<form>`
 *    클릭과 제출을 자동 캡처. 보통 여기서 끝난다.
 *
 * 2. **`track()` 호출** — DOM 으로 못 표현하는 시점에만:
 *      - server action 응답 후 conversion 발화 (예: OTP 검증 성공)
 *      - client-side multi-step 의 단계 진입
 *    이 경우에도 features 코드에는 `track()` 호출만 보이고 SDK 는 안 보인다.
 *
 * **금지**:
 * - features/ 어디서도 `import posthog from "posthog-js"` 금지.
 * - components/analytics/ 밖에서 `window.posthog.capture()` 직접 호출 금지
 *   (이 파일을 경유할 것).
 *
 * **identify / reset 등 추가 API 는 필요해질 때 추가** — 현재 호출처가 없는
 * helper 를 미리 두지 않는다. partner 로그인 흐름이 생기면 그때 `identify()`
 * 같은 함수를 이 파일에 추가하고, 그 시점에 인증 boundary 와 PIPA 동의 처리도
 * 같이 설계.
 */

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void;
      register: (props: Record<string, unknown>) => void;
      register_once: (props: Record<string, unknown>) => void;
    };
  }
}

/**
 * 이벤트 발화. 분석 SDK 미로드 시 (dev / 비활성 환경) 조용히 무시.
 *
 * 이벤트 이름 규약: `snake_case`, 도메인 prefix 권장 — 예시
 *   - `plan_request_submitted`
 *   - `partner_signup_otp_verified`
 *   - `credits_topup_completed`
 */
export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.posthog?.capture(event, props);
}

/**
 * 랜딩 페이지 변형 (A/B) 식별을 PostHog 에 등록 + 첫 노출 이벤트 발화.
 *
 * `<ExposureBeacon />` (page-level client leaf) 의 useEffect 가 마운트 직후
 * 1회 호출. 변형 결정 흐름 자체는 [server/lp-variant.ts](../server/lp-variant.ts).
 *
 * 등록되는 것:
 *  - **`lp_variant`** super-property (overwrite) — 현재 변형. 모든 후속 이벤트
 *    (`$pageview`, `$autocapture`, `$pageleave`, 커스텀 `track()` 등) 에 자동
 *    부착되어 funnel / breakdown 에 그대로 사용 가능.
 *  - **`initial_lp_variant`** super-property (register_once) — first-touch.
 *    쿠키 재배정 후에도 "어느 변형이 이 device 를 데려왔나" 를 잃지 않음.
 *    기존 광고 `initial_gclid` / `initial_fbclid` 와 같은 정책.
 *  - **`lp_exposure`** 이벤트 — `justAssigned=true` 일 때만 1회. A/B funnel 의
 *    분모로 사용 (denominator). `$pageview` 를 분모로 써도 무방하지만,
 *    명시적 exposure 이벤트가 PostHog UI 에서 실험 단위 사고를 강제.
 *
 * SDK 미로드 시 조용히 no-op. 호출 시점에 `window.posthog` 가 아직 init 안
 * 됐어도 SDK 내부 큐가 받아주므로 race 무해 (단, 그 사이에 fired 된 자동
 * 이벤트 — 가장 첫 `$pageview` — 는 super-property 누락 가능성 있음.
 * `lp_exposure` 이벤트 자체는 `lp_variant` 를 props 로 직접 박아 항상 안전).
 *
 * @param variant 변형 ID
 * @param justAssigned 이번 요청이 첫 배정인가 — true 면 `lp_exposure` 발화
 */
export function registerLpVariant(
  variant: string,
  justAssigned: boolean,
): void {
  if (typeof window === "undefined") return;
  const ph = window.posthog;
  if (!ph) return;
  ph.register({ lp_variant: variant });
  ph.register_once({ initial_lp_variant: variant });
  if (justAssigned) {
    ph.capture("lp_exposure", { lp_variant: variant });
  }
}
