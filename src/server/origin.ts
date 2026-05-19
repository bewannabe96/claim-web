import "server-only";

import { headers } from "next/headers";

/**
 * 사용자 노출 base URL (scheme + host[:port], trailing slash 없음) 단일 진입점.
 *
 * Kakao OAuth `redirectTo` / 어드민의 가입 URL 안내 / 기타 외부 발송 URL 생성 시
 * 모두 이걸 사용. 같은 결정 로직이 여러 곳에 흩어지면 한 곳만 고쳐 다른 곳에서
 * Supabase 화이트리스트 mismatch (→ Site URL fallback) 같은 사고가 재발.
 *
 * 우선순위:
 *   1. 요청 `Origin` 헤더 — 브라우저가 채우는 표준 값. 서버 액션 / 콜백 흐름
 *      에선 항상 set 되므로 1순위. 로컬 dev / LAN IP / ngrok 모두 정확.
 *   2. `x-forwarded-host` / `x-forwarded-proto` — reverse proxy (Vercel / ngrok)
 *      에서 원본 host 가 internal 로 가려졌고 Origin 도 없는 드문 경우.
 *   3. `host` 헤더 + proto 추정 (localhost → http, 그 외 → https) — 최종 폴백.
 *
 * 운영 측 책임: 사용자가 접근하는 모든 호스트 (prod / staging / LAN IP / ngrok) 가
 * Supabase Dashboard 의 **Redirect URLs** 화이트리스트에 등록돼 있어야 함.
 * 화이트리스트 누락 시 Supabase 가 redirectTo 무시하고 Site URL 로 fallback.
 */
export async function resolveOrigin(): Promise<string> {
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
