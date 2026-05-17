import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import type { AnalysisReportV4 } from "@/features/proposals/analysis-schema";
import {
  getAnalysisReport,
  listProposalCardsForRequest,
  type ProposalCard,
} from "@/features/proposals/queries";
import { getRequestByResultToken } from "@/features/requests/queries";
import { getSettings } from "@/server/settings";

import { RematchingState } from "./_components/rematching-state";
import { ResultView } from "./_components/result-view";
import { adaptProposal } from "./_lib/adapt-proposal";

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
 *   각 proposal 의 pdfHash → eightytwo_judge.proposal_analysis_reports
 *        ↓
 *   adaptProposal(card, report) → 결과 페이지 컴포넌트가 기대하는 shape
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const req = await getRequestByResultToken(token);
  if (!req) notFound();

  // 실 데이터 — submitted proposal + 작성 설계사 카드.
  const cards = await listProposalCardsForRequest(req.id);

  // 각 proposal 의 분석 리포트(v4) — pdfHash 로 정확 매칭. hash 없으면 null.
  // 우선순위 설정은 admin → app_settings.
  const [settings, reportEntries] = await Promise.all([
    getSettings(),
    Promise.all(
      cards.map(async (card) => {
        const report = await loadReportForCard(card);
        return [card.proposal.id, report] as const;
      }),
    ),
  ]);
  const reportsById: Record<string, AnalysisReportV4> = Object.fromEntries(
    reportEntries.filter(
      (e): e is readonly [string, AnalysisReportV4] => e[1] !== null,
    ),
  );

  // 실 데이터 → 결과 페이지 컴포넌트가 기대하는 ProposalData shape 으로 변환.
  const proposals = cards.map((card) =>
    adaptProposal(card, reportsById[card.proposal.id] ?? null),
  );

  return (
    <main className="flex flex-col flex-1 bg-white">
      <div className="px-6 pt-10">
        <BrandMark />
        <header className="mt-6 flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
            제안서{" "}
            <span className="text-black">{proposals.length}건</span>
            이 도착했어요
          </h1>
          {req.selectedPartnerIds.length > proposals.length &&
            proposals.length > 0 && (
              <p className="text-sm text-[#4b4b4b]">
                선택하신 {req.selectedPartnerIds.length}명 중{" "}
                <span className="font-semibold text-black">
                  {proposals.length}명
                </span>
                이 제안서를 보내주셨어요
              </p>
            )}
        </header>
      </div>

      {proposals.length === 0 ? (
        <RematchingState />
      ) : (
        <ResultView
          proposals={proposals}
          reportsById={reportsById}
          scenarioPriority={settings.scenarioPriority}
        />
      )}
    </main>
  );
}

/**
 * 한 proposal card 의 분석 리포트 lookup. pdfHash 있어야 매칭. 없으면 null.
 * (이전엔 s3_key 데모 fallback 이 있었으나 pdfHash 컬럼 도입 후 hash 정식 매칭만 사용.)
 */
async function loadReportForCard(
  card: ProposalCard,
): Promise<AnalysisReportV4 | null> {
  const hash = card.proposal.pdfHash;
  if (!hash) return null;
  return getAnalysisReport(hash);
}
