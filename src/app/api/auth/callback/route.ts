import type { User as SupabaseUser } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/safe-next-path";
import { prisma } from "@/server/db/prisma";
import { resolveOrigin } from "@/server/origin";
import { getSupabaseServerClient } from "@/server/supabase";

/**
 * Supabase OAuth 콜백 — partner Kakao 로그인 / 신규 가입 공용.
 *
 * 두 분기:
 *
 *   1. **signup** (`?signup=<invitation_token>`): 어드민이 발급한 가입 초청으로 진입.
 *      - code → session 교환
 *      - invitation 게이트: 미소비 + 미만료
 *      - linkedAuthId 처리: **무조건 덮어씀** — 매 진입마다 새 Kakao OAuth 가
 *        가장 최근 계정으로 lock 갱신. 이전 진입에서 다른 계정이 lock 했어도 무시.
 *        횡령 방지는 휴대폰 OTP (알리고 SMS) 가 책임 — 발송 대상이 invitation.phone
 *        으로 고정되어 invitation 소유자만 코드 수신 가능. Kakao 계정 자체는 가입 후
 *        어떤 계정으로 로그인할지를 결정하는 수단일 뿐. 진입마다 새 OAuth 가 강제되
 *        므로 (signUpWithKakao 가 signOut + prompt=login), 동일 계정 재진입도 동일
 *        하게 overwrite 됨 (no-op).
 *      - phoneVerifiedAt 리셋 — 이전 lock 시점에 본인인증을 통과했더라도, 새 계정으로
 *        진입한 이상 다시 본인인증 받도록 강제.
 *      - 콜백은 user/partner 트랜잭션을 **하지 않음** — 본인인증 통과 시점에
 *        verifyPartnerSignupOtp action 이 단일 트랜잭션으로 user + partner +
 *        invitation 소비를 수행. 콜백의 책임은 invitation lock 갱신 + verify forward.
 *      - 성공: /partner/signup/<token>/verify, 실패: /partner/signup/<token>?error=…
 *
 *   2. **login** (signup 미존재): 기존 가입자 로그인.
 *      - code → session 교환
 *      - email 로 User 화이트리스트 조회 (partner extension active 확인)
 *      - authId 비어 있으면 claim (드물게 운영자가 수동 user 만들었을 때만)
 *      - 성공: ?next 또는 /partner, 실패: /partner/login?error=…&next=…
 *
 * route handler 는 mutable cookie 컨텍스트라 supabase ssr setAll 가 정상 작동.
 *
 * **redirect URL origin**: `new URL(req.url).origin` 대신 `resolveOrigin()` 사용.
 * Vercel / Cloudflare 같은 reverse proxy 뒤에선 `req.url` 의 host 가 internal
 * 도메인으로 잡힐 수 있어, Supabase 공식 가이드도 `x-forwarded-host` 분기를
 * 권고. resolveOrigin 이 그 로직을 이미 포함 (Origin > x-forwarded-* > host).
 * signInWithKakao action 의 redirectTo 와 동일 helper 로 통일.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const signupToken = searchParams.get("signup");
  // defense in depth — 외부 도메인 / 다른 영역 / `//evil.com` 류 차단.
  // login action / page 가 이미 검증하지만, callback URL 은 외부에 노출되므로
  // 위조 redirectTo 로 진입 가능 → 여기서도 동일 validator 통과 강제.
  const next = safeNextPath(searchParams.get("next"));
  const origin = await resolveOrigin();

  if (!code) {
    if (signupToken) {
      return NextResponse.redirect(
        `${origin}/partner/signup/${signupToken}?error=oauth_failed`,
      );
    }
    return NextResponse.redirect(loginErrorUrl(origin, "no_code", next));
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    if (signupToken) {
      return NextResponse.redirect(
        `${origin}/partner/signup/${signupToken}?error=oauth_failed`,
      );
    }
    return NextResponse.redirect(loginErrorUrl(origin, "oauth_failed", next));
  }

  if (signupToken) {
    return handleSignup(data.user, signupToken, origin);
  }

  return handleLogin(data.user, next, origin);
}

/**
 * /partner/login?error=<code> URL 빌더. next 가 기본값 (/partner) 이 아니면 query
 * 에 보존해, 재시도 후에도 원래 목적지로 복귀 가능하게 함.
 */
function loginErrorUrl(origin: string, error: string, next: string): string {
  const url = new URL(`${origin}/partner/login`);
  url.searchParams.set("error", error);
  if (next !== "/partner") url.searchParams.set("next", next);
  return url.toString();
}

/* ============================================================
 * Signup — invitation 의 Kakao 계정 lock 갱신 + verify 페이지로 forward
 * ============================================================
 *
 * 매 진입마다 가장 최근 OAuth 계정으로 linkedAuthId 를 무조건 덮어씀. 횡령 방지는
 * 휴대폰 OTP (알리고 SMS 발송 대상 = invitation.phone) 가 책임 — Kakao 계정 자체는
 * 보안 게이트가 아님.
 *
 * 가입 트랜잭션은 본인인증 통과 후 verifyPartnerSignupOtp action 이 소유 —
 * 여기서는 어떤 user/partner row 도 만들지 않음 (partial state 회귀 방지).
 */

async function handleSignup(
  authUser: SupabaseUser,
  invitationToken: string,
  origin: string,
) {
  const supabase = await getSupabaseServerClient();
  const errorBase = `${origin}/partner/signup/${invitationToken}`;

  if (!authUser.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${errorBase}?error=no_email`);
  }

  // 미소비 + 미만료 invitation 만 lock 갱신. consumedAt 조건이 race-safe
  // — 동시 콜백이 들어와도 가입 트랜잭션이 먼저 consumedAt 을 채우면
  // 그 이후 콜백은 WHERE 조건에 안 걸려 no-op.
  const updated = await prisma.partnerInvitation.updateMany({
    where: {
      token: invitationToken,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      // 매 진입마다 최신 Kakao 계정으로 덮어씀. 이전 lock 무시.
      linkedAuthId: authUser.id,
      // 새 계정으로 진입한 이상 이전 본인인증 audit 도 리셋 — 동일 계정 재진입에도
      // 일관되게 빈 상태로 시작 (verifyPartnerSignupOtp 가 가입 직전 다시 세팅).
      phoneVerifiedAt: null,
    },
  });

  if (updated.count === 0) {
    await supabase.auth.signOut();
    // 토큰 무효 (없거나 / 소비됐거나 / 만료됨) → signup 페이지가 "유효하지 않은 가입 링크" 분기.
    return NextResponse.redirect(errorBase);
  }

  return NextResponse.redirect(`${errorBase}/verify`);
}

/* ============================================================
 * Login — 기존 가입자 (drift 안전) 진입
 * ============================================================ */

async function handleLogin(
  authUser: SupabaseUser,
  next: string,
  origin: string,
) {
  const supabase = await getSupabaseServerClient();

  const email = authUser.email;
  if (!email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(loginErrorUrl(origin, "no_email", next));
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
    return NextResponse.redirect(loginErrorUrl(origin, "not_registered", next));
  }

  if (!user.authId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { authId: authUser.id },
    });
  } else if (user.authId !== authUser.id) {
    // 사전 등록된 email 이 이미 다른 Supabase 계정과 매핑됨 — 운영자 수동 정정 필요.
    await supabase.auth.signOut();
    return NextResponse.redirect(loginErrorUrl(origin, "not_registered", next));
  }

  return NextResponse.redirect(`${origin}${next}`);
}
