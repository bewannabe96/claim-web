import { getPartnerInvitationByToken } from "@/features/partners/queries";

import { signUpWithKakao } from "./actions";
import { VerifyForm } from "./_components/verify-form";

const SIGNUP_ERRORS: Record<string, string> = {
  oauth_failed: "카카오 로그인에 실패했습니다. 다시 시도해주세요.",
  no_email: "카카오 계정의 이메일 제공 동의가 필요합니다.",
  phone_unverified:
    "본인인증을 먼저 완료해주세요. 잠시 후 자동으로 진행됩니다.",
  already_registered:
    "이 카카오 계정은 이미 다른 사용자와 연결되어 있습니다. 운영자에게 문의하세요.",
  signup_failed: "가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
};

/**
 * 설계사 신규 가입 페이지 — 어드민이 발급한 초청 token 으로만 진입.
 *
 * 2 단계:
 *   1. **본인인증** (PortOne) — invitation.phoneVerifiedAt 이 NULL 일 때.
 *      입력: 이름 + 주민번호 앞6+1 + 휴대폰. PortOne 본인인증 통과 시점에 검증된
 *      phone vs invitation.phone 매칭 → 매칭 시 phoneVerifiedAt 갱신.
 *      *PortOne 실 연동은 Phase B (별도 작업) — 현재는 placeholder UI.*
 *
 *   2. **Kakao 가입** — phoneVerifiedAt IS NOT NULL 인 상태.
 *      "카카오톡으로 가입" → Kakao OAuth → 콜백이 user/partner 트랜잭션 생성 +
 *      invitation 소비.
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

  const errorMessage = error ? SIGNUP_ERRORS[error] ?? null : null;
  const verified = !!invitation.phoneVerifiedAt;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        설계사 가입
      </h1>
      <p className="mt-3 text-sm text-[#4b4b4b]">
        {invitation.name} 님, 본인인증 후 카카오톡으로 가입을 완료해주세요.
      </p>

      {/* 진행 상태 — 2단계 */}
      <ol className="mt-6 flex items-center gap-2 text-xs">
        <StepBadge step={1} label="본인인증" active={!verified} done={verified} />
        <span className="text-[#afafaf]">→</span>
        <StepBadge step={2} label="카카오 가입" active={verified} done={false} />
      </ol>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}

      {verified ? (
        <KakaoStep token={token} />
      ) : (
        <VerifyForm
          token={token}
          name={invitation.name}
          phone={invitation.phone}
        />
      )}
    </main>
  );
}

/* ============================================================
 * Step 2 — Kakao OAuth 가입
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
        카카오톡으로 가입
      </button>
      <p className="mt-3 text-xs text-[#4b4b4b]">
        본인인증이 완료되었어요. 카카오 계정으로 로그인하면 가입이 마무리됩니다.
      </p>
    </form>
  );
}

/* ============================================================
 * helpers
 * ============================================================ */

function StepBadge({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const tone = done
    ? "bg-black text-white border-black"
    : active
      ? "bg-white text-black border-black"
      : "bg-[#fafafa] text-[#afafaf] border-[#efefef]";
  return (
    <li
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${tone}`}
    >
      <span className="font-bold">{step}</span>
      <span>{label}</span>
      {done && <span aria-hidden>✓</span>}
    </li>
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
