"use client";

import {
  Step1Wizard,
  type Step1SubmitOutcome,
} from "@/app/(marketing)/plan-request/new/_components/step1-wizard";

import { MOCK_PRICE_TIERS } from "../_lib/mock-price-tiers";

/* ============================================================
 * v2-mock 풀 수신 wizard — v2 PRD §4.3 의 [클레임 파트너로부터 받기] flow.
 *
 * v1 의 step1-wizard 를 `onSubmit` prop 형태로 일반화 (PRD §5.4) 한 후 그대로
 * 재사용. mock 의 책임:
 *   - priceTiers 정적 mock (queries 호출 금지)
 *   - onSubmit 은 어떤 server action 도 호출하지 않고 곧바로 dispatched 로 navigate
 *
 * v2 흐름 정착 (PRD §4.3): wizard 마지막 submit 직후 candidates 노출 → 가입자가
 * K명 선택 → dispatched. v1 의 #125 frontend auto-skip 정책은 풀 path 에서 부활됨
 * ("정책 변화 3 — candidates 화면 부활"). 회원 가입 onboarding 에서 이름/RRN/휴대폰/
 * 동의 모두 수집한 상태로 진입한다고 가정하므로 v1 의 confirm 단계는 통째로 빠짐.
 *
 * `showMatchingScreen={false}` — wizard 내부의 "맞춤 설계사를 찾고 있어요" 매칭 로딩
 * 화면을 끈다. v2 는 wizard 다음 화면이 candidates 선택이라 "찾는 중" 화면이 의미상
 * 중복이고, 후보 산출 자체도 candidates 페이지가 책임지는 게 더 자연스럽다.
 * ============================================================ */
async function mockSubmit(_fd: FormData): Promise<Step1SubmitOutcome> {
  return {
    ok: true,
    nextHref: "/v2-mock/plan-request/candidates",
  };
}

export default function V2MockNewRequestPage() {
  return (
    <Step1Wizard
      priceTiers={MOCK_PRICE_TIERS}
      onSubmit={mockSubmit}
      showMatchingScreen={false}
    />
  );
}
