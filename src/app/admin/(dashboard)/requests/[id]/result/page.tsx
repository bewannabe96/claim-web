import { notFound } from "next/navigation";

import { adaptPlanProposal } from "@/features/plan-proposals/adapt-proposal";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import {
  getAnalysisReport,
  listPlanProposalCardsForRequest,
  type PlanProposalCard,
} from "@/features/plan-proposals/queries";
import { ProposalResultView } from "@/features/plan-proposals/ui/proposal-result-view";
import { getRequestById } from "@/features/plan-requests/queries";
import { RequestStatusBadge } from "@/features/plan-requests/ui/status-badge";
import { computeAge } from "@/lib/age";
import { nowMs } from "@/lib/wall-clock";
import { getSettings } from "@/server/settings";

import { formatDateTime } from "../../../_lib/format";
import {
  BackLink,
  Card,
  CardHeader,
  Empty,
  PageHeader,
} from "../../../_components/page-shell";

/**
 * 어드민 결과 페이지 (audit) — 가입자 결과 페이지 (`/plan-request/result/[token]`)
 * 와 같은 데이터를 같은 공용 view (`features/plan-proposals/ui/proposal-result-view`)
 * 로 렌더하되, 어드민 chrome (back link + 메타데이터 헤더) 만 합성.
 *
 * 가입자 페이지와의 차이:
 *   - **만료 무관** — `resultRetentionDays` 경과해도 그대로 노출. audit/분쟁 대응 목적.
 *   - **조회 마커 없음** — `ResultViewedMarker` 미렌더 → `plan_request.resultViewedAt` 오염 X.
 *   - **상담 진행 CTA / 보관기간 푸터 없음** — `bottomActionFor` / `footer` slot 미전달.
 *   - **메타데이터 헤더** — 송부/마감/열람 시각 + status badge + resultToken 노출.
 *
 * 데이터 흐름 (가입자 페이지와 동일):
 *   id → plan_request (admin id로 조회) → submitted assignments + proposals + partners
 *      ↓
 *   proposal.id → claim.plan_proposal_analysis_report (1:1)
 *      ↓
 *   adaptPlanProposal(card, report, customerAge) → PlanProposalData shape
 *
 * 결과 페이지 토큰 (`resultToken`) 발급 전 단계 (송부 전) 의 요청은 노출할 본문이 없어
 * `Empty` 카드로 안내.
 */
export default async function AdminResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequestById(id);
  if (!request) notFound();

  // 가입자 결과 페이지와 동일한 settings 를 전달 — chip 초기 순서가 어드민
  // priority 정책을 따라가야 "가입자가 보는 그대로 검수" 라는 audit 의도와 정합.
  const settings = await getSettings();

  const headerDescription = [
    `생성 ${formatDateTime(request.createdAt)}`,
    request.dispatchedAt && `송부 ${formatDateTime(request.dispatchedAt)}`,
    request.deadlineAt && `마감 ${formatDateTime(request.deadlineAt)}`,
    request.resultViewedAt && `열람 ${formatDateTime(request.resultViewedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // resultToken 발급 전 (송부/마감 이전) — 본문에 보여줄 분석 결과 자체가 없음.
  if (!request.resultToken) {
    return (
      <div className="flex flex-col gap-6">
        <ShellHeader id={id} status={request.status} description={headerDescription} />
        <Card>
          <CardHeader title="결과 본문" />
          <Empty>아직 결과가 생성되지 않은 요청이에요.</Empty>
        </Card>
      </div>
    );
  }

  const cards = await listPlanProposalCardsForRequest(request.id);

  // 가입자 페이지와 동일 — 각 proposal 의 분석 리포트 lookup. 분석 미완료면 null.
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

  // resultToken 발급 = finalize 통과 = birthDate 채워짐. 아니면 데이터 무결성 오류.
  const birthDate = request.step3?.birthDate;
  const customerAge = birthDate
    ? computeAge(birthDate, new Date(nowMs()))
    : null;
  if (customerAge == null) {
    throw new Error(
      `plan_request ${request.id} has resultToken but missing/invalid birthDate`,
    );
  }

  const proposals = cards.map((card) =>
    adaptPlanProposal(card, reportsById[card.proposal.id] ?? null, customerAge),
  );

  // 분석 진행 카운트는 정상 완료 + skip 처리 두 케이스를 합산 (가입자 페이지와 동일).
  const analyzedCount = proposals.filter(
    (p) => p.analyzed || p.analysisSkipped,
  ).length;
  const allAnalyzed = analyzedCount === proposals.length;

  return (
    <div className="flex flex-col gap-6">
      <ShellHeader id={id} status={request.status} description={headerDescription} />

      {/* 메타 카드 — resultToken / 분석 진행률 / 본인 정보 (가입자 POV 진입 URL 포함). */}
      <Card>
        <CardHeader
          title="요청 메타"
          meta={
            <span className="tabular-nums">
              분석{" "}
              <span className="font-semibold text-black">{analyzedCount}</span>
              <span className="text-[#afafaf]">/{proposals.length}</span>
              {allAnalyzed && (
                <span className="ml-2 text-[#4b4b4b]">(완료)</span>
              )}
            </span>
          }
        />
        <div className="flex flex-col gap-3">
          <a
            href={`/plan-request/result/${request.resultToken}`}
            target="_blank"
            rel="noopener noreferrer"
            title="새 탭에서 열기 — 가입자 POV (보관기간 만료 시 ExpiredState 노출)"
            className="block px-3 py-2 rounded-lg bg-[#fafafa] text-xs font-mono text-black break-all hover:bg-[#efefef] transition-colors"
          >
            /plan-request/result/{request.resultToken}
          </a>
          {request.step3 && (
            <p className="text-xs text-[#4b4b4b]">
              <span className="text-[#afafaf]">본인</span>{" "}
              <span className="font-medium text-black">{request.step3.name}</span>{" "}
              <span className="text-[#afafaf]">·</span>{" "}
              <span className="text-black">만 {customerAge}세</span>
            </p>
          )}
        </div>
      </Card>

      {/* 분석 본문 — 가입자 페이지와 같은 ProposalResultView. bottomAction / footer slot
          미전달이라 상담 CTA / 보관기간 문구 없음. 만료 여부와 무관하게 데이터 그대로 노출. */}
      {proposals.length === 0 ? (
        <Card>
          <CardHeader title="결과 본문" />
          <Empty>아직 제출된 제안서가 없어요.</Empty>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ProposalResultView
            proposals={proposals}
            reports={Object.values(reportsById)}
            scenarioPriority={settings.scenarioPriority}
          />
        </Card>
      )}
    </div>
  );
}

function ShellHeader({
  id,
  status,
  description,
}: {
  id: string;
  status: Parameters<typeof RequestStatusBadge>[0]["status"];
  description: string;
}) {
  return (
    <div>
      <BackLink href={`/admin/requests/${id}`}>요청 상세</BackLink>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3 tabular-nums">
            {id}
            <RequestStatusBadge status={status} />
          </span>
        }
        description={description}
      />
    </div>
  );
}

/**
 * 한 proposal card 의 분석 리포트 lookup. proposal.id 1:1 join.
 * 가입자 페이지와 동일 — 리포트 미생성 시 `getAnalysisReport` 가 null 반환,
 * adaptPlanProposal 의 makeFallback 으로 placeholder 카드 렌더.
 */
async function loadReportForCard(
  card: PlanProposalCard,
): Promise<AnalysisReportV5 | null> {
  return getAnalysisReport(card.proposal.id);
}
