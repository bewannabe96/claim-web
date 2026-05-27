"use client";

import type { RenderAnalysisBody } from "@/features/plan-proposals/analysis/types";
import type { CardMeta } from "@/features/plan-proposals/card-meta";
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
 * `contactRequested` 는 SSR `card.contactRequested` 그대로 반영 — 가입자가 이미
 * 요청한 카드는 read-only mirror 에서도 "상담 요청을 보냈어요" 로 표시.
 * 클라이언트 state 자체가 불필요 (mutation 없음).
 */
export function PreviewResultView({
  cards,
  renderAnalysisBody,
  resultRetentionDays,
  disabledNotice,
}: {
  cards: CardMeta[];
  renderAnalysisBody: RenderAnalysisBody;
  /** admin 이 설정한 결과 보관 기간 (일). 푸터 안내 문구에 노출. */
  resultRetentionDays: number;
  /** CTA 위에 노출되는 disabled 안내 — 왜 비활성인지 호출자가 표현 (예:
   *  "어드민 preview — 가입자 액션은 시뮬레이션되지 않아요"). */
  disabledNotice: string;
}) {
  return (
    <ProposalResultView
      cards={cards}
      renderAnalysisBody={renderAnalysisBody}
      bottomActionFor={(active) => (
        <ContactCtaButton
          partnerName={active.partner.name}
          contactRequested={active.contactRequested}
          disabledNotice={disabledNotice}
        />
      )}
      footer={<ResultFooter resultRetentionDays={resultRetentionDays} />}
    />
  );
}
