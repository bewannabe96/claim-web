"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/server/supabase";

/**
 * 카카오톡 OAuth 로그인 트리거.
 *
 * Supabase signInWithOAuth 는 서버 컨텍스트에서 redirect 하지 않고 Kakao 인증 URL 만
 * 반환 — action 이 명시적으로 redirect. PKCE verifier cookie 는 @supabase/ssr 가
 * setAll 로 발급 (server action 은 mutable cookie 컨텍스트라 쓰기 가능).
 *
 * Kakao → /api/auth/callback?code=… 로 돌아오며, 거기서 session 교환 + partner
 * 화이트리스트 검증.
 */
export async function signInWithKakao() {
  const supabase = await getSupabaseServerClient();
  const h = await headers();
  // reverse proxy (Vercel / ngrok) 환경에서 host 헤더가 internal 로 잡히는 경우 대비.
  // 우선순위: Origin > x-forwarded-* > host (proto 는 dev http 대응).
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto");
  const host = forwardedHost ?? h.get("host") ?? "";
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = h.get("origin") ?? `${proto}://${host}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=/partner`,
    },
  });

  if (error || !data.url) {
    redirect("/partner/login?error=oauth_failed");
  }

  // Kakao external URL — typedRoutes 검증 대상 아님 (외부). cast 로 회피.
  redirect(data.url as Route);
}
