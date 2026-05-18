import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

/**
 * Supabase OAuth 콜백 — partner Kakao 로그인 후속.
 *
 * provider (Kakao) 가 PKCE code 와 함께 이 라우트로 redirect. 여기서:
 *   1. exchangeCodeForSession 으로 session cookie 발급
 *   2. User 화이트리스트 검증 (email 기준) — role='partner' + partner.active 확인
 *   3. User.authId 비어 있으면 claim (첫 로그인). 이미 다른 authId 와 매핑이면 거부.
 *   4. 통과: ?next 경로로 redirect, 실패: /partner/login?error=…
 *
 * route handler 도 mutable cookie 컨텍스트라 supabase ssr setAll 가 정상 작동.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/partner";

  if (!code) {
    return NextResponse.redirect(`${origin}/partner/login?error=no_code`);
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/partner/login?error=oauth_failed`);
  }

  const email = data.user.email;
  if (!email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/partner/login?error=no_email`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      authId: true,
      role: true,
      partner: { select: { active: true } },
    },
  });
  if (!user || user.role !== "partner" || !user.partner?.active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/partner/login?error=not_registered`);
  }

  if (!user.authId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { authId: data.user.id },
    });
  } else if (user.authId !== data.user.id) {
    // 사전 등록된 email 이 이미 다른 Supabase 계정과 매핑됨 — 운영자 수동 정정 필요.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/partner/login?error=not_registered`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
