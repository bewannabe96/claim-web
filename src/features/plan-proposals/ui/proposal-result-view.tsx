"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { NO_TRACK_CLASS, NoTrack } from "@/components/analytics/no-track";
import type { RenderAnalysisBody } from "@/features/plan-proposals/analysis/types";
import type { CardMeta } from "@/features/plan-proposals/card-meta";
import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { PartnerNoteBubble } from "@/features/plan-proposals/ui/partner-note-bubble";
import { ProposalTabChip } from "@/features/plan-proposals/ui/proposal-tab-chip";
import { cn } from "@/lib/utils";

/* ============================================================
 * ProposalResultView — chip 탭 + 활성 카드 본문 (한줄평 / placeholder /
 * 분석 본문 / 설계사 attribution).
 *
 * 분석 리포트 버전 무관. 활성 카드의 분석 본문은 `renderAnalysisBody` 슬롯으로
 * dispatch — registry 의 entry.ActiveBody 가 카드의 버전에 맞춰 다른 본문을 렌더.
 * shell 자체는 `CardMeta` (partner, analyzed, note, contactRequested, schemaVersion)
 * 만 보면 된다.
 *
 * 라우트 공유:
 *   - 가입자 결과 페이지 (`/plan-request/result/[token]`) — `bottomActionFor` +
 *     `footer` slot 으로 "상담 진행하기" CTA + 보관기간 안내 합성.
 *   - 어드민 결과 페이지 (`/admin/requests/[id]/result`, audit) — 두 slot 모두
 *     미전달. 만료/조회 마커/CTA 없는 raw view.
 *
 * 부수효과 (조회 마커 / 분석/추적 / 상담 요청 액션) 는 전부 호출자 책임.
 * 활성 chip state 는 본 컴포넌트 내부 useState 로 관리.
 * ============================================================ */

export function ProposalResultView({
  cards,
  renderAnalysisBody,
  bottomActionFor,
  footer,
}: {
  cards: CardMeta[];
  /** 활성 카드의 분석 본문 dispatch. 카드가 analyzed=true 일 때만 호출됨.
   *  analyzed=false 카드는 shell 이 직접 placeholder 처리. */
  renderAnalysisBody: RenderAnalysisBody;
  /** 활성 카드에 대해 fixed 하단 액션 영역을 렌더할 slot. 가입자 = "상담 진행하기".
   *  미전달이면 fixed 영역 없음 + article 하단 spacer 축소. */
  bottomActionFor?: (active: CardMeta) => ReactNode;
  /** article 본문 끝(설계사 attribution 카드 아래)에 노출되는 푸터 slot.
   *  가입자 = disclaimer + 보관기간 안내. */
  footer?: ReactNode;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = cards[activeIdx];
  if (!active) return null;

  const hasFixedBottom = Boolean(bottomActionFor);

  return (
    <div className="flex flex-col">
      {/* Sticky chip 탭 — 아바타 + 이름. 분석 안 된 카드는 우측에 dot.
       *
       * `top` 은 ancestor 가 `--proposal-sticky-top` CSS 변수로 override 가능 —
       * 본인이 자체 sticky 헤더를 가진 컨테이너 (예: 어드민 PreviewFrame) 에 embed
       * 될 때 chip 이 그 헤더 뒤로 들어가지 않게 offset 을 주입한다.
       * 미설정 시 viewport top (`0px`) 기본. */}
      <nav
        className="sticky z-10 bg-white border-b border-[#efefef] mt-6"
        style={{ top: "var(--proposal-sticky-top, 0px)" }}
      >
        <ul className="px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {cards.map((c, i) => (
            <li key={c.id} className="shrink-0">
              <ProposalTabChip
                card={c}
                selected={activeIdx === i}
                onSelect={() => setActiveIdx(i)}
              />
            </li>
          ))}
        </ul>
      </nav>

      <ActiveCardBody
        active={active}
        renderAnalysisBody={renderAnalysisBody}
        bottomSpacer={hasFixedBottom}
        footer={footer}
      />

      {hasFixedBottom && bottomActionFor && (
        /* 상담 진행하기 CTA — 하단 viewport 고정. 480px 모바일 컨테이너 기준 가운데 정렬.
           내부 콘텐츠는 호출자가 슬롯으로 주입 (활성 카드 컨텍스트와 외부 state 합성). */
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-6 pt-3 pb-4 bg-white border-t border-[#efefef] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-50">
          {bottomActionFor(active)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 활성 카드 본문 — chip 탭 전환 시 통째 교체.
 *
 * 본문 흐름: 설계사 한줄평 → (분석 placeholder | renderAnalysisBody) → attribution → footer.
 * 한줄평을 맨 위로 두어 chip 으로 선택한 설계사의 "한마디" 가 데이터 컨텍스트를 잡고,
 * attribution 카드는 본문 끝에서 작성자 정보 컨텍스트.
 *
 * `bottomSpacer` = true 면 fixed CTA 와 마지막 컨텐츠가 겹치지 않도록 pb-32, 아니면 pb-12.
 * ============================================================ */

function ActiveCardBody({
  active,
  renderAnalysisBody,
  bottomSpacer,
  footer,
}: {
  active: CardMeta;
  renderAnalysisBody: RenderAnalysisBody;
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
          partnerName={active.partner.name}
          avatarUrl={active.partner.avatarUrl}
          note={active.note}
        />
      </NoTrack>

      {/* 분석 안 된 카드 — 데이터 섹션 placeholder 로 대체. analyzed 면 registry
       *  dispatch (renderAnalysisBody). */}
      {!active.analyzed && active.analysisSkipped && (
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
      {!active.analyzed && !active.analysisSkipped && (
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

      {/* 분석 완료된 카드 — registry dispatch. registry miss 시 entry 내부에서
       *  UnsupportedAnalysisVersion 으로 graceful fallback. */}
      {active.analyzed && renderAnalysisBody(active)}

      {/* 설계사 attribution — 본문 끝에서 "이 한줄평의 작성자" 컨텍스트.
       *  가입자 ↔ 설계사 매칭 식별이 가능한 영역이라 전체 분석 제외 (read-only 카드라
       *  내부 click 추적도 잃을 게 없음). */}
      <section
        className={cn("rounded-xl border border-[#efefef] p-5", NO_TRACK_CLASS)}
      >
        <header className="flex items-start gap-3">
          <PartnerAvatar
            name={active.partner.name}
            avatarUrl={active.partner.avatarUrl}
            className="w-12 h-12 text-lg font-bold"
            fallbackClassName="bg-black text-white"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold text-black">
                {active.partner.name}
              </span>
              <span className="text-xs text-[#4b4b4b]">
                경력 {active.partner.yearsOfExperience}년
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#4b4b4b]">
              {active.partner.trustMetric}
            </p>
          </div>
        </header>
      </section>

      {footer}
    </article>
  );
}
