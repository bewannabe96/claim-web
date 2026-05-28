import type { Metadata } from "next";

import { OnboardingFlow } from "./_components/onboarding-flow";

export const metadata: Metadata = {
  title: "v2 Mock · 온보딩",
  description:
    "v2 PRD §5.5 회원 가입 온보딩 — 카카오 OAuth 후 휴대폰 인증.",
};

/**
 * /v2-mock/onboarding — 카카오 OAuth 완료 후 휴대폰 인증 단계.
 *
 * 모달이 가지던 부담을 페이지로 옮김. 모달은 카카오 OAuth 한 hop 만 책임, 휴대폰
 * 인증 / 동의 / 완료 안내는 페이지 chrome 안에서 더 여유롭게.
 *
 * `?from=second_upload|pool_entry|provisional_cta` — 완료 후 어디로 돌아갈지
 * 결정에 활용. mock 단계는 단순 /v2-mock/compare 로.
 */
export default async function V2MockOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <OnboardingFlow from={from ?? null} />;
}
