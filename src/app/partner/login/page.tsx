import { redirect } from "next/navigation";

import { getOptionalPartnerSession } from "@/server/dal";

import { signInWithKakao } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "카카오 로그인에 실패했습니다. 다시 시도해주세요.",
  no_code: "로그인 응답이 잘못되었습니다. 다시 시도해주세요.",
  no_email: "카카오 계정의 이메일 제공 동의가 필요합니다.",
  not_registered: "등록된 설계사 계정이 아닙니다.",
};

/**
 * 설계사 로그인 — 카카오톡 OAuth 전용.
 *
 * 흐름:
 *   1. "카카오톡으로 로그인" 클릭 → signInWithKakao server action
 *   2. Supabase signInWithOAuth → Kakao 인증 페이지로 redirect
 *   3. Kakao 인증 완료 → /api/auth/callback?code=… 로 redirect
 *   4. callback 라우트가 code → session 교환 + partner 화이트리스트 검증
 *   5. 성공: /partner, 실패: /partner/login?error=…
 */
export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getOptionalPartnerSession();
  if (session) redirect("/partner");

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
        설계사 로그인
      </h1>
      <p className="mt-3 text-sm text-[#4b4b4b]">
        카카오톡 계정으로 빠르게 시작하세요.
      </p>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}

      <form action={signInWithKakao} className="mt-8">
        <button
          type="submit"
          className="flex w-full h-12 items-center justify-center gap-2 rounded-full bg-[#FEE500] text-sm font-medium text-[#191600] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <KakaoIcon className="h-5 w-5" />
          카카오톡으로 로그인
        </button>
      </form>
    </main>
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
