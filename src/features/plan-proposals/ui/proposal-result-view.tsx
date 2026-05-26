"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { NO_TRACK_CLASS, NoTrack } from "@/components/analytics/no-track";
import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import type { PlanProposalData } from "@/features/plan-proposals/ui/chart-types";
import { PartnerNoteBubble } from "@/features/plan-proposals/ui/partner-note-bubble";
import { ProposalMetricsCard } from "@/features/plan-proposals/ui/proposal-metrics-card";
import { ProposalTabChip } from "@/features/plan-proposals/ui/proposal-tab-chip";
import { ScenarioPickerRoiChart } from "@/features/plan-proposals/ui/scenario-picker-roi-chart";
import { SurrenderLossChart } from "@/features/plan-proposals/ui/surrender-loss-chart";
import { cn } from "@/lib/utils";

/* ============================================================
 * ProposalResultView — chip 탭 + 활성 제안서 본문 (한줄평 / placeholder / 메트릭 /
 * ROI / 해지 부담 / 설계사 attribution).
 *
 * 라우트 공유 (의존성 방향: 호출자 → 본 컴포넌트 ← 호출자):
 *   - 가입자 결과 페이지 (`/plan-request/result/[token]`) — `bottomActionFor` +
 *     `footer` slot 으로 "상담 진행하기" CTA + 보관기간 안내를 합성.
 *   - 어드민 결과 페이지 (`/admin/requests/[id]/result`, audit) — 두 slot 모두
 *     미전달. 만료/조회 마커/CTA 없는 raw view.
 *
 * 부수효과 (조회 마커 / 분석/추적 / 상담 요청 액션) 는 전부 호출자 책임. 본 컴포넌트
 * 는 데이터 렌더링만 수행.
 *
 * 활성 chip state 는 본 컴포넌트 내부 useState 로 관리 — `bottomActionFor` 는 매
 * 렌더마다 호출되어 활성 proposal 을 받아 closure 로 호출자의 외부 state
 * (예: contactRequested) 를 함께 참조 가능.
 * ============================================================ */

export function ProposalResultView({
  proposals,
  reports,
  scenarioPriority,
  bottomActionFor,
  footer,
}: {
  proposals: PlanProposalData[];
  /** 모든 제안서의 분석 리포트. ScenarioPickerRoiChart 의 union/intersection 계산용. */
  reports?: AnalysisReportV5[];
  /** admin 이 설정한 시나리오 우선순위 (app_settings.scenarioPriority). */
  scenarioPriority?: readonly string[];
  /** 활성 제안서에 대해 fixed 하단 액션 영역을 렌더할 slot. 가입자 = "상담 진행하기".
   *  미전달이면 fixed 영역 없음 + article 하단 spacer 축소. */
  bottomActionFor?: (proposal: PlanProposalData) => ReactNode;
  /** article 본문 끝(설계사 attribution 카드 아래)에 노출되는 푸터 slot.
   *  가입자 = disclaimer + 보관기간 안내. */
  footer?: ReactNode;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = proposals[activeIdx];
  if (!active) return null;

  const safeReports: AnalysisReportV5[] = reports ?? [];
  const safePriority: readonly string[] = scenarioPriority ?? [];
  const hasFixedBottom = Boolean(bottomActionFor);

  return (
    <div className="flex flex-col">
      {/* Sticky chip 탭 — 아바타 + 이름. 분석 안 된 proposal 은 우측에 pulse dot.
       *
       * `top` 은 ancestor 가 `--proposal-sticky-top` CSS 변수로 override 가능 —
       * 본인이 자체 sticky 헤더를 가진 컨테이너 (예: 어드민 layout 안 PreviewFrame)
       * 에 embed 될 때 chip 이 그 헤더 뒤로 들어가지 않게 offset 을 주입한다.
       * 미설정 시 viewport top (`0px`) 기본 — 가입자 marketing layout 의 동작. */}
      <nav
        className="sticky z-10 bg-white border-b border-[#efefef] mt-6"
        style={{ top: "var(--proposal-sticky-top, 0px)" }}
      >
        <ul className="px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {proposals.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <ProposalTabChip
                proposal={p}
                selected={activeIdx === i}
                onSelect={() => setActiveIdx(i)}
              />
            </li>
          ))}
        </ul>
      </nav>

      <ProposalBody
        proposal={active}
        proposals={proposals}
        reports={safeReports}
        scenarioPriority={safePriority}
        bottomSpacer={hasFixedBottom}
        footer={footer}
      />

      {hasFixedBottom && bottomActionFor && (
        /* 상담 진행하기 CTA — 하단 viewport 고정. 480px 모바일 컨테이너 기준 가운데 정렬.
           내부 콘텐츠는 호출자가 슬롯으로 주입 (활성 proposal 컨텍스트와 외부 state 합성). */
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-6 pt-3 pb-4 bg-white border-t border-[#efefef] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-50">
          {bottomActionFor(active)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 활성 제안서 본문 — chip 탭 전환 시 통째 교체.
 *
 * 본문 흐름: 설계사 한줄평 → (분석 placeholder | 메트릭 → ROI → 해지) → attribution → footer.
 * 한줄평을 맨 위로 두어 chip 으로 선택한 설계사의 "한마디" 가 데이터 컨텍스트를 잡고,
 * attribution 카드는 본문 끝에서 작성자 정보 컨텍스트.
 *
 * `bottomSpacer` = true 면 fixed CTA 와 마지막 컨텐츠가 겹치지 않도록 pb-32, 아니면 pb-12.
 * ============================================================ */

function ProposalBody({
  proposal,
  proposals,
  reports,
  scenarioPriority,
  bottomSpacer,
  footer,
}: {
  proposal: PlanProposalData;
  proposals: PlanProposalData[];
  reports: AnalysisReportV5[];
  scenarioPriority: readonly string[];
  bottomSpacer: boolean;
  footer?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "px-6 flex flex-col gap-16",
        bottomSpacer ? "pb-32" : "pb-12",
      )}
    >
      {/* 설계사 한줄평 — message-from-partner 톤. 본문 끝 attribution 카드는
       *  프로필/신뢰지표 톤으로 역할이 다름.
       *
       *  NoTrack: 가입자가 매칭된 설계사명 + 설계사의 자유 작성 메시지가 모두 노출 —
       *  가입자 ↔ 설계사 매칭 사실이 PostHog 에 leak 되지 않도록 wrapping. */}
      <NoTrack className="mt-6">
        <PartnerNoteBubble
          partnerName={proposal.partner.name}
          avatarUrl={proposal.partner.avatarUrl}
          note={proposal.note}
        />
      </NoTrack>

      {/* 분석 안 된 proposal — 데이터 섹션 placeholder 로 대체.
       *   note + partner attribution 은 여전히 노출 (가용한 정보).
       *   `analysisSkipped` 면 회복 불가 안내 (새로고침으로 변하지 않음),
       *   그 외 미완료면 진행 중 안내 (1–2분 후 새로고침). */}
      {!proposal.analyzed && proposal.analysisSkipped && (
        <section className="rounded-xl border border-[#e2e2e2] bg-[#fafafa] p-8 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-black">
            분석을 진행할 수 없는 제안서예요
          </p>
          <p className="text-xs text-[#4b4b4b] leading-relaxed">
            PDF 에서 정보를 자동으로 추출하지 못했어요.
            <br />
            보험료·담보 상세는 설계사에게 직접 문의해 주세요.
          </p>
        </section>
      )}
      {!proposal.analyzed && !proposal.analysisSkipped && (
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
      {proposal.analyzed && <ProposalMetricsCard proposal={proposal} />}

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

      {/* 설계사 attribution — 본문 끝에서 "이 한줄평의 작성자" 컨텍스트.
       *  가입자 ↔ 설계사 매칭 식별이 가능한 영역이라 전체 분석 제외 (read-only 카드라
       *  내부 click 추적도 잃을 게 없음). */}
      <section
        className={cn("rounded-xl border border-[#efefef] p-5", NO_TRACK_CLASS)}
      >
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

      {footer}
    </article>
  );
}
