"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import posthog from "posthog-js";

import { extractAdClickIds } from "./attribution";

/**
 * PostHog 초기화 + pageview 추적의 **유일한 mount 지점**.
 * `posthog-js` import 는 이 파일 외에는 어디서도 일어나지 않는다 —
 * features/ / app/ 라우트 코드에 SDK 가 베어 들어가면 도메인 로직과 분석이
 * 뒤엉키기 시작하므로 금지. 도메인 코드의 진입점은 [src/lib/analytics.ts](src/lib/analytics.ts)
 * 의 `track()` (window.posthog 만 보는 thin facade).
 *
 * 호출자는 bootstrap (Server Component) 만 — env 가 비어있으면 아예 렌더되지
 * 않는다 (dev / 비활성 환경에서 외부 호출 0).
 *
 * App Router 의 soft nav 는 page reload 가 없어 pageview 가 자동 firing 되지
 * 않는다. `capture_pageview: false` + pathname effect 로 수동 발화.
 *
 * 발화되는 이벤트의 전체 인벤토리는 [src/components/analytics/CLAUDE.md](src/components/analytics/CLAUDE.md)
 * 의 "로깅 이벤트 인벤토리" 섹션 참조.
 */

type Props = {
  apiKey: string;
  apiHost: string;
  envStage: string;
};

export function PosthogClient({ apiKey, apiHost, envStage }: Props) {
  useEffect(() => {
    // posthog-js 의 init() 은 internal `__loaded` 플래그로 idempotent — 같은
    // mount 가 React Strict Mode 로 더블 호출되거나, soft nav 로 layout 이
    // 다시 그려져 effect 가 재실행돼도 SDK 가 알아서 한 번만 초기화.
    posthog.init(apiKey, {
      api_host: apiHost,
      // pageview 는 PageviewTracker 가 pathname 변화에 맞춰 수동 firing.
      capture_pageview: false,
      // page 이탈은 SDK 가 unload 이벤트로 자동 — funnel drop-off 분석에 필요.
      capture_pageleave: true,
      // identified_only: anonymous 이벤트는 추적하되 person profile (MTU)
      // 은 명시적 identify() 호출 시에만 생성 — 1M event 한도 안에서 MTU 절약.
      person_profiles: "identified_only",
      // MVP 는 session replay 비활성 — 5K replay/월 한도를 보호.
      // 추후 enable 할 때는 본인인증/결제 페이지에 mask 설정 필수.
      disable_session_recording: true,
      // autocapture: 모든 click/submit/change 를 자동 캡처 — 도메인 코드에
      // onClick handler 를 추가하지 않아도 행동이 보이게 한다.
      autocapture: true,
    });

    // 모든 이벤트에 `env` super-property 자동 부착 — 환경별 키 분리가 1차
    // 방어, 이것이 2차 방어. 운영 실수로 prod / staging 이 같은 키를 공유해도
    // PostHog UI 에서 `env` 로 필터링하면 분리해서 볼 수 있다.
    posthog.register({ env: envStage });
  }, [apiKey, apiHost, envStage]);

  return (
    // useSearchParams() 는 가장 가까운 Suspense boundary 를 요구 (App Router
    // 정적 렌더 opt-out 회피).
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;

    // init 전에 호출되어도 posthog-js 가 내부 큐로 보관 — 초기화 직후 flush.
    const query = searchParams.toString();
    const url =
      window.location.origin + pathname + (query ? `?${query}` : "");

    posthog.capture("$pageview", { $current_url: url });

    // First-touch 광고 attribution — 매 pageview 마다 URL 에서 광고 click ID
    // (gclid / fbclid / n_ad 등) 를 뽑아 super-property 로 등록. `register_once`
    // 가 first-touch 정책을 강제 — 이미 device cookie 에 박힌 키는 덮어쓰지
    // 않음. 다른 플랫폼 click ID 가 처음 들어오면 (그 키만 비어있으니) 추가됨.
    //
    // 빈 객체일 땐 호출 스킵 — organic 진입을 굳이 SDK 에 알릴 필요 없고,
    // device cookie 의 stale 갱신 트리거도 회피. UTM 은 SDK 가 자동 처리하므로
    // 여기서 안 다룸.
    const adClickIds = extractAdClickIds(searchParams);
    if (Object.keys(adClickIds).length > 0) {
      posthog.register_once(adClickIds);
    }
  }, [pathname, searchParams]);

  return null;
}
