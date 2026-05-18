import type { User as SupabaseUser } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

/**
 * Supabase OAuth 콜백 — partner Kakao 로그인 / 신규 가입 공용.
 *
 * 두 분기:
 *
 *   1. **signup** (`?signup=<invitation_token>`): 어드민이 발급한 가입 초청으로 진입.
 *      - code → session 교환
 *      - invitation 게이트: 미소비 + 미만료
 *      - linkedAuthId 처리:
 *          * NULL → race-safe claim (`updateMany WHERE linkedAuthId IS NULL`)
 *          * === authUser.id → 통과 (재진입)
 *          * !== authUser.id → reject + supabase signOut + `?error=link_conflict`
 *      - 콜백은 user/partner 트랜잭션을 **하지 않음** — 본인인증 통과 시점에
 *        verifyPartnerSignupOtp action 이 단일 트랜잭션으로 user + partner +
 *        invitation 소비를 수행. 콜백의 책임은 invitation lock + verify 페이지로 forward.
 *      - 성공: /partner/signup/<token>/verify, 실패: /partner/signup/<token>?error=…
 *
 *   2. **login** (signup 미존재): 기존 가입자 로그인.
 *      - code → session 교환
 *      - email 로 User 화이트리스트 조회 (partner extension active 확인)
 *      - authId 비어 있으면 claim (드물게 운영자가 수동 user 만들었을 때만)
 *      - 성공: ?next 또는 /partner, 실패: /partner/login?error=…
 *
 * route handler 는 mutable cookie 컨텍스트라 supabase ssr setAll 가 정상 작동.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const signupToken = searchParams.get("signup");
  const next = searchParams.get("next") ?? "/partner";

  if (!code) {
    if (signupToken) {
      return NextResponse.redirect(
        `${origin}/partner/signup/${signupToken}?error=oauth_failed`,
      );
    }
    return NextResponse.redirect(`${origin}/partner/login?error=no_code`);
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    if (signupToken) {
      return NextResponse.redirect(
        `${origin}/partner/signup/${signupToken}?error=oauth_failed`,
      );
    }
    return NextResponse.redirect(`${origin}/partner/login?error=oauth_failed`);
  }

  if (signupToken) {
    return handleSignup(req, data.user, signupToken);
  }

  return handleLogin(req, data.user, next);
}

/* ============================================================
 * Signup — invitation 에 Kakao 계정 lock + verify 페이지로 forward
 * ============================================================
 *
 * 가입 트랜잭션은 본인인증 통과 후 verifyPartnerSignupOtp action 이 소유 —
 * 여기서는 어떤 user/partner row 도 만들지 않음 (partial state 회귀 방지).
 */

async function handleSignup(
  req: NextRequest,
  authUser: SupabaseUser,
  invitationToken: string,
) {
  const { origin } = new URL(req.url);
  const supabase = await getSupabaseServerClient();
  const errorBase = `${origin}/partner/signup/${invitationToken}`;

  if (!authUser.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${errorBase}?error=no_email`);
  }

  const invitation = await prisma.partnerInvitation.findUnique({
    where: { token: invitationToken },
    select: {
      id: true,
      consumedAt: true,
      expiresAt: true,
      linkedAuthId: true,
    },
  });
  if (
    !invitation ||
    invitation.consumedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    await supabase.auth.signOut();
    // 토큰 무효 → signup 페이지가 "유효하지 않은 가입 링크" 분기.
    return NextResponse.redirect(errorBase);
  }

  if (invitation.linkedAuthId === null) {
    // race-safe claim — 동시 콜백 중 하나만 lock 성공.
    const claim = await prisma.partnerInvitation.updateMany({
      where: { id: invitation.id, linkedAuthId: null },
      data: { linkedAuthId: authUser.id },
    });
    if (claim.count === 0) {
      const reread = await prisma.partnerInvitation.findUnique({
        where: { id: invitation.id },
        select: { linkedAuthId: true },
      });
      if (reread?.linkedAuthId !== authUser.id) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${errorBase}?error=link_conflict`);
      }
    }
  } else if (invitation.linkedAuthId !== authUser.id) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${errorBase}?error=link_conflict`);
  }
  // (linkedAuthId === authUser.id) 인 재진입은 무조건 통과 — Kakao 세션이 유효하면
  // 본인인증을 한 번 만에 끝내지 못해도 같은 계정으로 다시 들어올 수 있어야 함.

  return NextResponse.redirect(`${errorBase}/verify`);
}

/* ============================================================
 * Login — 기존 가입자 (drift 안전) 진입
 * ============================================================ */

async function handleLogin(
  req: NextRequest,
  authUser: SupabaseUser,
  next: string,
) {
  const { origin } = new URL(req.url);
  const supabase = await getSupabaseServerClient();

  const email = authUser.email;
  if (!email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/partner/login?error=no_email`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      authId: true,
      partner: { select: { active: true } },
    },
  });
  if (!user || !user.partner?.active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/partner/login?error=not_registered`);
  }

  if (!user.authId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { authId: authUser.id },
    });
  } else if (user.authId !== authUser.id) {
    // 사전 등록된 email 이 이미 다른 Supabase 계정과 매핑됨 — 운영자 수동 정정 필요.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/partner/login?error=not_registered`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
