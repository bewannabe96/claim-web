import { notFound } from "next/navigation";

import { buildAnalysisRenderer } from "@/features/plan-proposals/analysis";
import {
  getRawAnalysisReport,
  listPlanProposalCardsForRequest,
} from "@/features/plan-proposals/queries";
import { PreviewResultView } from "@/features/plan-proposals/ui/preview-result-view";
import { ResultPageShell } from "@/features/plan-proposals/ui/result-page-shell";
import { getRequestById } from "@/features/plan-requests/queries";
import { RequestStatusBadge } from "@/features/plan-requests/ui/status-badge";
import { computeAge } from "@/lib/age";
import { nowMs } from "@/lib/wall-clock";
import { getSettings } from "@/server/settings";

import { formatDateTime } from "../../../_lib/format";
import { BackLink, Card, CardHeader, Empty } from "../../../_components/page-shell";

/**
 * 어드민 결과 페이지 — 가입자 결과 페이지 (`/plan-request/result/[token]`) 의
 * **preview**. 가입자가 보는 chrome (BrandMark + "제안서 N건 도착했어요" 헤더 +
 * AnalysisStatusBadge + 결과 본문) 를 그대로 mirror 하되, 가입자측 제약과 부수효과
 * 를 제거.
 *
 * 가입자 페이지와의 차이:
 *   - **만료 무관** — `resultRetentionDays` 경과해도 그대로 노출. audit/분쟁 대응 목적.
 *   - **ResultViewedMarker 미렌더** — `plan_request.resultViewedAt` 오염 X.
 *   - **상담 진행하기 CTA disabled** — 가입자 wrapper (`ResultView`) 대신 read-only
 *     wrapper (`PreviewResultView`) 사용. mutation 컴포넌트들이 트리에 없음.
 *
 * 분석 본문은 `buildAnalysisRenderer` 가 카드별로 schemaVersion → registry entry
 * dispatch. 한 plan_request 안에 다른 버전 카드가 섞여도 각자 자기 버전 본문으로
 * 렌더 — audit 정직성 보존. 자세한 다버전 정책은
 * [docs/analysis-versioning.md](../../../../../../../docs/analysis-versioning.md).
 */

/** CTA 위 인라인 안내 — read-only wrapper 자체는 route-agnostic 이라 카피가
 *  caller 의 책임. 어드민 컨텍스트는 여기 한 줄에만 묶임. */
const PREVIEW_DISABLED_NOTICE =
  "어드민 preview — 가입자 액션은 시뮬레이션되지 않아요";

export default async function AdminResultPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequestById(id);
  if (!request) notFound();

  // 가입자 결과 페이지와 같은 settings — chip 초기 순서가 어드민 priority 정책을
  // 따라가야 "가입자가 보는 그대로 preview" 라는 의도와 정합.
  const settings = await getSettings();

  // resultToken 발급 전 (송부/마감 이전) — 본문에 보여줄 분석 결과 자체가 없음.
  if (!request.resultToken) {
    return (
      <div className="flex flex-col gap-6">
        <AdminBar id={id} request={request} />
        <Card>
          <CardHeader title="결과 본문" />
          <Empty>아직 결과가 생성되지 않은 요청이에요.</Empty>
        </Card>
      </div>
    );
  }

  const cards = await listPlanProposalCardsForRequest(request.id);

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

  // 가입자 페이지와 동일 — raw 리포트 lookup, registry dispatch.
  const rawReports = await Promise.all(
    cards.map((card) => getRawAnalysisReport(card.proposal.id)),
  );

  const { cardMetas, renderAnalysisBody } = buildAnalysisRenderer({
    cards,
    rawReports,
    customerAge,
    scenarioPriority: settings.scenarioPriority,
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminBar id={id} request={request} />

      {cardMetas.length === 0 ? (
        /* assignments/proposals 가 비어 가입자 화면이 RematchingState 로 가는 케이스.
           preview 도 그 분기 대신 admin-friendly empty 카드로 — RematchingState 는
           자체 <main> + BrandMark 를 렌더하는 status screen 이라 480px 프레임 안
           컴포지션이 어색해진다. audit 의도라면 "비어 있다" 사실만 확인되면 충분. */
        <Card>
          <CardHeader title="결과 본문" />
          <Empty>제출된 제안서가 없어요 (가입자 화면은 RematchingState).</Empty>
        </Card>
      ) : (
        <PreviewFrame>
          <ResultPageShell
            cards={cardMetas}
            selectedPartnerCount={request.selectedPartnerIds.length}
          >
            <PreviewResultView
              cards={cardMetas}
              renderAnalysisBody={renderAnalysisBody}
              resultRetentionDays={settings.resultRetentionDays}
              disabledNotice={PREVIEW_DISABLED_NOTICE}
            />
          </ResultPageShell>
        </PreviewFrame>
      )}
    </div>
  );
}

/**
 * 가입자 화면을 박아 넣는 480px phone-frame. marketing layout 의 mobile
 * container 톤 (좌우 border + soft shadow) 그대로 따라가서 admin canvas 안에서
 * 가입자가 보는 viewport 가 한눈에 분리되어 보이도록.
 *
 * `--proposal-sticky-top: 3.5rem` 으로 `ProposalResultView` chip 탭의 sticky 위치를
 * admin layout 의 sticky top bar (`h-14` = 3.5rem, z-30) 바로 아래로 밀어준다.
 * 변수 미설정이면 chip 이 viewport top-0 에 붙어 admin nav 뒤로 들어감 (z-10 < z-30).
 */
function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mx-auto w-full max-w-[480px] flex flex-col bg-white border-x border-[#e2e2e2] shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
      style={{ "--proposal-sticky-top": "3.5rem" } as React.CSSProperties}
    >
      {children}
    </main>
  );
}

/**
 * Admin chrome — back link + 요청 ID + status + 송부/마감/열람 시각 + 가입자 POV URL.
 * preview 의 phone-frame 바깥, 정상적인 admin 가로폭(1280px) 안에서 한 단위 카드로
 * 압축. preview 의 audit context (이 요청은 어떤 상태였고 가입자가 언제 봤는지) 가
 * 한 줄에 잡혀야 "가입자 화면 미러" 와 분리되어 읽힌다.
 */
function AdminBar({
  id,
  request,
}: {
  id: string;
  request: NonNullable<Awaited<ReturnType<typeof getRequestById>>>;
}) {
  return (
    <div>
      <BackLink href={`/admin/requests/${id}`}>요청 상세</BackLink>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#4b4b4b] tabular-nums">
        <span className="inline-flex items-center gap-2">
          <span className="font-bold text-black">{id}</span>
          <RequestStatusBadge status={request.status} />
        </span>
        <span className="text-[#afafaf]">·</span>
        <span>
          <span className="text-[#afafaf]">생성</span>{" "}
          {formatDateTime(request.createdAt)}
        </span>
        {request.dispatchedAt && (
          <span>
            <span className="text-[#afafaf]">송부</span>{" "}
            {formatDateTime(request.dispatchedAt)}
          </span>
        )}
        {request.deadlineAt && (
          <span>
            <span className="text-[#afafaf]">마감</span>{" "}
            {formatDateTime(request.deadlineAt)}
          </span>
        )}
        {request.resultViewedAt && (
          <span>
            <span className="text-[#afafaf]">열람</span>{" "}
            {formatDateTime(request.resultViewedAt)}
          </span>
        )}
        {request.resultToken && (
          <>
            <span className="text-[#afafaf]">·</span>
            <a
              href={`/plan-request/result/${request.resultToken}`}
              target="_blank"
              rel="noopener noreferrer"
              title="새 탭에서 열기 — 가입자 POV (보관기간 만료 시 ExpiredState)"
              className="font-mono text-black underline decoration-[#e2e2e2] underline-offset-2 hover:decoration-black"
            >
              가입자 POV ↗
            </a>
          </>
        )}
      </div>
    </div>
  );
}
