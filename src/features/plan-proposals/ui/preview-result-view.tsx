"use client";

import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import type { PlanProposalData } from "@/features/plan-proposals/ui/chart-types";
import { ContactCtaButton } from "@/features/plan-proposals/ui/contact-cta-button";
import { ProposalResultView } from "@/features/plan-proposals/ui/proposal-result-view";
import { ResultFooter } from "@/features/plan-proposals/ui/result-footer";

/**
 * 결과 페이지 read-only wrapper — 가입자 wrapper (`ResultView`) 와 같은
 * `ProposalResultView` 데이터 표시 + `ResultFooter` 푸터를 공유하지만 mutation
 * 컴포넌트 (`useState`, `ContactChannelSheet`, `requestPlanProposalContact` 호출) 는
 * 일절 포함하지 않는다. 상담 CTA 는 disabled 로 렌더하고 그 위에 호출자가 전달한
 * `disabledNotice` 안내문을 띄움.
 *
 * 라우트-agnostic — "왜 disabled 인지" 는 호출자가 string 으로 전달. 현재 호출자는
 * `/admin/requests/[id]/result` (어드민 preview) 하나지만, 동일 의도 (read-only
 * mirror) 의 다른 진입점이 생겨도 그대로 재사용 가능.
 *
 * `contactRequested` 는 SSR `proposal.contactRequested` 그대로 반영 — 가입자가 이미
 * 요청한 proposal 은 read-only mirror 에서도 "상담 요청을 보냈어요" 로 표시.
 * 클라이언트 state 자체가 불필요 (mutation 없음).
 */
export function PreviewResultView({
  proposals,
  reportsById,
  scenarioPriority,
  resultRetentionDays,
  disabledNotice,
}: {
  proposals: PlanProposalData[];
  /** 제안서별 분석 리포트. 키는 proposal.id. 분석 미완료 proposal 은 entry 없음. */
  reportsById?: Record<string, AnalysisReportV5>;
  /** admin 이 설정한 시나리오 우선순위 (app_settings.scenarioPriority). */
  scenarioPriority?: readonly string[];
  /** admin 이 설정한 결과 보관 기간 (일). 푸터 안내 문구에 노출. */
  resultRetentionDays: number;
  /** CTA 위에 노출되는 disabled 안내 — 왜 비활성인지 호출자가 표현 (예:
   *  "어드민 preview — 가입자 액션은 시뮬레이션되지 않아요"). */
  disabledNotice: string;
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
          disabledNotice={disabledNotice}
        />
      )}
      footer={<ResultFooter resultRetentionDays={resultRetentionDays} />}
    />
  );
}
