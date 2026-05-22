"use client";

import { useState, useTransition } from "react";

import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { requestPlanProposalContact } from "@/features/plan-proposals/actions";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import type { ContactChannel } from "@/features/plan-proposals/schema";
import { cn } from "@/lib/utils";

import { type PlanProposalData } from "../_lib/result-types";
import { SurrenderLossChart } from "./charts/surrender-loss-chart";
import { ContactChannelSheet } from "./contact-channel-sheet";
import { ScenarioPickerRoiChart } from "./scenario-picker-roi-chart";

/**
 * 결과 페이지 본문 — 토글 chip 으로 제안서 전환, 본문 통째 교체.
 *
 * 흐름:
 *   1. AI 인사이트 카드 (검정)
 *   2. Sticky chip 탭 — 제안서 A/B/C
 *   3. 선택된 제안서 본문 (설계사 헤더 / 핵심 수치 / ROI / 레이더 / 핵심 담보 /
 *      추가 정보 / 상담 진행하기 CTA)
 *
 * 연락 요청 상태 (contacted): SSR 의 proposal.contactedAt 기반으로 초기화 후
 * client state 로 관리. "상담 진행하기" 클릭 → 바텀 시트에서 채널 (카카오톡 / 문자)
 * 선택 → requestPlanProposalContact 액션을 호출. 액션이 멱등이라 서버는 첫 호출만
 * 카운터 +1, 클라는 응답과 무관하게 즉시 토글 (optimistic). 새로고침 / 새 탭에서
 * button 이 다시 활성되는 것은 SSR 의 contactedAt 으로 가려짐.
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
  const [activeIdx, setActiveIdx] = useState(0);
  const [contacted, setContacted] = useState<Set<string>>(
    () => new Set(proposals.filter((p) => p.contacted).map((p) => p.id)),
  );
  // 시트가 어느 proposal 에 대해 열렸는지 식별. 닫혀있으면 null. chip 탭 전환과
  // 무관하게 사용자가 누른 시점의 proposal 을 고정해 잘못된 설계사에게 연락 가는
  // 케이스를 차단.
  const [sheetProposalId, setSheetProposalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const active = proposals[activeIdx];
  if (!active) return null;

  const sheetProposal = sheetProposalId
    ? (proposals.find((p) => p.id === sheetProposalId) ?? null)
    : null;

  // 모든 제안서의 분석 리포트 — chip union/intersection 계산용.
  // PlanProposalBody 가 reuse 되므로 ScenarioPickerRoiChart 의 recent/active state 는
  // 제안서 chip 탭 전환에도 유지됨.
  const reports: AnalysisReportV5[] = reportsById
    ? proposals
        .map((p) => reportsById[p.id])
        .filter((r): r is AnalysisReportV5 => Boolean(r))
    : [];

  function markContacted(id: string, channel: ContactChannel) {
    if (contacted.has(id)) return;
    setContacted((s) => new Set(s).add(id));
    startTransition(async () => {
      const result = await requestPlanProposalContact(resultToken, id, channel);
      if (!result.ok) {
        // not_found — 토큰 불일치 등 비정상 케이스.
        // settled — 보관 기간 지나 cron 정산 완료된 요청 (stale 탭에서 늦게 도착한 클릭).
        // invalid_channel — 클라/서버 사이 enum 불일치 (정상 플로우엔 없음, defensive).
        //   세 경우 모두 새로고침하면 ExpiredState 가 렌더되거나 button 이 다시 활성되어
        //   자연스럽게 이탈하므로 별도 토스트 없이 토글 롤백만.
        setContacted((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    });
  }

  return (
    <div className="flex flex-col">
      {/* Sticky chip 탭 — 아바타 + 이름. 분석 안 된 proposal 은 우측에 pulse dot. */}
      <nav className="sticky top-0 z-10 bg-white border-b border-[#efefef] mt-6">
        <ul className="px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {proposals.map((p, i) => {
            const selected = activeIdx === i;
            return (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    "pl-1 pr-4 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center gap-2",
                    selected
                      ? "bg-black text-white"
                      : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
                  )}
                >
                  <PartnerAvatar
                    name={p.partner.name}
                    avatarUrl={p.partner.avatarUrl}
                    className="w-7 h-7 text-xs font-bold"
                    fallbackClassName={
                      selected
                        ? "bg-white text-black"
                        : "bg-black text-white"
                    }
                  />
                  {p.partner.name}
                  {!p.analyzed && (
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        selected ? "bg-white" : "bg-[#4b4b4b]",
                      )}
                      aria-label="분석 중"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 선택된 제안서 본문 */}
      <PlanProposalBody
        proposal={active}
        proposals={proposals}
        reports={reports}
        scenarioPriority={scenarioPriority ?? []}
        resultRetentionDays={resultRetentionDays}
        contacted={contacted.has(active.id)}
        onContact={() => setSheetProposalId(active.id)}
      />

      <ContactChannelSheet
        open={sheetProposal !== null}
        onClose={() => setSheetProposalId(null)}
        onSelect={(channel) => {
          if (sheetProposal) {
            markContacted(sheetProposal.id, channel);
            setSheetProposalId(null);
          }
        }}
      />
    </div>
  );
}

/* ============================================================
 * 제안서 본문 — chip 탭으로 전환 시 통째 교체
 * ============================================================ */

function PlanProposalBody({
  proposal,
  proposals,
  reports,
  scenarioPriority,
  resultRetentionDays,
  contacted,
  onContact,
}: {
  proposal: PlanProposalData;
  proposals: PlanProposalData[];
  reports: AnalysisReportV5[];
  scenarioPriority: readonly string[];
  resultRetentionDays: number;
  contacted: boolean;
  onContact: () => void;
}) {
  return (
    <>
    <article className="px-6 pb-32 flex flex-col gap-16">
      {/*
       * 본문 흐름: 설계사 한줄평 → 핵심 수치 → ROI → 해지 시 월부담 → 매칭 → 메모.
       * 한줄평을 맨 위로 두어 chip 으로 선택한 설계사의 "한마디" 가 데이터 보기
       * 전 컨텍스트를 잡음. 메모 카드 (avatar / 경력 / 신뢰지표) 는 본문 끝에서
       * attribution 역할.
       *
       * 하단 CTA 는 fixed bottom — article 밖에서 viewport 에 고정. article 의
       * pb-32 가 마지막 컨텐츠가 fixed 버튼에 가려지지 않게 spacer 역할.
       */}

      {/*
        * 설계사 한줄평 — 메신저 패턴 (아바타 + 이름 + 말풍선). 좌상단 꼬리 (rounded-tl-sm)
        * + 아바타 정렬로 "이 설계사가 보낸 메시지" 라는 톤을 살림. 본문 끝의 attribution
        * 카드 와 중복 같지만, 여긴 message-from-partner 톤이고 끝은 프로필/신뢰지표 톤.
        */}
      <div className="mt-6 flex items-start gap-2">
        <PartnerAvatar
          name={proposal.partner.name}
          avatarUrl={proposal.partner.avatarUrl}
          className="w-8 h-8 text-[11px] font-bold"
          fallbackClassName="bg-black text-white"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#4b4b4b] mb-1">
            {proposal.partner.name} 설계사
          </p>
          <div className="bg-[#f0f0f0] rounded-2xl rounded-tl-sm px-4 py-3">
            <p className="text-sm text-black leading-relaxed">
              {proposal.note}
            </p>
          </div>
        </div>
      </div>

      {/* 분석 안 된 proposal — 데이터 섹션 placeholder 로 대체.
       *   note + partner attribution 은 여전히 노출 (가용한 정보).
       *   분석 완료 후 새로고침 안내. */}
      {!proposal.analyzed && (
        <section className="rounded-xl border border-dashed border-[#e2e2e2] p-8 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full bg-[#4b4b4b] animate-pulse"
              aria-hidden
            />
            <span
              className="w-2 h-2 rounded-full bg-[#4b4b4b] animate-pulse [animation-delay:0.15s]"
              aria-hidden
            />
            <span
              className="w-2 h-2 rounded-full bg-[#4b4b4b] animate-pulse [animation-delay:0.3s]"
              aria-hidden
            />
          </div>
          <p className="text-sm font-semibold text-black">
            제안서 분석 중이에요
          </p>
          <p className="text-xs text-[#4b4b4b] leading-relaxed">
            PDF 에서 보험료·담보·환급 정보를 추출하고 있어요.
            <br />
            보통 1–2분 정도 걸려요. 잠시 후 새로고침해 주세요.
          </p>
        </section>
      )}

      {/* 핵심 수치 — 보험사 / 매월 납입료 / 계약 구조. 분석 안 된 카드는 hide. */}
      {proposal.analyzed && (
      <section className="rounded-xl bg-[#f8f8f8] p-5 flex flex-col gap-5">
        <div>
          <p className="text-xs text-[#4b4b4b]">{proposal.insurer}</p>
          <p className="mt-3 text-xs text-[#4b4b4b]">매달 내는 보험료</p>
          <p className="mt-0.5 text-[2.25rem] font-bold tracking-tight text-black leading-none">
            {formatCurrency(proposal.monthlyPremium)}
            <span className="ml-1 text-base font-medium text-[#4b4b4b]">
              원
            </span>
          </p>
        </div>
        {/*
         * 계약 구조 — label/value pair 대신 친근한 sentence 리스트로.
         * 일반인이 보험 용어 (해지환급금 / 갱신형 담보 등) 를 모를 수 있어 키워드
         * 만 굵게 두고 의미를 풀어 설명.
         */}
        <ul className="flex flex-col gap-3 text-sm text-[#4b4b4b] leading-snug">
          <li>
            <span className="font-semibold text-black">
              {proposal.paymentYears}년 동안
            </span>{" "}
            매달 보험료를 내야 해요
          </li>
          <li>
            <span className="font-semibold text-black">
              {proposal.maturityAge}세까지
            </span>{" "}
            보장받을 수 있어요
          </li>
          <li>
            {proposal.hasRefundDuringPayment ? (
              <>
                납입기간 중 해지해도{" "}
                <span className="font-semibold text-black">
                  낸 돈의 일부
                </span>
                를 돌려받을 수 있어요
              </>
            ) : (
              <>
                납입기간 중 해지하면{" "}
                <span className="font-semibold text-black">
                  낸 돈을 돌려받지 못해요
                </span>
              </>
            )}
          </li>
          <li>
            {proposal.hasRenewableRider ? (
              <>
                보험료가{" "}
                <span className="font-semibold text-black">
                  {proposal.renewalIntervalYears
                    ? `${proposal.renewalIntervalYears}년마다`
                    : "주기적으로"}
                </span>{" "}
                조금씩 인상돼요
              </>
            ) : (
              <>
                보험료가{" "}
                <span className="font-semibold text-black">끝까지</span>{" "}
                그대로예요
              </>
            )}
          </li>
        </ul>
      </section>
      )}

      {/* ROI 그래프 — [recent₁, recent₂, recent₃, 🔍]. 검색 chip click 시 모달.
       *  reports 가 비어 있거나 현재 proposal 이 분석 안 된 경우 hide. */}
      {proposal.analyzed && reports.length > 0 ? (
        <ScenarioPickerRoiChart
          proposal={proposal}
          proposals={proposals}
          reports={reports}
          scenarioPriority={scenarioPriority}
        />
      ) : null}

      {/* 해지 시 월부담 — 회수 배율의 flip side: 아무 일 없이 해지하면 월 얼마꼴로 부담한 셈인가 */}
      {proposal.analyzed && (
        <SurrenderLossChart proposals={proposals} activeId={proposal.id} />
      )}

      {/* 설계사 attribution — 본문 끝에서 "이 한줄평의 작성자" 컨텍스트 */}
      <section className="rounded-xl border border-[#efefef] p-5">
        <header className="flex items-start gap-3">
          <PartnerAvatar
            name={proposal.partner.name}
            avatarUrl={proposal.partner.avatarUrl}
            className="w-12 h-12 text-lg font-bold"
            fallbackClassName="bg-black text-white"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold text-black">
                {proposal.partner.name}
              </span>
              <span className="text-xs text-[#4b4b4b]">
                경력 {proposal.partner.yearsOfExperience}년
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#4b4b4b]">
              {proposal.partner.trustMetric}
            </p>
          </div>
        </header>
      </section>

      {/*
       * 페이지 푸터 — disclaimer 두 줄 + 결과 유지 기간. article 의 pb-32
       * 안이라 fixed CTA 에 가려지지 않음. gap-4 로 disclaimer 와 7일간 사이
       * 명확히 분리.
       */}
      <div className="flex flex-col gap-4 text-xs text-[#afafaf] text-center leading-relaxed -mt-4">
        <p>
          설계사가 보내준 제안서를 약관 기준으로 객관 비교했어요.
          <br />
          AI 가 분석한 자료라 약간의 오차가 있을 수 있어요.
        </p>
        <p>결과는 {resultRetentionDays}일간 유지돼요</p>
      </div>
    </article>

    {/* 상담 진행하기 CTA — 하단 viewport 고정. 480px 모바일 컨테이너 기준 가운데 정렬.
      *   클릭 시 부모가 ContactChannelSheet 를 열어 채널 (카카오톡 / 문자) 선택을 받음. */}
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-6 pt-3 pb-4 bg-white border-t border-[#efefef] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-50">
      <button
        type="button"
        onClick={onContact}
        disabled={contacted}
        className={cn(
          "w-full h-14 rounded-full text-base font-medium transition-colors",
          contacted
            ? "bg-[#efefef] text-[#4b4b4b] cursor-default"
            : "bg-black text-white hover:bg-[#1a1a1a]",
        )}
      >
        {contacted
          ? "상담 요청을 보냈어요"
          : `${proposal.partner.name} 설계사와 상담 진행하기`}
      </button>
    </div>
    </>
  );
}

/* ============================================================
 * formatters
 * ============================================================ */

function formatCurrency(n: number): string {
  return n.toLocaleString("ko-KR");
}
