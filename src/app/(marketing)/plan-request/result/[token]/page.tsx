import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { adaptPlanProposal } from "@/features/plan-proposals/adapt-proposal";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import {
  getAnalysisReport,
  listPlanProposalCardsForRequest,
  type PlanProposalCard,
} from "@/features/plan-proposals/queries";
import { getRequestByResultToken } from "@/features/plan-requests/queries";
import { computeAge } from "@/lib/age";
import { nowMs } from "@/lib/wall-clock";
import { getSettings } from "@/server/settings";

import { ExpiredState } from "./_components/expired-state";
import { RematchingState } from "./_components/rematching-state";
import { ResultView } from "./_components/result-view";
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

  // 분석 진행 현황 — 분석 안 된 proposal 이 있으면 progress 배지, 모두 완료면 "결과 준비됨".
  // 이 지점부터 proposals.length > 0 보장 (위 early return).
  // skip 처리된 제안서는 더 이상 진행되지 않으므로 "분석 완료" 와 동급으로 묶어
  // 진행률에 포함 — 그렇지 않으면 영원히 "X/N 진행 중" 으로 남는다.
  const analyzedCount = proposals.filter(
    (p) => p.analyzed || p.analysisSkipped,
  ).length;
  const allAnalyzed = analyzedCount === proposals.length;

  return (
    <main className="flex flex-col flex-1 bg-white">
      <ResultViewedMarker token={token} />
      <div className="px-6 pt-10">
        <BrandMark />
        <header className="mt-6 flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
            제안서{" "}
            <span className="text-black">{proposals.length}건</span>
            이 도착했어요
          </h1>
          {req.selectedPartnerIds.length > proposals.length && (
            <p className="text-sm text-[#4b4b4b]">
              선택하신 {req.selectedPartnerIds.length}명 중{" "}
              <span className="font-semibold text-black">
                {proposals.length}명
              </span>
              이 제안서를 보내주셨어요
            </p>
          )}
          <AnalysisStatusBadge
            analyzed={analyzedCount}
            total={proposals.length}
            allDone={allAnalyzed}
          />
        </header>
      </div>

      <ResultView
        resultToken={token}
        proposals={proposals}
        reportsById={reportsById}
        scenarioPriority={settings.scenarioPriority}
        resultRetentionDays={settings.resultRetentionDays}
      />
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

/**
 * 분석 진행 상태 배지 — 헤더 아래 작은 inline.
 *   - 모두 완료: 검정 dot + "결과 준비됨"
 *   - 진행 중:   pulse dot + "분석 진행 중 X/N 완료" + "새로고침 안내"
 */
function AnalysisStatusBadge({
  analyzed,
  total,
  allDone,
}: {
  analyzed: number;
  total: number;
  allDone: boolean;
}) {
  if (allDone) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-[#4b4b4b]">
        <span className="w-1.5 h-1.5 rounded-full bg-black" aria-hidden />
        결과 준비됨
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-[#4b4b4b]">
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#4b4b4b] animate-pulse"
        aria-hidden
      />
      분석 진행 중 · {analyzed}/{total} 완료 (새로고침 시 갱신)
    </div>
  );
}
