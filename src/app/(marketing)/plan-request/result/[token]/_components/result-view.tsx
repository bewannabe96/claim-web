"use client";

import { useState, useTransition } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { requestPlanProposalContact } from "@/features/plan-proposals/actions";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import type { ContactChannel } from "@/features/plan-proposals/schema";
import type { PlanProposalData } from "@/features/plan-proposals/ui/chart-types";
import { ProposalResultView } from "@/features/plan-proposals/ui/proposal-result-view";
import { cn } from "@/lib/utils";

import { ContactChannelSheet } from "./contact-channel-sheet";

/**
 * 가입자 결과 페이지 chrome — 공용 ProposalResultView 를 감싸 가입자 전용 상호작용
 * (상담 요청 / 채널 시트 / 보관기간 안내) 만 담당.
 *
 * 연락 요청 상태 (contactRequested): SSR 의 proposal.contactRequestedAt 기반으로
 * 초기화 후 client state 로 관리. "상담 진행하기" 클릭 → 바텀 시트에서 채널
 * (카카오톡 / 문자) 선택 → requestPlanProposalContact 액션을 호출. 액션이 멱등이라
 * 서버는 첫 호출만 카운터 +1, 클라는 응답과 무관하게 즉시 토글 (optimistic). 새로고침
 * / 새 탭에서 button 이 다시 활성되는 것은 SSR 의 contactRequestedAt 으로 가려짐.
 *
 * 데이터 표시는 features/plan-proposals/ui/proposal-result-view 가 책임 — 어드민
 * 결과 페이지 (`/admin/requests/[id]/result`) 와 같은 컴포넌트.
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
        footer={
          /*
           * 페이지 푸터 — disclaimer 두 줄 + 결과 유지 기간. article 의 pb-32
           * 안이라 fixed CTA 에 가려지지 않음. gap-4 로 disclaimer 와 보관기간 사이
           * 명확히 분리, -mt-4 로 직전 attribution 카드와의 gap-16 을 살짝 좁힘.
           */
          <div className="flex flex-col gap-4 text-xs text-[#afafaf] text-center leading-relaxed -mt-4">
            <p>
              설계사가 보내준 제안서를 약관 기준으로 객관 비교했어요.
              <br />
              AI 가 분석한 자료라 약간의 오차가 있을 수 있어요.
            </p>
            <p>결과는 {resultRetentionDays}일간 유지돼요</p>
          </div>
        }
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

/**
 * 상담 진행하기 버튼 — ProposalResultView 의 fixed 하단 영역에 합성되는 CTA.
 *  - 이미 상담 요청한 proposal: disabled + "상담 요청을 보냈어요"
 *  - 아닐 때: 검정 pill button + "<설계사명> 설계사와 상담 진행하기" (이름만 NoTrack).
 */
function ContactCtaButton({
  proposal,
  contactRequested,
  onClick,
}: {
  proposal: PlanProposalData;
  contactRequested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={contactRequested}
      className={cn(
        "w-full h-14 rounded-full text-base font-medium transition-colors",
        contactRequested
          ? "bg-[#efefef] text-[#4b4b4b] cursor-default"
          : "bg-black text-white hover:bg-[#1a1a1a]",
      )}
    >
      {contactRequested ? (
        "상담 요청을 보냈어요"
      ) : (
        <>
          {/* 파트너명만 분석 제외 — 버튼 click 자체 ("상담 진행하기 button 클릭") 는
              funnel 핵심 conversion 이라 button 전체 마스킹은 X. PostHog autocapture
              의 element_text 집계 시 ph-no-capture 자식 텍스트는 제외됨. */}
          <span className={NO_TRACK_CLASS}>{proposal.partner.name}</span> 설계사와
          상담 진행하기
        </>
      )}
    </button>
  );
}
