"use client";

import { useEffect, useRef } from "react";

import { markResultViewed } from "@/features/plan-requests/actions";

/**
 * 결과 페이지 열람 마킹 — 렌더 트리에 마운트되면 1회 markResultViewed 를 호출.
 *
 * Server Component 렌더가 아닌 client useEffect 에서 발화하는 이유: 카카오 링크
 * 프리뷰 크롤러·봇은 JS 를 실행하지 않으므로 실제 가입자 열람만 기록 (false
 * positive 차단). 서버 액션이 멱등 (WHERE resultViewedAt IS NULL) 이라 새로고침 /
 * 재진입은 no-op — 최초 열람 시각만 보존된다.
 *
 * 화면에 아무것도 그리지 않음 (null). fired ref 는 StrictMode 의 effect 이중
 * 호출에서 중복 네트워크 요청을 막는다 (서버가 멱등이라 정합성 영향은 없지만).
 */
export function ResultViewedMarker({ token }: { token: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // 열람 마킹은 best-effort — 실패해도 사용자 흐름에 영향이 없으므로 조용히
    // 무시 (catch 없으면 unhandled rejection 으로 콘솔에 노출).
    markResultViewed(token).catch(() => {});
  }, [token]);

  return null;
}
