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
 *   1. `SITE_URL` env — 운영/스테이징 / ngrok 등 외부 노출 환경의 결정적 진실.
 *      Supabase Dashboard 의 Site URL / Redirect URLs 와 정확히 일치시켜야 함
 *      (mismatch 시 Supabase 가 redirectTo 무시하고 Site URL 로 fallback).
 *   2. 요청 `Origin` 헤더 — 브라우저가 채우는 표준 값. 로컬 dev / LAN IP 접속에
 *      가장 정확.
 *   3. `x-forwarded-host` / `x-forwarded-proto` — reverse proxy (Vercel / ngrok)
 *      에서 원본 host 가 internal 로 가려진 경우.
 *   4. `host` 헤더 + proto 추정 (localhost → http, 그 외 → https).
 */
export async function resolveOrigin(): Promise<string> {
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) return siteUrl.replace(/\/$/, "");

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
