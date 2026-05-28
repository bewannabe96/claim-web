import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import { submitStep2 } from "@/features/plan-requests/actions";
import { pickAssignedPartners } from "@/features/plan-requests/auto-assignment";
import { getRequestById } from "@/features/plan-requests/queries";
import { getSettings } from "@/server/settings";

// [원본] 롤백 시 복원할 import — CandidatesSelector subtitle 빌드 + onSubmit outcome 타입:
//   import {
//     FOCUSED_CONCERN_LABEL,
//     type CoverageRequest,
//   } from "@/features/plan-requests/schema";
//   import {
//     CandidatesSelector,
//     type Step2SubmitOutcome,
//   } from "./_components/candidates-selector";

/* ============================================================
 * [임시] 설계사 선택 단계 frontend skip — 후보 자동배정 후 즉시 다음 단계로 통과.
 *
 * 원래 이 라우트는 가입자가 후보 카드 중 직접 selectLimit 명을 골랐다 (PR #122 에서
 * 6785b92d 의 자동배정을 한 번 롤백해 선택 UI 로 복원했던 버전). 운영 판단으로
 * 선택 단계를 다시 frontend 에서 건너뛰되, 이번엔 카드 노출까지 생략하고 페이지
 * 진입 즉시 server 에서 submitStep2 를 호출해 confirm 단계로 흘러보낸다.
 *
 * 후보 중 selectLimit 명은 요청서 id 기준으로 결정적으로 추려(pickAssignedPartners)
 * 자동배정. 같은 요청서면 새로고침/뒤로가기로 재진입해도 동일 조합 — 6785b92d 와
 * 동일한 seed 정책.
 *
 * 백엔드(submitStep2 / schema / DB / candidatePartnerIds) 무변경. submitStep2 가
 * 내부에서 /plan-request/<id>/confirm 으로 redirect 하므로 이 컴포넌트는 정상
 * 흐름에서 아무것도 렌더하지 않는다.
 *
 * ============================================================
 * ▶ 롤백 절차 (선택 단계 UI 복원, 인-파일 복원)
 * ============================================================
 *
 * git history / revert 없이도 이 파일 안에 [원본] / [임시] 주석 블록이 정확히
 * 짝지어 보존돼 있어 그대로 복원 가능. _components/candidates-selector.tsx 는
 * 이번 변경에서 손대지 않았으므로 page.tsx 안에서만 작업하면 된다.
 *
 * 1. [원본] 블록 4곳을 활성화 (주석 해제):
 *    A. 파일 상단 [원본] import 블록
 *    B. metadata 위 [원본] metadata
 *    C. CandidatesPage 안의 [원본] return (subtitle 계산 + CandidatesSelector)
 *    D. 파일 하단 [원본] coverageBrief / formatBudget 헬퍼
 *
 * 2. [임시] 표시 영역 제거:
 *    - 상단 submitStep2 / pickAssignedPartners import (auto-assignment.ts 모듈 자체는
 *      챗봇 변형 v4 의 actions.autoSelectAndAdvance 가 사용하므로 그대로 유지)
 *    - 현재 metadata ("설계사 배정 중")
 *    - CandidatesPage 함수 안 pickAssignedPartners(...) + FormData + submitStep2
 *      직접 호출 + console.error fallback + notFound() 한 덩어리
 *
 * 3. 검증:
 *    - `pnpm tsc --noEmit` 0 errors / `pnpm lint` clean
 *    - /plan-request/<id>/candidates 진입 시 카드 + 선택 토글 노출
 *    - 카드 선택 후 CTA → /plan-request/<id>/confirm 이동
 * ============================================================ */

// [원본] 롤백 시 복원할 metadata:
//   export const metadata: Metadata = {
//     title: "설계사 선택",
//     description: "추천된 설계사 카드 중 제안서를 받을 분들을 선택해주세요.",
//   };
export const metadata: Metadata = {
  title: "설계사 배정 중",
  description: "요청서에 맞춰 설계사를 배정하고 있어요.",
};

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req || req.status !== "selecting") notFound();

  const candidates = await getPartnerCardsByIds(req.candidatePartnerIds);
  const { selectLimit } = await getSettings();

  // [원본] 롤백 시 복원 — 후보 전체 + selectLimit 을 그대로 내려 선택 UI 노출:
  //
  //   // 추천 근거가 된 매칭 신호 3개 — coverage · 직업 · 예산. coverage 를 맨 앞에
  //   // 두어 "이 보장을 봐줄 수 있는 설계사" 라는 매칭 의미를 가입자가 인지하게 함.
  //   const subtitle = [
  //     coverageBrief(req.step1.coverage),
  //     req.step1.occupation,
  //     formatBudget(req.step1.monthlyBudgetMin, req.step1.monthlyBudgetMax),
  //   ]
  //     .filter(Boolean)
  //     .join(" · ");
  //
  //   // PRD v2 §5.4 의 selector refactor 후 시그니처 — onSubmit prop 필수, requestId
  //   // 는 selector 외부로 빠짐. v2 풀 path 와 동일 컴포넌트라 호출 형태도 일관.
  //   async function handleSelectSubmit(
  //     partnerIds: string[],
  //   ): Promise<Step2SubmitOutcome> {
  //     "use server";
  //     const fd = new FormData();
  //     for (const pid of partnerIds) fd.append("partnerIds", pid);
  //     const result = await submitStep2(id, undefined, fd);
  //     // 정상 흐름: submitStep2 안에서 /plan-request/${id}/confirm 으로 NEXT_REDIRECT
  //     // throw → 여기 도달 안 함. 도달했다면 검증 실패.
  //     return {
  //       ok: false,
  //       errorMessage:
  //         result?.errors?._form?.[0] ??
  //         result?.errors?.partnerIds?.[0] ??
  //         "선택 처리에 실패했습니다. 다시 시도해주세요.",
  //     };
  //   }
  //
  //   return (
  //     <CandidatesSelector
  //       candidates={candidates}
  //       selectLimit={selectLimit}
  //       subtitle={subtitle}
  //       onSubmit={handleSelectSubmit}
  //     />
  //   );

  // [임시] 가입자가 직접 고르는 대신 요청서 id 기준 결정적 추출 — 같은 요청서면
  // 새로고침/뒤로가기로 재진입해도 동일 조합. candidates.length >= selectLimit 은
  // admin settings 의 candidateCount >= selectLimit 불변식 + step1 의 후보 산출이
  // 보장하므로 별도 가드 불필요.
  const picked = pickAssignedPartners(candidates, selectLimit, id);

  // [임시] submitStep2 의 (requestId, _prev, formData) 시그니처 그대로 호출.
  //   - _prev: Step2State 는 undefined 허용 — 함수 내부에서 미사용.
  //   - 정상 흐름이면 함수 안에서 redirect(`/plan-request/${id}/confirm`) 가
  //     NEXT_REDIRECT throw → 이 줄 이후엔 도달하지 않는다.
  //   - throw 를 catch 하면 redirect 가 끊기므로 try/catch 금지.
  const formData = new FormData();
  for (const p of picked) {
    formData.append("partnerIds", p.id);
  }
  const result = await submitStep2(id, undefined, formData);

  // [임시] 여기 도달 = submitStep2 검증 실패. 정상 흐름에선 candidatePartnerIds 에서
  // 그대로 뽑아 넘기므로 partnerId 매칭 / selectLimit 모두 통과한다. 도달했다면
  // 데이터 정합성 문제 (예: candidate row 가 사라짐). notFound 로 폴백.
  console.error("[candidates] submitStep2 did not redirect", {
    requestId: id,
    state: result,
  });
  notFound();
}

/* ============================================================
 * [임시] 자동배정 헬퍼 — features/plan-requests/auto-assignment.ts 로 추출됨.
 *   이전엔 이 파일 안에 private 으로 정의돼 있었으나, 챗봇 변형 v4 의
 *   autoSelectAndAdvance 액션이 동일 결정성을 공유해야 해서 모듈 승격.
 *   롤백 시에도 import 라인만 제거하면 되며, auto-assignment.ts 는 다른
 *   사용처(actions.ts)가 있으므로 모듈 자체는 유지.
 * ============================================================ */

/* ============================================================
 * [원본] 롤백 시 복원 — CandidatesSelector subtitle 빌드용 헬퍼.
 * ============================================================
 *
 *   function coverageBrief(coverage: CoverageRequest): string {
 *     if (coverage.intent === "broad") return "종합 검토";
 *     return coverage.concerns.map((id) => FOCUSED_CONCERN_LABEL[id]).join(", ");
 *   }
 *
 *   function formatBudget(min: number, max: number): string {
 *     const fmt = (n: number) =>
 *       n >= 10000 ? `${Math.floor(n / 10000)}만` : `${n.toLocaleString("ko-KR")}원`;
 *     return `월 ${fmt(min)}~${fmt(max)}`;
 *   }
 * ============================================================ */
