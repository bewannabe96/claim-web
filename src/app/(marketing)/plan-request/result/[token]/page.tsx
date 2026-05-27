import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { buildAnalysisRenderer } from "@/features/plan-proposals/analysis";
import {
  getRawAnalysisReport,
  listPlanProposalCardsForRequest,
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
 *   - 1건+ → 본 흐름 (chip 탭으로 카드 전환)
 *
 * 데이터 흐름:
 *   token → plan_request → submitted assignments + proposals + partners
 *        ↓
 *   각 proposal.id → claim.plan_proposal_analysis_report (raw row + schemaVersion)
 *        ↓
 *   buildAnalysisRenderer(cards, rawReports, ...) →
 *     cardMetas (shell 용) + renderAnalysisBody (registry dispatch 클로저)
 *
 * 분석 미완료 / 미지원 버전 / parse 실패 등은 buildAnalysisRenderer 가 graceful
 * 처리 (해당 카드 본문만 placeholder, 다른 카드는 정상). 자세한 다버전 정책은
 * [docs/analysis-versioning.md](../../../../../../../docs/analysis-versioning.md).
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

  // 각 proposal 의 raw 분석 리포트 (버전 + body) — registry 가 카드별로 parse/adapt.
  const rawReports = await Promise.all(
    cards.map((card) => getRawAnalysisReport(card.proposal.id)),
  );

  const { cardMetas, renderAnalysisBody } = buildAnalysisRenderer({
    cards,
    rawReports,
    customerAge,
    scenarioPriority: settings.scenarioPriority,
  });

  // RematchingState 도 StatusScreen 기반 — 자체 <main> landmark 를 렌더하므로
  // page 의 <main> 밖, fragment 로만 감싸 반환 (중첩 <main> 회피).
  if (cardMetas.length === 0) {
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
        cards={cardMetas}
        selectedPartnerCount={req.selectedPartnerIds.length}
      >
        <ResultView
          resultToken={token}
          cards={cardMetas}
          renderAnalysisBody={renderAnalysisBody}
          resultRetentionDays={settings.resultRetentionDays}
        />
      </ResultPageShell>
    </main>
  );
}
