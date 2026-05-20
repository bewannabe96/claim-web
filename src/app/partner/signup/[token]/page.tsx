import { redirect } from "next/navigation";

import { getPartnerSignupInvitationByToken } from "@/features/partners/queries";
import { getOptionalAdminSession } from "@/server/dal";

import { signUpWithKakao } from "./actions";

const SIGNUP_ERRORS: Record<string, string> = {
  oauth_failed: "카카오 로그인에 실패했습니다. 다시 시도해주세요.",
  no_email: "카카오 계정의 이메일 제공 동의가 필요합니다.",
  already_registered:
    "이 카카오 계정은 이미 다른 사용자와 연결되어 있습니다. 운영자에게 문의하세요.",
  signup_failed: "가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
  admin_required:
    "어드민 본인 설계사 등록은 어드민 계정으로 로그인한 상태에서만 가능합니다.",
};

/**
 * 설계사 신규 가입 페이지 — 어드민이 발급한 초청 token 으로만 진입.
 *
 * 2 단계 (순서: Kakao 먼저 → 본인인증 나중):
 *
 *   1. **카카오 가입** — "카카오톡으로 시작" → Kakao OAuth. 매 진입마다 새로 인증.
 *      콜백이 invitation.linkedAuthId 에 Kakao auth.users.id 를 **무조건 덮어쓰고**
 *      (이전 lock 무시) `/verify` 로 forward. 다른 카카오 계정으로 재시도하면 가장
 *      최근 OAuth 계정으로 진행됨 — 진짜 인증은 휴대폰 OTP 가 책임.
 *
 *   2. **본인인증** — `/verify` 라우트. Kakao 세션 + 현재 linkedAuthId 매칭 검증 후
 *      휴대폰 OTP 폼 노출 (알리고 SMS + Redis). 통과 시 단일 트랜잭션으로 user +
 *      partner + invitation 소비. SMS 발송 대상이 invitation.phone 으로 고정되어
 *      횡령 방지 게이트가 됨.
 */
export default async function PartnerSignupPage({
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

  // 어드민 본인 겸직 흐름 — Kakao OAuth 우회. 같은 브라우저의 admin 세션이
  // 가입 트랜잭션의 인증 게이트. admin 세션 없으면 admin 로그인으로 보냄.
  if (invitation.existingUserId) {
    const adminSession = await getOptionalAdminSession();
    if (!adminSession || adminSession.user.id !== invitation.existingUserId) {
      redirect(
        `/admin/login?next=${encodeURIComponent(`/partner/signup/${token}`)}`,
      );
    }
    redirect(`/partner/signup/${token}/verify`);
  }

  // /verify 로 자동 redirect 하지 않음 — 매 진입마다 새 Kakao OAuth 강제.
  // 본인인증 미완료 상태로 이탈했다가 재진입한 경우에도 항상 Step 1 부터.

  const errorMessage = error ? (SIGNUP_ERRORS[error] ?? null) : null;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        설계사 가입
      </h1>
      <p className="mt-3 text-sm text-[#4b4b4b]">
        {invitation.name} 님, 카카오톡 가입 후 본인인증으로 가입을 완료해주세요.
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}

      <KakaoStep token={token} />
    </main>
  );
}

/* ============================================================
 * Step 1 — Kakao OAuth 가입 시작
 * ============================================================ */

function KakaoStep({ token }: { token: string }) {
  return (
    <form action={signUpWithKakao} className="mt-8">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="flex w-full h-12 items-center justify-center gap-2 rounded-full bg-[#FEE500] text-sm font-medium text-[#191600] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <KakaoIcon className="h-5 w-5" />
        카카오톡으로 시작
      </button>
      <p className="mt-3 text-xs text-[#4b4b4b]">
        카카오 계정으로 로그인한 뒤, 본인인증을 진행하면 가입이 마무리됩니다.
      </p>
    </form>
  );
}

function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 3C6.477 3 2 6.477 2 10.77c0 2.78 1.86 5.22 4.66 6.6-.2.7-.72 2.62-.82 3.03-.13.5.18.5.38.36.16-.11 2.5-1.7 3.51-2.39.74.11 1.5.17 2.27.17 5.523 0 10-3.477 10-7.77S17.523 3 12 3z" />
    </svg>
  );
}
