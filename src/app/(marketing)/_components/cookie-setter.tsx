"use client";

import { useEffect } from "react";

import {
  LP_COOKIE_MAX_AGE_SECONDS,
  LP_COOKIE_NAME,
} from "@/lib/lp-variant";

/**
 * 랜딩 변형 (A/B) 의 sticky cookie 를 client 측에서 박는다.
 *
 * 서버 (page.tsx) 가 cookies() 를 통해 쿠키를 **읽고** 변형을 결정하지만,
 * Server Component render 중엔 쿠키 **쓰기** 가 불가하다 (Next.js 가
 * Server Action / Route Handler 에서만 허용). middleware 로 쓰는 우회는
 * Turbopack dev 에서 실행 안 되는 이슈가 있어 — `document.cookie` 로 client
 * 가 박는 단순 경로 채택. 자세한 트레이드오프는 [server/lp-variant.ts](../../../server/lp-variant.ts)
 * 모듈 헤더 § "쿠키 write 책임 분리" 참조.
 *
 * justAssigned=true 인 첫 방문 때만 page.tsx 에서 마운트된다. 두 번째 방문엔
 * 이미 쿠키가 있어 이 컴포넌트가 아예 안 그려진다.
 *
 * `SameSite=Lax` — 다른 사이트에서 우리 도메인으로 GET 진입 시 쿠키 전송 허용
 * (광고 클릭 → 랜딩 시나리오 그대로). `Secure` 는 https 환경에서만 — dev
 * (http://localhost) 에선 빠짐. `httpOnly` 안 박음 — 의도적으로 client 가
 * 쓰고 다음 SSR 응답 헤더로 서버에 전달되는 구조.
 */
export function CookieSetter({ variant }: { variant: string }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    // 이미 같은 값이 박혀 있으면 (예: StrictMode 의 double-effect) skip — 무해하지만
    // 불필요한 Set-Cookie 헤더 노출 회피.
    if (document.cookie.includes(`${LP_COOKIE_NAME}=${variant}`)) return;

    const isSecureContext = window.location.protocol === "https:";
    const parts = [
      `${LP_COOKIE_NAME}=${variant}`,
      "Path=/",
      `Max-Age=${LP_COOKIE_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
    ];
    if (isSecureContext) parts.push("Secure");
    document.cookie = parts.join("; ");
  }, [variant]);

  return null;
}
