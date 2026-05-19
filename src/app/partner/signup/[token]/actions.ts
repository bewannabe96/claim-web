"use server";

import { Prisma } from "@prisma/client";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { newId } from "@/lib/id";
import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

/* ============================================================
 * Step 1 — Kakao OAuth 가입 시작
 * ============================================================
 *
 * 카카오톡 OAuth 트리거. 매 진입마다 새로 인증 — 다른 카카오 계정으로 재시도 가능.
 *   1. 현재 Supabase 세션 signOut (이전 invitation 진입의 잔여 세션 청소)
 *   2. signInWithOAuth + `prompt=login` 으로 Kakao 측 SSO 우회 → 계정 선택 강제
 *   3. callback URL 에 `?signup=<token>` 을 실어 콜백의 signup 분기로 진입 →
 *      invitation.linkedAuthId 를 **무조건 덮어씀** (이전 lock 무시) 후 verify 로 forward
 *
 * "어떤 Kakao 계정인지" 자체는 보안 게이트가 아님 — 본인인증 (PortOne) 의 phone
 * 매칭이 횡령 방지 책임. user/partner 트랜잭션은 콜백이 아니라 Step 2 본인인증
 * 통과 시점에 일어남 (verifyPartnerSignupOtp 가 소유).
 */
export async function signUpWithKakao(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    redirect("/partner/login?error=oauth_failed");
  }

  const supabase = await getSupabaseServerClient();

  // 이전 진입에서 남은 Supabase 세션 제거 — server action 은 mutable cookie
  // 컨텍스트라 setAll 가 실제로 cookie 를 지움. 세션이 없을 땐 no-op.
  await supabase.auth.signOut();

  const h = await headers();
  // reverse proxy (Vercel / ngrok) 환경에서 host 헤더가 internal 로 잡히면
  // redirectTo 가 잘못 생성돼 Supabase 가 Site URL ("/") 로 fallback. login
  // action 과 동일하게 x-forwarded-* 우선 사용. 변경 시 양쪽 동기화.
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto");
  const host = forwardedHost ?? h.get("host") ?? "";
  const proto =
    forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = h.get("origin") ?? `${proto}://${host}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/api/auth/callback?signup=${encodeURIComponent(token)}`,
      // Kakao SSO 우회 — 이전 카카오 로그인 세션이 살아있어도 계정 선택 화면 강제.
      // OIDC 표준 파라미터. Kakao 가 명시 미지원이어도 무해 (그냥 무시).
      queryParams: { prompt: "login" },
    },
  });

  if (error || !data.url) {
    redirect(`/partner/signup/${token}?error=oauth_failed`);
  }

  redirect(data.url as Route);
}

/* ============================================================
 * Step 2 — 본인인증 (placeholder, PortOne 연동 전) + 가입 트랜잭션
 * ============================================================
 *
 * 두 액션 모두 production 환경에서는 fail-closed. PortOne 연동 시점에:
 *   - `requestPartnerSignupOtp` → PortOne `requestIdentityVerification` 호출
 *   - `verifyPartnerSignupOtp` → PortOne API 결과 검증 + phone 매칭
 * 으로 본문 교체. UI 시그니처는 유지.
 *
 * 두 액션 모두 caller 의 Kakao session + invitation.linkedAuthId 매칭을 검증 —
 * 가장 최근 OAuth 한 세션만 verify 호출 가능 (다른 탭이 같은 링크로 OAuth 해 lock 이
 * 옮겨갔다면 stale tab 의 verify 시도는 거절). 횡령 방지는 PortOne 의 phone 매칭이
 * 담당하므로 Kakao 계정 자체는 보안 게이트가 아님 — 이 검사는 단지 "최신 OAuth 한
 * 브라우저 컨텍스트가 verify 한다" 는 일관성 검증.
 *
 * verifyPartnerSignupOtp 는 가입 트랜잭션의 owner — 통과 시점에 user + partner
 * INSERT + invitation 소비가 단일 트랜잭션으로 일어남. 콜백은 lock 만 책임.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * token 유효성 + caller Kakao session + linkedAuthId 매칭 검증.
 * verify 라우트의 페이지 가드와 중복이지만 server action 은 layout 게이트를
 * 거치지 않으므로 자체 검증 필수.
 *
 * select 는 가입 트랜잭션에 필요한 partner 컬럼 전체를 포함 — caller 가 invitation
 * 을 통째로 받아 INSERT 데이터로 직접 사용.
 */
async function getInvitationForCaller(token: string, authUserId: string) {
  const invitation = await prisma.partnerInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      name: true,
      phone: true,
      bio: true,
      yearsOfExperience: true,
      trustMetric: true,
      licenseNumber: true,
      active: true,
      consumedAt: true,
      expiresAt: true,
      linkedAuthId: true,
    },
  });
  if (!invitation) {
    return { ok: false as const, error: "유효하지 않은 가입 링크입니다." };
  }
  if (invitation.consumedAt) {
    return { ok: false as const, error: "이미 가입이 완료된 링크입니다." };
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "가입 링크가 만료되었습니다." };
  }
  if (invitation.linkedAuthId !== authUserId) {
    // 다른 탭/창에서 같은 링크로 새 OAuth 가 들어와 lock 이 옮겨감 (또는 reissue).
    // 사용자에겐 단순 stale session 안내 — 같은 링크 재진입 시 다시 OAuth 부터 시작.
    return {
      ok: false as const,
      error: "가입 링크 상태가 변경됐어요. 처음부터 다시 시도해주세요.",
    };
  }
  return { ok: true as const, invitation };
}

export async function requestPartnerSignupOtp(
  token: string,
  rrnFront: string,
  rrnBack: string,
): Promise<ActionResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "본인인증이 아직 활성화되지 않았습니다." };
  }
  if (!/^\d{6}$/.test(rrnFront) || !/^\d$/.test(rrnBack)) {
    return { ok: false, error: "주민등록번호 형식을 확인해주세요." };
  }

  const supabase = await getSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const authUserId = claimsError ? null : (claimsData?.claims.sub ?? null);
  if (!authUserId) {
    return {
      ok: false,
      error: "카카오 세션이 만료됐어요. 처음부터 다시 시도해주세요.",
    };
  }

  const result = await getInvitationForCaller(token, authUserId);
  if (!result.ok) return result;

  // PortOne 연동 시: 본인인증 요청 (이름/RRN/phone 페이로드 전달 → SMS/PASS 발송).
  console.log(
    `[partner-signup] OTP 발송 placeholder — invitation=${result.invitation.id} (PortOne 미연동, 아무 6자리 코드나 검증 통과)`,
  );
  return { ok: true };
}

class InvitationStaleError extends Error {}

export async function verifyPartnerSignupOtp(
  token: string,
  code: string,
): Promise<ActionResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "본인인증이 아직 활성화되지 않았습니다." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "인증번호 6자리를 입력해주세요." };
  }

  const supabase = await getSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims;
  const authUserId = claims?.sub ?? null;
  const authUserEmail =
    typeof claims?.email === "string" ? claims.email : null;
  if (!authUserId || !authUserEmail) {
    return {
      ok: false,
      error: "카카오 세션이 만료됐어요. 처음부터 다시 시도해주세요.",
    };
  }

  const lookup = await getInvitationForCaller(token, authUserId);
  if (!lookup.ok) return lookup;
  const { invitation } = lookup;

  // PortOne 연동 시: API 로 OTP 검증 → 검증된 phone vs invitation.phone 매칭 확인.
  // placeholder: 자릿수 + linkedAuthId 매칭만 통과 후 가입 트랜잭션으로 직행.

  const userId = newId();

  try {
    await prisma.$transaction(async (tx) => {
      // tx 안에서 invitation 재확인 (동시 소비 + linkedAuthId 변경 race 차단).
      const reread = await tx.partnerInvitation.findUnique({
        where: { id: invitation.id },
        select: {
          consumedAt: true,
          expiresAt: true,
          linkedAuthId: true,
        },
      });
      if (
        !reread ||
        reread.consumedAt ||
        reread.expiresAt.getTime() < Date.now() ||
        reread.linkedAuthId !== authUserId
      ) {
        throw new InvitationStaleError();
      }

      await tx.user.create({
        data: {
          id: userId,
          authId: authUserId,
          email: authUserEmail,
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
        data: {
          consumedAt: new Date(),
          consumedUserId: userId,
          phoneVerifiedAt: new Date(),
        },
      });
    });
  } catch (err) {
    if (err instanceof InvitationStaleError) {
      return {
        ok: false,
        error: "가입 링크 상태가 변경됐어요. 처음부터 다시 시도해주세요.",
      };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 = UNIQUE 충돌 — User.authId / User.email / User.phone / Partner.licenseNumber.
      // authId 충돌 = 같은 카카오 계정이 다른 user 와 이미 연결됨.
      if (err.code === "P2002") {
        return {
          ok: false,
          error: "이 카카오 계정은 이미 다른 사용자와 연결되어 있어요.",
        };
      }
    }
    console.error("[partner-signup] transaction failed", err);
    return {
      ok: false,
      error: "가입 처리 중 오류가 발생했어요. 다시 시도해주세요.",
    };
  }

  redirect("/partner");
}
