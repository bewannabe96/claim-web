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
  const origin = h.get("origin") ?? `https://${h.get("host") ?? ""}`;

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
