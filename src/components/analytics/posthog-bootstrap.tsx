import { getEnvStage } from "@/lib/env-stage";

import { PosthogClient } from "./posthog-client";

/**
 * PostHog 부트스트랩 — env 를 읽고 client 컴포넌트에 prop 으로 전달.
 *
 * Server Component 가 env 를 직접 읽는 이유:
 * - 운영 규약상 `NEXT_PUBLIC_` prefix 금지 ([.env.example](.env.example) 정책).
 * - 미설정 환경 (dev) 에선 아예 client 컴포넌트가 렌더되지 않아 posthog-js
 *   번들이 페이지에 포함되지 않는다 — 외부 호출 0, 코드 사이즈 0.
 *
 * `envStage` 는 모든 이벤트에 super-property 로 부착 — 환경별 키를 분리해도
 * (1차 방어) 운영 실수로 같은 키가 박힐 때를 대비한 2차 방어. PostHog UI 에서
 * `env` property 로 필터링하면 prod / staging / preview 분리 분석 가능.
 *
 * 적용 위치: `(marketing)/layout.tsx`, `partner/layout.tsx` 의 children
 * 위치에 1줄. admin layout 은 의도적으로 미적용 — operator 행동은 추적 X.
 */
export function PosthogBootstrap() {
  const apiKey = process.env.POSTHOG_KEY;
  const apiHost = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  // ENV_STAGE 미설정 시 "unknown" — env 값이 비었다는 사실 자체가 PostHog UI 에
  // 드러나야 운영 누락을 발견할 수 있다 (조용한 fallback 금지).
  const envStage = getEnvStage() ?? "unknown";

  if (!apiKey) return null;

  return (
    <PosthogClient apiKey={apiKey} apiHost={apiHost} envStage={envStage} />
  );
}
