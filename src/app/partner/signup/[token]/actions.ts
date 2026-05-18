"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

/* ============================================================
 * Step 1 — 본인인증 (placeholder, PortOne 연동 전)
 * ============================================================
 *
 * 두 액션 모두 production 환경에서는 fail-closed (`?error=…` 반환). PortOne 연동
 * 시점에 각 액션 본문을:
 *   - `requestPartnerSignupOtp` → PortOne `requestIdentityVerification` 호출
 *   - `verifyPartnerSignupOtp` → PortOne API 로 결과 검증 + phone 매칭
 * 로 교체. UI 시그니처/리턴 타입은 그대로 유지 가능.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function getInvitationIfActive(token: string) {
  const invitation = await prisma.partnerInvitation.findUnique({
    where: { token },
    select: { id: true, phone: true, consumedAt: true, expiresAt: true },
  });
  if (!invitation) return null;
  if (invitation.consumedAt) return null;
  if (invitation.expiresAt.getTime() < Date.now()) return null;
  return invitation;
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

  const invitation = await getInvitationIfActive(token);
  if (!invitation) {
    return { ok: false, error: "유효하지 않은 가입 링크입니다." };
  }

  // PortOne 연동 시: 본인인증 요청 (이름/RRN/phone 페이로드 전달 → SMS/PASS 발송).
  console.log(
    `[partner-signup] OTP 발송 placeholder — invitation=${invitation.id} (PortOne 미연동, 아무 6자리 코드나 검증 통과)`,
  );
  return { ok: true };
}

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

  const invitation = await getInvitationIfActive(token);
  if (!invitation) {
    return { ok: false, error: "유효하지 않은 가입 링크입니다." };
  }

  // PortOne 연동 시: API 로 OTP 검증 → 검증된 phone vs invitation.phone 매칭 확인.
  // 현재 placeholder: 자릿수 검증만 통과 후 즉시 phoneVerifiedAt 갱신.
  await prisma.partnerInvitation.update({
    where: { id: invitation.id },
    data: { phoneVerifiedAt: new Date() },
  });

  revalidatePath(`/partner/signup/${token}`);
  return { ok: true };
}

/* ============================================================
 * Step 2 — 카카오 가입
 * ============================================================
 *
 * 카카오톡 OAuth 가입 트리거. callback URL 에 `?signup=<token>` 을 실어 콜백이
 * signup 분기를 타고 invitation 소비 + user/partner 트랜잭션 생성을 수행하도록 함.
 *
 * phone 매칭은 Step 1 의 PortOne 본인인증이 책임 — 콜백은 invitation 의
 * phoneVerifiedAt 게이트만 확인 (Kakao OAuth 는 phone 을 제공하지 않음).
 */
export async function signUpWithKakao(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    redirect("/partner/login?error=oauth_failed");
  }

  const supabase = await getSupabaseServerClient();
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host") ?? ""}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${origin}/api/auth/callback?signup=${encodeURIComponent(token)}`,
    },
  });

  if (error || !data.url) {
    redirect(`/partner/signup/${token}?error=oauth_failed`);
  }

  redirect(data.url as Route);
}
