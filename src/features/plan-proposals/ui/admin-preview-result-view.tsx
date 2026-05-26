"use client";

import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import type { PlanProposalData } from "@/features/plan-proposals/ui/chart-types";
import { ContactCtaButton } from "@/features/plan-proposals/ui/contact-cta-button";
import { ProposalResultView } from "@/features/plan-proposals/ui/proposal-result-view";
import { ResultFooter } from "@/features/plan-proposals/ui/result-footer";

const PREVIEW_NOTICE = "어드민 preview — 가입자 액션은 시뮬레이션되지 않아요";

/**
 * 어드민 preview wrapper — 가입자가 보는 chrome 을 그대로 mirror 하되 mutation 액션은
 * 호출하지 않음. `ContactChannelSheet` 도 트리에서 제외 (body scroll lock 등 부수효과
 * 격리). 가입자 wrapper (`ResultView`) 와 같은 `ProposalResultView` 데이터 표시
 * 컴포넌트를 공유.
 *
 * 호출자: `/admin/requests/[id]/result` — `requireAdminSession` 통과한 layout 안.
 *
 * `contactRequested` 는 SSR `proposal.contactRequested` 그대로 반영 — 가입자가 이미
 * 요청한 proposal 은 preview 에서도 "상담 요청을 보냈어요" 로 mirror. preview 모드의
 * 본질은 "보여주되 mutation 안 함" 이라 클라이언트 state 자체가 불필요.
 */
export function AdminPreviewResultView({
  proposals,
  reportsById,
  scenarioPriority,
  resultRetentionDays,
}: {
  proposals: PlanProposalData[];
  /** 제안서별 분석 리포트. 키는 proposal.id. 분석 미완료 proposal 은 entry 없음. */
  reportsById?: Record<string, AnalysisReportV5>;
  /** admin 이 설정한 시나리오 우선순위 (app_settings.scenarioPriority). */
  scenarioPriority?: readonly string[];
  /** admin 이 설정한 결과 보관 기간 (일). 푸터 안내 문구에 노출. */
  resultRetentionDays: number;
}) {
  // 모든 제안서의 분석 리포트 — chip union/intersection 계산용. ResultView 와 동일.
  const reports: AnalysisReportV5[] = reportsById
    ? proposals
        .map((p) => reportsById[p.id])
        .filter((r): r is AnalysisReportV5 => Boolean(r))
    : [];

  return (
    <ProposalResultView
      proposals={proposals}
      reports={reports}
      scenarioPriority={scenarioPriority}
      bottomActionFor={(active) => (
        <ContactCtaButton
          proposal={active}
          contactRequested={active.contactRequested}
          previewNotice={PREVIEW_NOTICE}
        />
      )}
      footer={<ResultFooter resultRetentionDays={resultRetentionDays} />}
    />
  );
}
