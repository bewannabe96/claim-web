"use client";

import { useState } from "react";

import type { AnalysisReportV5 } from "@/features/proposals/analysis-schema";
import { cn } from "@/lib/utils";

import { type ProposalData } from "../_lib/result-types";
import { SurrenderLossChart } from "./charts/surrender-loss-chart";
import { ScenarioPickerRoiChart } from "./scenario-picker-roi-chart";

/**
 * 결과 페이지 본문 — 토글 chip 으로 제안서 전환, 본문 통째 교체.
 *
 * 흐름:
 *   1. AI 인사이트 카드 (검정)
 *   2. Sticky chip 탭 — 제안서 A/B/C
 *   3. 선택된 제안서 본문 (설계사 헤더 / 핵심 수치 / ROI / 레이더 / 핵심 담보 /
 *      추가 정보 / 문자 보내기 CTA)
 */
export function ResultView({
  proposals,
  reportsById,
  scenarioPriority,
}: {
  proposals: ProposalData[];
  /** 제안서별 분석 리포트. 키는 proposal.id. 분석 미완료 proposal 은 entry 없음. */
  reportsById?: Record<string, AnalysisReportV5>;
  /** admin 이 설정한 시나리오 우선순위 (app_settings.scenarioPriority). */
  scenarioPriority?: readonly string[];
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  const active = proposals[activeIdx];
  if (!active) return null;

  // 모든 제안서의 분석 리포트 — chip union/intersection 계산용.
  // ProposalBody 가 reuse 되므로 ScenarioPickerRoiChart 의 recent/active state 는
  // 제안서 chip 탭 전환에도 유지됨.
  const reports: AnalysisReportV5[] = reportsById
    ? proposals
        .map((p) => reportsById[p.id])
        .filter((r): r is AnalysisReportV5 => Boolean(r))
    : [];

  function markContacted(id: string) {
    setContacted((s) => new Set(s).add(id));
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
                  <span
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
                      selected
                        ? "bg-white text-black"
                        : "bg-black text-white",
                    )}
                  >
                    {p.partner.name.charAt(0)}
                  </span>
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
      <ProposalBody
        proposal={active}
        proposals={proposals}
        reports={reports}
        scenarioPriority={scenarioPriority ?? []}
        contacted={contacted.has(active.id)}
        onContact={() => markContacted(active.id)}
      />
    </div>
  );
}

/* ============================================================
 * 제안서 본문 — chip 탭으로 전환 시 통째 교체
 * ============================================================ */

function ProposalBody({
  proposal,
  proposals,
  reports,
  scenarioPriority,
  contacted,
  onContact,
}: {
  proposal: ProposalData;
  proposals: ProposalData[];
  reports: AnalysisReportV5[];
  scenarioPriority: readonly string[];
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
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white text-[11px] font-bold shrink-0">
          {proposal.partner.name.charAt(0)}
        </div>
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
                중간에 그만둬도{" "}
                <span className="font-semibold text-black">
                  낸 돈의 일부
                </span>
                를 돌려받을 수 있어요
              </>
            ) : (
              <>
                중간에 그만두면{" "}
                <span className="font-semibold text-black">
                  낸 돈을 전부 포기
                </span>
                해야 해요
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
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-black text-white text-lg font-bold shrink-0">
            {proposal.partner.name.charAt(0)}
          </div>
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
        <p>결과는 7일간 유지돼요</p>
      </div>
    </article>

    {/* 문자 보내기 CTA — 하단 viewport 고정. 480px 모바일 컨테이너 기준 가운데 정렬. */}
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
          ? "문자를 보냈어요"
          : `${proposal.partner.name} 설계사에게 문자 보내기`}
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
