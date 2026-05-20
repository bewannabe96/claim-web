import "server-only";

import { headers } from "next/headers";

/**
 * 사용자 노출 base URL (scheme + host[:port], trailing slash 없음) 단일 진입점.
 *
 * Kakao OAuth `redirectTo` / 어드민의 가입 URL 안내 / SMS LMS 본문 링크 / PG redirect
 * URL 등 외부 노출 절대 URL 생성에 모두 이걸 사용. 같은 결정 로직이 여러 곳에 흩어지면
 * 한 곳만 고쳐 다른 곳에서 Supabase 화이트리스트 mismatch (→ Site URL fallback) 같은
 * 사고가 재발.
 *
 * 우선순위:
 *   1. `PUBLIC_BASE_URL` env — Vercel/staging/prod 의 canonical 도메인. branch deployment
 *      에 custom alias (예: dev.claim.ac → claim-web-env-staging-*.vercel.app) 를 붙인
 *      경우, 사용자가 vercel.app URL 로 들어왔거나 webhook 이 vercel.app 로 도착해도
 *      모든 외부 노출 URL 이 alias 로 통일됨. 단일 진실 공급원.
 *   2. 요청 헤더 (`Origin` > `x-forwarded-host` > `host`) — env 미설정 시 로컬 dev /
 *      LAN IP / ngrok 편의용 폴백. 매번 env 박는 부담 회피.
 *
 * 운영 측 책임:
 * - 사용자가 접근하는 canonical 도메인을 `PUBLIC_BASE_URL` 에 박을 것 (Vercel 대시보드
 *   환경변수, 예: `https://dev.claim.ac`).
 * - Supabase Dashboard 의 **Redirect URLs** 화이트리스트에 그 도메인 + `/api/auth/callback`
 *   조합이 등록돼 있어야 함. 누락 시 Supabase 가 redirectTo 무시하고 Site URL 로 fallback.
 */
export async function getPublicBaseUrl(): Promise<string> {
  const envUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  return resolveOriginFromHeaders();
}

async function resolveOriginFromHeaders(): Promise<string> {
  const h = await headers();
  const originHeader = h.get("origin");
  if (originHeader) return originHeader;

  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto");
  const host = forwardedHost ?? h.get("host") ?? "";
  const proto =
    forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
