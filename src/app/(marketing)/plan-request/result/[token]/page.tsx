import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { adaptPlanProposal } from "@/features/plan-proposals/adapt-proposal";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import {
  getAnalysisReport,
  listPlanProposalCardsForRequest,
  type PlanProposalCard,
} from "@/features/plan-proposals/queries";
import { ResultPageShell } from "@/features/plan-proposals/ui/result-page-shell";
import { ResultView } from "@/features/plan-proposals/ui/result-view";
import { getRequestByResultToken } from "@/features/plan-requests/queries";
import { computeAge } from "@/lib/age";
import { nowMs } from "@/lib/wall-clock";
import { getSettings } from "@/server/settings";

import { ExpiredState } from "./_components/expired-state";
import { RematchingState } from "./_components/rematching-state";
import { ResultViewedMarker } from "./_components/result-viewed-marker";

const MS_PER_DAY = 86_400_000;

export const metadata: Metadata = {
  title: "제안서 결과",
  description:
    "도착한 가입설계 제안서를 AI 비교 분석 결과와 함께 한눈에 확인하세요.",
};

/**
 * 결과 열람 — 알림톡 일회용 토큰으로 진입.
 *
 * 분기:
 *   - 0건  → RematchingState (재매칭 안내)
 *   - 1건  → 단일 view (chip 탭 없음)
 *   - 2+건 → 본 흐름 (chip 탭으로 제안서 전환)
 *
 * 데이터 흐름:
 *   token → plan_request → submitted assignments + proposals + partners
 *        ↓
 *   각 proposal.id → claim.plan_proposal_analysis_report (1:1, Prisma 모델)
 *        ↓
 *   adaptPlanProposal(card, report) → 결과 페이지 컴포넌트가 기대하는 shape
 *
 * 분석 미완료 proposal 은 report=null 로 들어가서 카드가 "분석 중" placeholder
 * 로 렌더 (adapt-proposal 의 makeFallback + analyzed=false).
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // dynamic 인디케이터 — nowMs() 가 prerender 단계에서 실행되지 않도록.
  await cookies();

  const { token } = await params;
  const req = await getRequestByResultToken(token);
  if (!req) notFound();

  const settings = await getSettings();

  // dispatchedAt + retentionDays 경과 시 만료. finalize 가 항상 dispatchedAt 을
  // 채우므로 undefined 인 경우는 이론상 없으나, 보수적으로 만료 처리 스킵.
  const isExpired =
    req.dispatchedAt !== undefined &&
    nowMs() - new Date(req.dispatchedAt).getTime() >
      settings.resultRetentionDays * MS_PER_DAY;

  // ExpiredState 는 StatusScreen 기반 — 자체 <main> landmark + BrandMark 를 렌더.
  // page 의 <main> 으로 감싸면 <main> 중첩 (HTML 위반) — fragment 로만 감싸
  // 열람 마킹 (ResultViewedMarker) 만 동봉한다.
  if (isExpired) {
    return (
      <>
        <ResultViewedMarker token={token} />
        <ExpiredState />
      </>
    );
  }

  // 실 데이터 — submitted proposal + 작성 설계사 카드.
  const cards = await listPlanProposalCardsForRequest(req.id);

  // 각 proposal 의 분석 리포트 — proposal.id 1:1. 분석 미완료면 null (placeholder UI).
  const reportEntries = await Promise.all(
    cards.map(async (card) => {
      const report = await loadReportForCard(card);
      return [card.proposal.id, report] as const;
    }),
  );
  const reportsById: Record<string, AnalysisReportV5> = Object.fromEntries(
    reportEntries.filter(
      (e): e is readonly [string, AnalysisReportV5] => e[1] !== null,
    ),
  );

  // 가입자 만 나이 (KST 기준). result_token 발급 = finalize 통과 = birthDate 채워짐
  // 이 invariant. step3 / birthDate 가 비어있다면 데이터 무결성 오류.
  const birthDate = req.step3?.birthDate;
  const customerAge = birthDate
    ? computeAge(birthDate, new Date(nowMs()))
    : null;
  if (customerAge == null) {
    throw new Error(
      `plan_request ${req.id} has resultToken but missing/invalid birthDate`,
    );
  }

  // 실 데이터 → 결과 페이지 컴포넌트가 기대하는 PlanProposalData shape 으로 변환.
  const proposals = cards.map((card) =>
    adaptPlanProposal(card, reportsById[card.proposal.id] ?? null, customerAge),
  );

  // RematchingState 도 StatusScreen 기반 — 자체 <main> landmark 를 렌더하므로
  // page 의 <main> 밖, fragment 로만 감싸 반환 (중첩 <main> 회피).
  if (proposals.length === 0) {
    return (
      <>
        <ResultViewedMarker token={token} />
        <RematchingState />
      </>
    );
  }

  return (
    <main className="flex flex-col flex-1 bg-white">
      <ResultViewedMarker token={token} />
      <ResultPageShell
        proposals={proposals}
        selectedPartnerCount={req.selectedPartnerIds.length}
      >
        <ResultView
          resultToken={token}
          proposals={proposals}
          reportsById={reportsById}
          scenarioPriority={settings.scenarioPriority}
          resultRetentionDays={settings.resultRetentionDays}
        />
      </ResultPageShell>
    </main>
  );
}

/**
 * 한 proposal card 의 분석 리포트 lookup. proposal.id 1:1 join.
 * 리포트가 아직 생성되지 않았으면 (웹훅 콜백 전) `getAnalysisReport` 가 null 반환
 * — UI 는 빈 상태로 graceful 렌더.
 */
async function loadReportForCard(
  card: PlanProposalCard,
): Promise<AnalysisReportV5 | null> {
  return getAnalysisReport(card.proposal.id);
}
