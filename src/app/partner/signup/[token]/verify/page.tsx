import { redirect } from "next/navigation";

import { getPartnerInvitationByToken } from "@/features/partners/queries";
import { getSupabaseServerClient } from "@/server/supabase";

import { StepBadge } from "../_components/step-badge";
import { VerifyForm } from "./_components/verify-form";

const VERIFY_ERRORS: Record<string, string> = {
  link_conflict:
    "이 가입 링크는 다른 카카오 계정과 연결되어 있어요. 운영자에게 새 가입 링크를 요청해주세요.",
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
 *      세션 없거나 다른 계정이면 Step 1 (Kakao 가입) 로 redirect.
 *
 * 통과 시 PortOne placeholder 본인인증 폼 노출. 폼이 verifyPartnerSignupOtp 액션
 * 호출하면 가입 트랜잭션이 일어남 (user + partner INSERT + invitation 소비).
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

  const invitation = await getPartnerInvitationByToken(token);
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

  const supabase = await getSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // 세션 없으면 카카오 가입 단계로 redirect (그 페이지가 Step 1 시작 버튼 노출).
  if (!authUser) {
    redirect(`/partner/signup/${token}`);
  }

  // linkedAuthId 미설정 = 비정상 (콜백이 lock 못한 채로 verify 도달). Step 1 로.
  if (!invitation.linkedAuthId) {
    redirect(`/partner/signup/${token}`);
  }

  // 다른 카카오 계정이 lock 한 invitation 에 다른 사람이 진입 → signOut + 안내.
  if (invitation.linkedAuthId !== authUser.id) {
    await supabase.auth.signOut();
    redirect(`/partner/signup/${token}?error=link_conflict`);
  }

  const errorMessage = error ? (VERIFY_ERRORS[error] ?? null) : null;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        본인인증
      </h1>
      <p className="mt-3 text-sm text-[#4b4b4b]">
        {invitation.name} 님, 본인인증을 완료하면 설계사 가입이 마무리됩니다.
      </p>

      {/* 진행 상태 — 2단계 (Kakao → 본인인증) */}
      <ol className="mt-6 flex items-center gap-2 text-xs">
        <StepBadge step={1} label="카카오 가입" active={false} done />
        <span className="text-[#afafaf]">→</span>
        <StepBadge step={2} label="본인인증" active done={false} />
      </ol>

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
