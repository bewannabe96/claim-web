import { Prisma } from "@prisma/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { newId } from "@/lib/id";
import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

/**
 * Supabase OAuth 콜백 — partner Kakao 로그인 / 신규 가입 공용.
 *
 * 두 분기:
 *
 *   1. **signup** (`?signup=<invitation_token>`): 어드민이 발급한 가입 초청으로 진입.
 *      - code → session 교환
 *      - invitation 게이트: 미소비 + 미만료 + **phoneVerifiedAt IS NOT NULL** (signup 페이지에서
 *        PortOne 본인인증을 사전에 통과한 상태). 이 콜백은 phone 자체를 다시 보지 않음 —
 *        Kakao OAuth 는 phone 을 제공하지 않으며, phone vs invitation.phone 매칭은 인증
 *        액션 (signup 페이지) 이 책임.
 *      - 트랜잭션: user + partner INSERT + invitation 소비 (consumedAt + consumedUserId)
 *      - 성공: /partner, 실패: /partner/signup/<token>?error=…
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
 * Signup — invitation 소비 + user/partner 트랜잭션 생성
 * ============================================================ */

async function handleSignup(
  req: NextRequest,
  authUser: SupabaseUser,
  invitationToken: string,
) {
  const { origin } = new URL(req.url);
  const supabase = await getSupabaseServerClient();
  const errorBase = `${origin}/partner/signup/${invitationToken}`;

  const email = authUser.email;
  if (!email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${errorBase}?error=no_email`);
  }

  // invitation 본문 조회 — user/partner INSERT 데이터 출처.
  const invitation = await prisma.partnerInvitation.findUnique({
    where: { token: invitationToken },
  });
  if (
    !invitation ||
    invitation.consumedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    await supabase.auth.signOut();
    // 토큰이 무효하면 signup 페이지가 자체적으로 "유효하지 않은 가입 링크" 분기.
    return NextResponse.redirect(errorBase);
  }

  // 본인인증 미통과 시 Kakao 가입 진행 불가 — signup 페이지에서 PortOne 인증 먼저.
  // 페이지 UI 에선 미인증 시 Kakao 버튼 비활성이라 정상 흐름엔 도달 안 함. 직접 URL
  // 조작으로 들어온 경우 차단.
  if (!invitation.phoneVerifiedAt) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${errorBase}?error=phone_unverified`);
  }

  const userId = newId();

  try {
    await prisma.$transaction(async (tx) => {
      // tx 안에서 invitation 재확인 (동시 소비 race 차단).
      const reread = await tx.partnerInvitation.findUnique({
        where: { id: invitation.id },
        select: {
          consumedAt: true,
          expiresAt: true,
          phoneVerifiedAt: true,
        },
      });
      if (
        !reread ||
        reread.consumedAt ||
        reread.expiresAt.getTime() < Date.now() ||
        !reread.phoneVerifiedAt
      ) {
        throw new InvitationStaleError();
      }

      await tx.user.create({
        data: {
          id: userId,
          authId: authUser.id,
          email,
          name: invitation.name,
          phone: invitation.phone,
        },
      });
      await tx.partner.create({
        data: {
          id: userId,
          bio: invitation.bio,
          yearsOfExperience: invitation.yearsOfExperience,
          trustMetric: invitation.trustMetric,
          licenseNumber: invitation.licenseNumber,
          active: invitation.active,
        },
      });
      await tx.partnerInvitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date(), consumedUserId: userId },
      });
    });
  } catch (err) {
    await supabase.auth.signOut();

    if (err instanceof InvitationStaleError) {
      return NextResponse.redirect(errorBase);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 = UNIQUE 충돌 — User.authId / User.email / User.phone / Partner.licenseNumber.
      // authId 충돌 = 같은 카카오 계정이 다른 user 와 이미 연결됨.
      if (err.code === "P2002") {
        return NextResponse.redirect(`${errorBase}?error=already_registered`);
      }
    }
    console.error("[signup] transaction failed", err);
    return NextResponse.redirect(`${errorBase}?error=signup_failed`);
  }

  return NextResponse.redirect(`${origin}/partner`);
}

class InvitationStaleError extends Error {}

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
