"use client";

import { useState, useTransition } from "react";

import { requestPlanProposalContact } from "@/features/plan-proposals/actions";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import type { ContactChannel } from "@/features/plan-proposals/schema";
import type { PlanProposalData } from "@/features/plan-proposals/ui/chart-types";
import { ContactChannelSheet } from "@/features/plan-proposals/ui/contact-channel-sheet";
import { ContactCtaButton } from "@/features/plan-proposals/ui/contact-cta-button";
import { ProposalResultView } from "@/features/plan-proposals/ui/proposal-result-view";
import { ResultFooter } from "@/features/plan-proposals/ui/result-footer";

/**
 * 가입자 결과 페이지 wrapper — 공용 `ProposalResultView` 데이터 표시 위에 가입자
 * 전용 인터랙션 (상담 요청 / 채널 시트 / 보관기간 안내) 을 합성.
 *
 * 호출자: `/plan-request/result/[token]` (가입자 단독). read-only 진입점 (예: 어드민
 * preview) 은 사이드이펙트가 없는 별도 wrapper (`PreviewResultView`) — 같은
 * `ProposalResultView` 를 공유하되 mutation 컴포넌트들 (이 파일의 useState/useTransition
 * + ContactChannelSheet) 을 일절 끌어오지 않는다.
 *
 * 연락 요청 상태 (`contactRequested`): SSR 의 `proposal.contactRequestedAt` 기반으로
 * 초기화 후 client state 로 관리. "상담 진행하기" 클릭 → 바텀 시트에서 채널 선택 →
 * `requestPlanProposalContact` 액션 호출. 액션이 멱등이라 서버는 첫 호출만 카운터
 * +1, 클라는 응답과 무관하게 즉시 토글 (optimistic). 새로고침 / 새 탭에서 button 이
 * 다시 활성되는 것은 SSR `contactRequestedAt` 으로 가려짐.
 */
export function ResultView({
  resultToken,
  proposals,
  reportsById,
  scenarioPriority,
  resultRetentionDays,
}: {
  /** 결과 페이지 진입 토큰 — server action 호출 시 인증 키. */
  resultToken: string;
  proposals: PlanProposalData[];
  /** 제안서별 분석 리포트. 키는 proposal.id. 분석 미완료 proposal 은 entry 없음. */
  reportsById?: Record<string, AnalysisReportV5>;
  /** admin 이 설정한 시나리오 우선순위 (app_settings.scenarioPriority). */
  scenarioPriority?: readonly string[];
  /** admin 이 설정한 결과 보관 기간 (일). 푸터 안내 문구에 노출. */
  resultRetentionDays: number;
}) {
  const [contactRequested, setContactRequested] = useState<Set<string>>(
    () => new Set(proposals.filter((p) => p.contactRequested).map((p) => p.id)),
  );
  // 시트가 어느 proposal 에 대해 열렸는지 식별. 닫혀있으면 null. chip 탭 전환과
  // 무관하게 사용자가 누른 시점의 proposal 을 고정해 잘못된 설계사에게 연락 가는
  // 케이스를 차단.
  const [sheetProposalId, setSheetProposalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sheetProposal = sheetProposalId
    ? (proposals.find((p) => p.id === sheetProposalId) ?? null)
    : null;

  // 모든 제안서의 분석 리포트 — chip union/intersection 계산용.
  const reports: AnalysisReportV5[] = reportsById
    ? proposals
        .map((p) => reportsById[p.id])
        .filter((r): r is AnalysisReportV5 => Boolean(r))
    : [];

  function markContactRequested(id: string, channel: ContactChannel) {
    if (contactRequested.has(id)) return;
    setContactRequested((s) => new Set(s).add(id));
    startTransition(async () => {
      const result = await requestPlanProposalContact(resultToken, id, channel);
      if (!result.ok) {
        // not_found — 토큰 불일치 등 비정상 케이스.
        // settled — 보관 기간 지나 cron 정산 완료된 요청 (stale 탭에서 늦게 도착한 클릭).
        // invalid_channel — 클라/서버 사이 enum 불일치 (정상 플로우엔 없음, defensive).
        //   세 경우 모두 새로고침하면 ExpiredState 가 렌더되거나 button 이 다시 활성되어
        //   자연스럽게 이탈하므로 별도 토스트 없이 토글 롤백만.
        setContactRequested((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    });
  }

  return (
    <>
      <ProposalResultView
        proposals={proposals}
        reports={reports}
        scenarioPriority={scenarioPriority}
        bottomActionFor={(active) => (
          <ContactCtaButton
            proposal={active}
            contactRequested={contactRequested.has(active.id)}
            onClick={() => setSheetProposalId(active.id)}
          />
        )}
        footer={<ResultFooter resultRetentionDays={resultRetentionDays} />}
      />

      <ContactChannelSheet
        open={sheetProposal !== null}
        onClose={() => setSheetProposalId(null)}
        onSelect={(channel) => {
          if (sheetProposal) {
            markContactRequested(sheetProposal.id, channel);
            setSheetProposalId(null);
          }
        }}
      />
    </>
  );
}
