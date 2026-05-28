"use client";

import { useState } from "react";

import { NoTrack } from "@/components/analytics/no-track";
import { V5_ENTRY } from "@/features/plan-proposals/analysis/v5";
import { PartnerNoteBubble } from "@/features/plan-proposals/ui/partner-note-bubble";

import {
  MOCK_SCENARIO_PRIORITY,
  type MockSlot,
} from "../../_lib/mock-slots";

import { AddSlotCard } from "./add-slot-card";
import { ProvisionalBanner } from "./provisional-banner";
import { SlotActionBar } from "./slot-action-bar";
import { SlotAttribution } from "./slot-attribution";
import { SlotChip } from "./slot-chip";
import { SlotRemoveConfirmSheet } from "./slot-remove-confirm-sheet";
import { SlotRemoveSection } from "./slot-remove-section";

/* ============================================================
 * Workbench view — v1 의 ProposalResultView 구조를 v2 mock 안에서 fork.
 *
 * v1 컴포넌트는 한 줄도 안 건드림. 같은 패턴 (sticky chip strip + active body)
 * 을 따라 짜되 v2 의 1차 시민 변화를 시각화:
 *
 *   - chip strip   → SlotChip (origin-aware) + AddSlotCard (carousel 끝 [+ 추가])
 *   - active body  → ProvisionalBanner (provisional 만) + PartnerNoteBubble (v1 그대로,
 *                     단 외부 업로드 일 때 톤 변경) + V5_ENTRY.ActiveBody (분석 본문 그대로)
 *                     + SlotAttribution (origin 별 분기) + ResultFooter (v1 그대로)
 *   - fixed bottom → SlotActionBar (origin 별 액션 분기)
 *
 * 분석 본문 dispatch 는 V5_ENTRY 의 public surface 만 사용 — registry 거치지 않고
 * 직접 호출. mock 이라 v5 single version 만 다루므로 buildAnalysisRenderer 불필요.
 *
 * 본 컴포넌트는 mock callback (alert / setState 만) 으로 액션을 시뮬레이션. 실 라우트
 * 화 시점에 server action 으로 교체될 자리.
 * ============================================================ */
export function WorkbenchView({
  initialSlots,
  onAddSlot,
  onProvisionalSignup,
}: {
  initialSlots: MockSlot[];
  /** chip [+ 슬롯 추가] 클릭 — 호출자가 AddSlotSheet 띄움. */
  onAddSlot: () => void;
  /** Phase 3 — 임시 분석 슬롯의 "정식 분석 받기" soft hook. */
  onProvisionalSignup: () => void;
}) {
  // mock 단계 — 슬롯 in-memory state. 제거 액션은 confirm sheet 통과해야 반영.
  const [slots, setSlots] = useState<MockSlot[]>(initialSlots);
  const [activeIdx, setActiveIdx] = useState(0);
  /** 제거 confirm sheet 가 열린 슬롯 id (없으면 null). */
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);

  // 비교 본문은 V5_ENTRY 의 peers 가 ROI 멀티라인 등 cross-slot 차트의 입력.
  // 분석 중 (analyzed=false) 슬롯은 view 가 dummy 라 peers 에서 제외 — 차트가 0 라인
  // 으로 깨지지 않게.
  const peers = slots.filter((s) => s.meta.analyzed).map((s) => s.view);
  const active = slots[activeIdx];

  if (!active) {
    // mock 단계 — 모든 슬롯 제거된 케이스. Phase 1.5 의 empty 와 같은 상태로 fallback.
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-sm text-[#4b4b4b]">
        모든 제안서가 제거되었어요. 새로고침해 mock 리셋.
      </div>
    );
  }

  function confirmRemove(slotId: string) {
    setSlots((prev) => {
      const next = prev.filter((s) => s.meta.id !== slotId);
      // activeIdx 가 마지막 슬롯을 가리키고 있었으면 한 칸 앞으로.
      if (activeIdx >= next.length && next.length > 0) {
        setActiveIdx(next.length - 1);
      }
      return next;
    });
    setPendingRemovalId(null);
  }

  const pendingRemovalSlot =
    slots.find((s) => s.meta.id === pendingRemovalId) ?? null;

  function handleContact(slot: MockSlot) {
    // mock — 실 라우트 화 시 ContactChannelSheet + requestPlanProposalContact.
    alert(
      `[mock] ${slot.meta.partner.name} 설계사 연락 채널 시트가 열림 (CLAIM 매칭 슬롯만 활성)`,
    );
  }

  const ActiveBody = V5_ENTRY.ActiveBody;

  // 분석 중 슬롯 (analyzed=false) — chip 은 보이되 본문은 placeholder. fixed bar 도 없음.
  const isPending = !active.meta.analyzed;

  // fixed bottom action bar 는 partner_submit 슬롯만 노출 — "상담 진행하기" 가 유일한
  // fixed CTA. customer_upload / 분석 중 슬롯은 fixed bar 없음.
  const hasFixedBar = !isPending && active.origin === "partner_submit";

  return (
    <div className="flex flex-col">
      {/* Sticky slot strip — v1 ProposalResultView 의 sticky nav 와 같은 위치/스타일.
       *  단 mock layout 의 "MOCK" 배지가 top: 0 을 점유하므로 chip strip top 을 살짝 내림. */}
      <nav
        className="sticky z-10 bg-white border-b border-[#efefef] mt-6"
        style={{ top: "26px" }}
      >
        {/* scrollbar 자체는 숨기고 (워크벤치 톤에서 시각 노이즈) 가로 스크롤은 유지 —
         *  Firefox (scrollbarWidth) + Webkit (::-webkit-scrollbar) 양쪽 cover. */}
        <ul
          className="px-6 py-3 flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {slots.map((s, i) => (
            <li key={s.meta.id} className="shrink-0">
              <SlotChip
                slot={s}
                selected={activeIdx === i}
                onSelect={() => setActiveIdx(i)}
              />
            </li>
          ))}
          <li className="shrink-0">
            <AddSlotCard onClick={onAddSlot} />
          </li>
        </ul>
      </nav>

      {/* Active slot body — v1 ActiveCardBody 패턴 + v2 분기.
       *
       *  pt-6 은 sticky chip strip 과 첫 본문 자식 사이 호흡 — 한줄평이 있든 없든
       *  일관 spacing 보장 (v1 은 PartnerNoteBubble 의 mt-6 가 책임이었으나 v2 의
       *  customer_upload 슬롯은 한줄평이 hide 되므로 article 자체로 위임). */}
      <article
        // pb 는 article 마지막 자식 (SlotRemoveSection) 이 viewport 끝/fixed bar 뒤로
        // 가려지지 않게 보상. fixed bar 가 있으면 ~84px + section ~100px = pb-48,
        // 없으면 section + native scroll bottom 만 보상하면 충분 (pb-16).
        className={
          hasFixedBar
            ? "px-6 pt-6 flex flex-col gap-16 pb-48"
            : "px-6 pt-6 flex flex-col gap-16 pb-16"
        }
        // 임시 분석 슬롯 활성 시 본문 전체에 살짝 dimming — PRD §4.2 "신뢰도 dimming
        // (60% opacity 등) 향후 디자인 detail" 의 mock 구현.
        style={{
          opacity:
            !isPending && active.analysisMode === "provisional" ? 0.85 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {isPending ? (
          /* 분석 중 슬롯 — 본문 통째 placeholder. attribution / footer / remove 도 hide.
           *  v1 의 ProposalResultView 의 "분석 중이에요" placeholder 패턴과 같은 톤. */
          <PendingBody />
        ) : (
          <>
            {/* provisional 슬롯 — 최상단 노란 배너 + soft hook */}
            {active.analysisMode === "provisional" && (
              <ProvisionalBanner
                fallbackTermsLabel={active.fallbackTermsLabel}
                onSignupClick={onProvisionalSignup}
              />
            )}

            {/* 설계사 한줄평 — partner_submit 슬롯 전용. */}
            {active.origin === "partner_submit" && active.meta.note ? (
              <NoTrack>
                <PartnerNoteBubble
                  partnerName={active.meta.partner.name}
                  avatarUrl={active.meta.partner.avatarUrl}
                  note={active.meta.note}
                />
              </NoTrack>
            ) : null}

            {/* V5 분석 본문 — v1 registry dispatch 와 등가. peers 가 cross-slot ROI 라인 비교. */}
            <ActiveBody
              active={active.view}
              peers={peers}
              scenarioPriority={MOCK_SCENARIO_PRIORITY}
            />

            {/* Attribution — origin 별 분기 */}
            <SlotAttribution slot={active} />

            <p className="text-xs text-[#afafaf] text-center leading-relaxed">
              약관 기준 객관 비교 결과예요.
              <br />
              AI 분석이라 약간의 오차가 있을 수 있어요.
            </p>

            {/* 슬롯 제거 — 비가역 destructive 액션. 본문 가장 끝으로 격리해 우연한 오탭을
             *  방지. 클릭은 confirm sheet 거쳐서만 실제 제거. */}
            <SlotRemoveSection
              slot={active}
              onClick={() => setPendingRemovalId(active.meta.id)}
            />
          </>
        )}
      </article>

      {/* Fixed bottom action bar — partner_submit 슬롯의 "상담 진행하기" 만. customer_upload
       *  케이스에서는 그릴 게 없어 fixed wrapper 자체 hide (오버레이 시각 노이즈 절감). */}
      {hasFixedBar && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-6 pt-3 pb-4 bg-white border-t border-[#efefef] shadow-[0_-4px_16px_rgba(0,0,0,0.04)] z-50">
          <SlotActionBar
            slot={active}
            onContactClick={() => handleContact(active)}
          />
        </div>
      )}

      {/* 슬롯 제거 confirm sheet — "되돌릴 수 없어요" 안내 후 명시 확인. */}
      <SlotRemoveConfirmSheet
        open={pendingRemovalSlot !== null}
        slot={pendingRemovalSlot}
        onClose={() => setPendingRemovalId(null)}
        onConfirm={() => {
          if (pendingRemovalId) confirmRemove(pendingRemovalId);
        }}
      />

    </div>
  );
}

/* ============================================================
 * PendingBody — 분석 중 슬롯의 본문 placeholder.
 *
 * v1 ProposalResultView 의 "분석 중이에요" placeholder 와 같은 톤 (pulse dots +
 * 추출 단계 안내). 사용자가 업로드 직후 workspace 로 복귀해서 active 가 된 슬롯.
 *
 * 실 라우트에서는 webhook 콜백 수신 시 슬롯이 analyzed=true 로 swap 되며 본문이
 * 자동 V5 분석 본문으로 교체. mock 단계는 swap 시뮬레이션 없음 — 새로고침 또는
 * 별도 방식으로 분석 완료를 흉내 (다음 iteration).
 * ============================================================ */
function PendingBody() {
  return (
    <section className="rounded-xl border border-dashed border-[#e2e2e2] p-10 flex flex-col items-center gap-4 text-center mt-4">
      <div className="flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#4b4b4b] animate-pulse"
          aria-hidden
        />
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#4b4b4b] animate-pulse [animation-delay:0.15s]"
          aria-hidden
        />
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#4b4b4b] animate-pulse [animation-delay:0.3s]"
          aria-hidden
        />
      </div>
      <h2 className="text-base font-bold text-black">제안서 분석 중이에요</h2>
      <p className="text-xs text-[#4b4b4b] leading-relaxed">
        업로드한 자료에서 보험사·상품·보험료·담보·환급 정보를
        <br />
        분석기가 자동으로 추출하고 있어요.
        <br />
        보통 1~2분 정도 걸려요.
      </p>
    </section>
  );
}
