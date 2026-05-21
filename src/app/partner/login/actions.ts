"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/safe-next-path";
import { getPublicBaseUrl } from "@/server/origin";
import { getSupabaseServerClient } from "@/server/supabase";

/**
 * 카카오톡 OAuth 로그인 트리거.
 *
 * Supabase signInWithOAuth 는 서버 컨텍스트에서 redirect 하지 않고 Kakao 인증 URL 만
 * 반환 — action 이 명시적으로 redirect. PKCE verifier cookie 는 @supabase/ssr 가
 * setAll 로 발급 (server action 은 mutable cookie 컨텍스트라 쓰기 가능).
 *
 * Kakao → /api/auth/callback?code=…&next=… 로 돌아오며, 거기서 session 교환 +
 * partner 화이트리스트 검증 + next 로 redirect.
 *
 * `next` 는 미인증 진입 시 middleware 가 원래 경로를 보존해 login page 까지
 * 흘려보내는 값. 페이지의 hidden input 으로 formData 에 실려 들어옴. open redirect
 * 방어는 safeNextPath 가 단일 진입점 — 페이지/액션/콜백 모두 동일 validator 통과.
 */
export async function signInWithKakao(formData: FormData) {
  const supabase = await getSupabaseServerClient();
  const origin = await getPublicBaseUrl();
  // safeNextPath: 페이지가 이미 화이트리스트 통과시켰지만 action 도 자체 검증.
  // formData 는 클라이언트가 임의로 보낼 수 있어 server action 자체 진입점에서도 필수.
  const next = safeNextPath(formData.get("next"));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect("/partner/login?error=oauth_failed");
  }

  // Kakao external URL — typedRoutes 검증 대상 아님 (외부). cast 로 회피.
  redirect(data.url as Route);
}
