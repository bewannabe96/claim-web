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
