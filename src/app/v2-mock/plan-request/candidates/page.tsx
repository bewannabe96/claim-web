"use client";

import {
  CandidatesSelector,
  type Step2SubmitOutcome,
} from "@/app/(marketing)/plan-request/[id]/candidates/_components/candidates-selector";

import {
  MOCK_CANDIDATE_PARTNERS,
  MOCK_CANDIDATES_SUBTITLE,
  MOCK_SELECT_LIMIT,
} from "../_lib/mock-partner-cards";

/* ============================================================
 * v2-mock 풀 수신 candidates — wizard submit 직후 후보 5명 선택 화면.
 *
 * v1 의 `candidates-selector.tsx` 를 `onSubmit` prop 형태로 일반화 (PRD §5.4) 한
 * 후 그대로 재사용. v1 페이지는 #125 의 frontend auto-skip 모드로 selector 자체를
 * 렌더하지 않는 반면 v2 풀 path 는 PRD §4.3 "v1 → v2 정책 변화 3 — candidates
 * 화면 부활" 정착에 따라 selector 를 직접 노출.
 *
 * mock 책임:
 *   - 후보 5명 정적 mock (실 라우트는 step1 의 candidate 산출 + getPartnerCardsByIds)
 *   - selectLimit 정적 mock (실 라우트는 AppSettings.selectLimit)
 *   - subtitle 정적 mock (실 라우트는 req.step1 의 coverage / 직업 / 예산 derive)
 *   - onSubmit 은 어떤 server action 도 호출하지 않고 곧바로 dispatched 로 navigate
 *
 * 사용자 흐름: 후보 카드 검토 → K명 선택 (최대 selectLimit) → "N명에게 제안서 받기"
 * → dispatched ("요청서가 전달됐어요").
 * ============================================================ */
async function mockSubmit(
  _partnerIds: string[],
): Promise<Step2SubmitOutcome> {
  return {
    ok: true,
    nextHref: "/v2-mock/plan-request/dispatched",
  };
}

export default function V2MockCandidatesPage() {
  return (
    <CandidatesSelector
      candidates={MOCK_CANDIDATE_PARTNERS}
      selectLimit={MOCK_SELECT_LIMIT}
      subtitle={MOCK_CANDIDATES_SUBTITLE}
      onSubmit={mockSubmit}
    />
  );
}
