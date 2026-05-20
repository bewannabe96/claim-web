"use server";

import { randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { newId } from "@/lib/id";
import { isAligoTestMode, sendOtpSms } from "@/server/aligo";
import { getOptionalAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";
import { getClientIp } from "@/server/get-client-ip";
import { resolveOrigin } from "@/server/origin";
import { getRedis } from "@/server/redis";
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
 * "어떤 Kakao 계정인지" 자체는 보안 게이트가 아님 — 본인인증 (휴대폰 OTP) 의 phone
 * 매칭이 횡령 방지 책임. user/partner 트랜잭션은 콜백이 아니라 Step 2 본인인증
 * 통과 시점에 일어남 (verifyPartnerSignupOtp 가 소유).
 */
export async function signUpWithKakao(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    redirect("/partner/login?error=oauth_failed");
  }

  // 어드민 본인 겸직 invitation 은 Kakao OAuth 흐름이 아님 — admin 세션 + OTP 로만.
  const invitationKind = await prisma.partnerInvitation.findUnique({
    where: { token },
    select: { existingUserId: true },
  });
  if (invitationKind?.existingUserId) {
    redirect(`/partner/signup/${token}?error=admin_required`);
  }

  const supabase = await getSupabaseServerClient();

  // 이전 진입에서 남은 Supabase 세션 제거 — server action 은 mutable cookie
  // 컨텍스트라 setAll 가 실제로 cookie 를 지움. 세션이 없을 땐 no-op.
  await supabase.auth.signOut();

  // 헤더 기반 base URL 추론 — 결정 로직 단일화 진입점은 `server/origin.ts`
  // (login action 과 공유). Supabase Redirect URLs 화이트리스트 등록 필수.
  const origin = await resolveOrigin();

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
 * Step 2 — 휴대폰 본인인증 (알리고 SMS + Redis OTP) + 가입 트랜잭션
 * ============================================================
 *
 * invitation.phone 으로 6자리 코드를 SMS 발송 → Redis 에 EX=180 저장.
 * 호출자(verifyPartnerSignupOtp) 가 GET / DEL 로 확인. test mode 시 코드
 * "000000" 고정 + 알리고 호출 생략 (dev 편의). 마케팅 측 requests/actions.ts
 * 의 OTP 흐름과 동일 패턴.
 *
 * 두 액션 모두 caller 의 Kakao session + invitation.linkedAuthId 매칭을 검증 —
 * 가장 최근 OAuth 한 세션만 verify 호출 가능 (다른 탭이 같은 링크로 OAuth 해 lock 이
 * 옮겨갔다면 stale tab 의 verify 시도는 거절). 횡령 방지는 phone OTP 가 담당하므로
 * Kakao 계정 자체는 보안 게이트가 아님 — 이 검사는 단지 "최신 OAuth 한 브라우저
 * 컨텍스트가 verify 한다" 는 일관성 검증.
 *
 * verifyPartnerSignupOtp 는 가입 트랜잭션의 owner — 통과 시점에 user + partner
 * INSERT + invitation 소비가 단일 트랜잭션으로 일어남. 콜백은 lock 만 책임.
 */

/** 인증번호 TTL = 재전송 쿨다운. 키가 살아있는 동안 재발송 차단. */
const OTP_TTL_SECONDS = 180;
/** IP 발송 시도 카운터 윈도우. fixed window (sliding 아님). */
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function otpKey(invitationId: string): string {
  return `otp:partner-signup:${invitationId}`;
}

function rateLimitKey(ip: string): string {
  return `otp:rl:${ip}`;
}

type SendOtpResult =
  | { ok: true; retryAfterSeconds: number }
  | { ok: false; error: string; retryAfterSeconds?: number };

type VerifyResult = { ok: true } | { ok: false; error: string };

type CallerAuth =
  | { kind: "kakao"; authUserId: string }
  | { kind: "admin"; adminUserId: string };

/**
 * token 유효성 + caller 세션 매칭 검증.
 *
 * `kind === "kakao"`: 일반 신규 가입 흐름. invitation.linkedAuthId === authUserId
 * 매칭 확인 (verify 페이지 가드와 중복이지만 server action 은 layout 게이트 미적용).
 *
 * `kind === "admin"`: 어드민 본인 겸직 흐름. invitation.existingUserId === adminUserId
 * 매칭 확인. Kakao 세션 / linkedAuthId 는 무시.
 *
 * select 는 가입 트랜잭션에 필요한 partner 컬럼 전체 + 분기에 필요한 메타 포함.
 */
async function getInvitationForCaller(token: string, caller: CallerAuth) {
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
      existingUserId: true,
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

  if (caller.kind === "admin") {
    if (invitation.existingUserId !== caller.adminUserId) {
      return {
        ok: false as const,
        error: "어드민 본인 설계사 등록 권한이 없습니다.",
      };
    }
  } else {
    if (invitation.existingUserId) {
      return {
        ok: false as const,
        error: "어드민 계정으로 로그인한 상태에서만 진행할 수 있어요.",
      };
    }
    if (invitation.linkedAuthId !== caller.authUserId) {
      // 다른 탭/창에서 같은 링크로 새 OAuth 가 들어와 lock 이 옮겨감 (또는 reissue).
      // 사용자에겐 단순 stale session 안내 — 같은 링크 재진입 시 다시 OAuth 부터 시작.
      return {
        ok: false as const,
        error: "가입 링크 상태가 변경됐어요. 처음부터 다시 시도해주세요.",
      };
    }
  }
  return { ok: true as const, invitation };
}

/**
 * 호출자 세션 판정 — invitation 의 mode 에 따라 admin / kakao 분기.
 *
 * 두 흐름의 진입 게이트가 다르기 때문에 invitation 조회 전에 token 만 보고 mode 를
 * 한 번 더 lookup (DB 한 번 추가). 비용은 작고, server action 안에서 클라이언트가
 * 보낸 hidden field 에 의존하지 않게 하기 위한 trade-off.
 */
async function resolveCallerAuth(
  token: string,
): Promise<
  | { ok: true; caller: CallerAuth; authUserEmail?: string }
  | { ok: false; error: string }
> {
  const meta = await prisma.partnerInvitation.findUnique({
    where: { token },
    select: { existingUserId: true },
  });
  if (!meta) {
    return { ok: false, error: "유효하지 않은 가입 링크입니다." };
  }

  if (meta.existingUserId) {
    const adminSession = await getOptionalAdminSession();
    if (!adminSession || adminSession.user.id !== meta.existingUserId) {
      return {
        ok: false,
        error: "어드민 계정으로 로그인한 상태에서만 진행할 수 있어요.",
      };
    }
    return {
      ok: true,
      caller: { kind: "admin", adminUserId: adminSession.user.id },
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = claimsError ? null : claimsData?.claims;
  const authUserId = claims?.sub ?? null;
  const authUserEmail =
    typeof claims?.email === "string" ? claims.email : undefined;
  if (!authUserId) {
    return {
      ok: false,
      error: "카카오 세션이 만료됐어요. 처음부터 다시 시도해주세요.",
    };
  }
  return {
    ok: true,
    caller: { kind: "kakao", authUserId },
    authUserEmail,
  };
}

/**
 * 인증번호 전송 — invitation.phone 으로 6자리 코드 발송.
 *
 * 차단 로직 (우선순위 순):
 *   1. Kakao 세션 + invitation.linkedAuthId 매칭
 *   2. IP 기반 레이트리밋 — 60분 윈도우 5회 초과 차단 (Redis INCR+EXPIRE NX)
 *      `otp:rl:{ip}` 는 마케팅 OTP 와 카운터 공유 — 같은 IP 의 전체 OTP 시도 통제.
 *   3. 재전송 쿨다운 — 기존 코드 키 TTL 살아있으면 차단 (`PTTL > 0`)
 *
 * test mode 일 때는 코드 "000000" 고정 + 알리고 호출 생략 (dev 편의).
 */
export async function requestPartnerSignupOtp(
  token: string,
): Promise<SendOtpResult> {
  const callerLookup = await resolveCallerAuth(token);
  if (!callerLookup.ok) return { ok: false, error: callerLookup.error };

  const lookup = await getInvitationForCaller(token, callerLookup.caller);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  const { invitation } = lookup;

  const redis = getRedis();
  const ip = await getClientIp();

  // 1) IP 레이트리밋. EXPIRE 의 NX 효과로 첫 INCR 시에만 TTL 설정 → fixed 60분 윈도우.
  //    `OTP_RATE_LIMIT_DISABLED=Y` 일 땐 카운터 자체를 건드리지 않음 — load test /
  //    스테이징 디버깅 편의. prod 미설정 시 default 동작 (rate limit on).
  if (process.env.OTP_RATE_LIMIT_DISABLED !== "Y") {
    const rlKey = rateLimitKey(ip);
    const count = await redis.incr(rlKey);
    if (count === 1) {
      await redis.expire(rlKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (count > RATE_LIMIT_MAX_ATTEMPTS) {
      return {
        ok: false,
        error: "발송 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.",
      };
    }
  }

  // 2) 재전송 쿨다운 — 기존 코드 TTL 살아있으면 그 잔여 초 반환.
  const key = otpKey(invitation.id);
  const pttl = await redis.pttl(key);
  if (pttl > 0) {
    const retryAfter = Math.ceil(pttl / 1000);
    return {
      ok: false,
      error: `${retryAfter}초 후 재전송 가능합니다.`,
      retryAfterSeconds: retryAfter,
    };
  }

  // 3) 코드 생성 + 알리고 발송 (test mode 면 코드 고정 + 알리고 호출 생략).
  const testMode = isAligoTestMode();
  const code = testMode
    ? "000000"
    : randomInt(0, 1_000_000).toString().padStart(6, "0");

  if (!testMode) {
    try {
      await sendOtpSms(invitation.phone, code);
    } catch (err) {
      console.error("[partner-signup] aligo send failed", err);
      return {
        ok: false,
        error: "인증번호 전송에 실패했어요. 잠시 후 다시 시도해주세요.",
      };
    }
  }

  // 4) Redis 에 저장 — TTL=쿨다운=만료 모두 동일 의미.
  await redis.set(key, code, { ex: OTP_TTL_SECONDS });
  return { ok: true, retryAfterSeconds: OTP_TTL_SECONDS };
}

class InvitationStaleError extends Error {}

/**
 * 인증번호 검증 + 가입 트랜잭션.
 *
 * Redis 의 저장된 코드와 비교 → 일치 시 즉시 DEL (재사용 차단) → user + partner
 * INSERT + invitation 소비를 단일 트랜잭션으로 처리. tx 안에서 invitation 재확인
 * (소비 / 만료 / linkedAuthId 셋 모두 → race-safe).
 */
export async function verifyPartnerSignupOtp(
  token: string,
  code: string,
): Promise<VerifyResult> {
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "인증번호 6자리를 입력해주세요." };
  }

  const callerLookup = await resolveCallerAuth(token);
  if (!callerLookup.ok) return { ok: false, error: callerLookup.error };
  const { caller, authUserEmail } = callerLookup;

  if (caller.kind === "kakao" && !authUserEmail) {
    return {
      ok: false,
      error: "카카오 세션이 만료됐어요. 처음부터 다시 시도해주세요.",
    };
  }

  const lookup = await getInvitationForCaller(token, caller);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  const { invitation } = lookup;

  // OTP 검증 — Redis 의 저장된 코드와 비교, 성공 시 즉시 무효화.
  const redis = getRedis();
  const key = otpKey(invitation.id);
  const stored = await redis.get(key);
  if (stored === null) {
    return {
      ok: false,
      error: "인증번호가 만료되었습니다. 재전송해주세요.",
    };
  }
  if (stored !== code) {
    return { ok: false, error: "인증번호가 올바르지 않습니다." };
  }
  // 코드 일치 — 즉시 무효화. 가입 트랜잭션 실패해도 같은 코드 재사용은 막음.
  await redis.del(key);

  // 어드민 본인 겸직 흐름 — 기존 User row 에 Partner extension 만 추가.
  if (caller.kind === "admin") {
    try {
      await prisma.$transaction(async (tx) => {
        const reread = await tx.partnerInvitation.findUnique({
          where: { id: invitation.id },
          select: {
            consumedAt: true,
            expiresAt: true,
            existingUserId: true,
            phone: true,
          },
        });
        if (
          !reread ||
          reread.consumedAt ||
          reread.expiresAt.getTime() < Date.now() ||
          reread.existingUserId !== caller.adminUserId
        ) {
          throw new InvitationStaleError();
        }
        // user.phone 과 invitation.phone 의 사후 mismatch 차단.
        const user = await tx.user.findUnique({
          where: { id: caller.adminUserId },
          select: {
            phone: true,
            partner: { select: { id: true } },
            admin: { select: { active: true } },
          },
        });
        if (
          !user ||
          !user.admin?.active ||
          user.partner ||
          user.phone !== reread.phone
        ) {
          throw new InvitationStaleError();
        }

        await tx.partner.create({
          data: {
            id: caller.adminUserId,
            bio: invitation.bio,
            yearsOfExperience: invitation.yearsOfExperience,
            trustMetric: invitation.trustMetric,
            licenseNumber: invitation.licenseNumber,
            active: invitation.active,
          },
        });
        await tx.partnerCreditBalance.create({
          data: { partnerId: caller.adminUserId },
        });
        await tx.partnerMatchStats.create({
          data: { partnerId: caller.adminUserId },
        });
        await tx.partnerInvitation.update({
          where: { id: invitation.id },
          data: {
            consumedAt: new Date(),
            consumedUserId: caller.adminUserId,
            phoneVerifiedAt: new Date(),
          },
        });
      });
    } catch (err) {
      if (err instanceof InvitationStaleError) {
        return {
          ok: false,
          error: "어드민 본인 상태가 변경됐어요. 다시 시도해주세요.",
        };
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return {
            ok: false,
            error: "이미 등록된 자격번호이거나 충돌이 발생했어요.",
          };
        }
      }
      console.error("[partner-signup] admin-extension transaction failed", err);
      return {
        ok: false,
        error: "가입 처리 중 오류가 발생했어요. 다시 시도해주세요.",
      };
    }

    redirect("/admin/partners");
  }

  // 일반 신규 가입 흐름 — user + partner 동시 INSERT.
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
        reread.linkedAuthId !== caller.authUserId
      ) {
        throw new InvitationStaleError();
      }

      await tx.user.create({
        data: {
          id: userId,
          authId: caller.authUserId,
          email: authUserEmail!,
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
      // 잔액 row eager-create — Partner.exists ⇔ PartnerCreditBalance.exists 불변식.
      // 같은 tx 안에서 INSERT 해 all-or-nothing 보존.
      await tx.partnerCreditBalance.create({
        data: { partnerId: userId },
      });
      // 매칭 카운터 row eager-create — Partner.exists ⇔ PartnerMatchStats.exists 불변식.
      await tx.partnerMatchStats.create({
        data: { partnerId: userId },
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
