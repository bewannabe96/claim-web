import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPartnerSignupInvitationByToken } from "@/features/partners/queries";
import { getOptionalAdminSession } from "@/server/dal";
import { getSupabaseServerClient } from "@/server/supabase";

import { VerifyForm } from "./_components/verify-form";

export const metadata: Metadata = {
  title: "설계사 가입 — 본인인증",
  description:
    "등록된 휴대폰 번호로 인증번호를 받아 설계사 가입을 마무리해주세요.",
};

const VERIFY_ERRORS: Record<string, string> = {
  already_registered:
    "이 카카오 계정은 이미 다른 사용자와 연결되어 있습니다. 운영자에게 문의하세요.",
  signup_failed: "가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
};

/**
 * 설계사 신규 가입 — Step 2 본인인증 페이지.
 *
 * 이중 게이트:
 *   1. token URL (`/partner/signup/[token]/verify`) — 어드민이 발급한 초청 토큰.
 *   2. Kakao 세션 — `invitation.linkedAuthId` 와 일치하는 auth.users.id 만 통과.
 *      세션 없거나 다른 계정이면 Step 1 (Kakao 가입) 로 silent redirect — 거기서
 *      새 Kakao OAuth 가 lock 을 덮어씀.
 *
 * 통과 시 휴대폰 OTP 본인인증 폼 노출 (알리고 SMS + Redis). 폼이
 * verifyPartnerSignupOtp 액션 호출하면 가입 트랜잭션이 일어남
 * (user + partner INSERT + invitation 소비).
 */
export default async function PartnerSignupVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const invitation = await getPartnerSignupInvitationByToken(token);
  if (!invitation) {
    return (
      <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          유효하지 않은 가입 링크
        </h1>
        <p className="mt-3 text-sm text-[#4b4b4b]">
          링크가 만료됐거나 이미 사용되었어요. 운영자에게 새 가입 링크를 요청해
          주세요.
        </p>
      </main>
    );
  }

  // 어드민 본인 겸직 흐름 — admin 세션이 인증 게이트. Kakao 단계 우회.
  if (invitation.existingUserId) {
    const adminSession = await getOptionalAdminSession();
    if (!adminSession || adminSession.user.id !== invitation.existingUserId) {
      redirect(
        `/admin/login?next=${encodeURIComponent(`/partner/signup/${token}/verify`)}`,
      );
    }
  } else {
    const supabase = await getSupabaseServerClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const authUserId = claimsError ? null : (claimsData?.claims.sub ?? null);

    // 세션 없으면 카카오 가입 단계로 redirect (그 페이지가 Step 1 시작 버튼 노출).
    if (!authUserId) {
      redirect(`/partner/signup/${token}`);
    }

    // linkedAuthId 미설정 = 비정상 (콜백이 lock 못한 채로 verify 도달). Step 1 로.
    if (!invitation.linkedAuthId) {
      redirect(`/partner/signup/${token}`);
    }

    // 현재 Kakao 세션이 최신 lock 과 다름 — 다른 탭이 같은 링크로 새 OAuth 한 경우 등.
    // 현재 세션을 signOut 하고 Step 1 으로 보내 새 OAuth 시작. 별도 에러 노출 안 함
    // (Kakao 계정 자체가 보안 게이트가 아니므로 사용자에겐 정상 흐름).
    if (invitation.linkedAuthId !== authUserId) {
      await supabase.auth.signOut();
      redirect(`/partner/signup/${token}`);
    }
  }

  const errorMessage = error ? (VERIFY_ERRORS[error] ?? null) : null;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        본인인증
      </h1>
      <p className="mt-3 text-sm text-[#4b4b4b]">
        {invitation.name} 님, 등록된 휴대폰 번호로 인증번호를 받아 가입을
        마무리해주세요.
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}

      <VerifyForm
        token={token}
        name={invitation.name}
        phone={invitation.phone}
      />
    </main>
  );
}
