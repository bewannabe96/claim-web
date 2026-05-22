"use client";

import { useEffect, useRef, useState } from "react";

import { type PlanProposalData } from "@/features/plan-proposals/ui/chart-types";
import { PartnerNoteBubble } from "@/features/plan-proposals/ui/partner-note-bubble";
import { ProposalMetricsCard } from "@/features/plan-proposals/ui/proposal-metrics-card";
import { RoiChart } from "@/features/plan-proposals/ui/roi-chart";
import { cn } from "@/lib/utils";

import { DEMO_PROPOSALS, DEMO_SCENARIOS } from "../_lib/demo-proposals";
import { LandingCtaButton } from "./landing-cta-button";

/**
 * 랜딩 Hero 의 인터랙티브 제품 화면.
 *
 * 헤드라인 3 막을 3 개 zone 으로 나눠 보여준다. 각 zone 은:
 *   - 카드 밖 머리말 — 번호 + 한 줄 설명
 *   - 카드 — 실제 콘텐츠
 *   01 설계사가 제안하고  — 한줄평 + 핵심 수치
 *   02 AI가 비교하고      — 시나리오 + ROI 차트 + 보장 패널
 *   03 당신은 선택합니다   — 요청서 작성 CTA
 *
 * 설계사 선택(pill-group)은 HeroExperience 의 sticky 헤더에 있다 — 선택된
 * 제안서가 `active` prop 으로 내려온다. 화면 중앙에 온 zone 은 `onActiveZoneChange`
 * 로 알려 sticky 헤드라인이 해당 구절을 하이라이트하고, 중앙 zone 만 또렷하게,
 * 나머지는 blur out.
 *
 * zone 1·2 의 카드 내용물은 result/[token] 페이지의 컴포넌트
 * (features/plan-proposals/ui)를 그대로 재사용 — mock 데이터로만 동작.
 */

/** 각 zone 카드 공통 스타일 (머리말은 카드 밖). */
const CARD =
  "overflow-hidden rounded-2xl border border-[#e2e2e2] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.1)]";

export function ProposalComparisonDemo({
  active,
  googleAdsConversionTarget,
  onActiveZoneChange,
}: {
  /** sticky 헤더의 pill-group 에서 선택된 제안서. */
  active: PlanProposalData;
  googleAdsConversionTarget?: string;
  /** 화면 중앙에 온 zone index(0~2). 데모 진입 전엔 호출되지 않음. */
  onActiveZoneChange?: (zone: number) => void;
}) {
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id);
  const [activeZone, setActiveZone] = useState<number | null>(null);

  const zoneRefs = useRef<(HTMLElement | null)[]>([]);

  // 뷰포트 수직 중앙선이 어느 zone 을 지나는지 추적. zone 사이 간격에 중앙선이
  // 들어와 잠깐 비는 동안은 직전 활성 zone 을 유지한다(깜빡임 방지).
  useEffect(() => {
    const els = zoneRefs.current.filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = zoneRefs.current.indexOf(entry.target as HTMLElement);
          if (idx === -1) continue;
          if (entry.isIntersecting) visible.add(idx);
          else visible.delete(idx);
        }
        if (visible.size === 0) return; // zone 사이 간격 — 직전 zone 유지
        const next = Math.min(...visible);
        setActiveZone(next);
        onActiveZoneChange?.(next);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [onActiveZoneChange]);

  // 집중 효과 — 화면 중앙에 온 zone 만 또렷하게, 나머지는 blur out.
  const blurClass = (index: number) =>
    activeZone === null || activeZone === index
      ? "blur-[0px]"
      : "blur-[3px]";

  return (
    <div className="flex flex-col gap-[120px] pb-[200px]">
      {/* ── 01 설계사가 제안하고 ── */}
      <section
        ref={(el) => {
          zoneRefs.current[0] = el;
        }}
        className={cn("transition-all duration-500", blurClass(0))}
      >
        <ZoneHeader
          index="01"
          active={activeZone === 0}
          caption={
            <>
              설계사마다 보낸 제안서가 달라요.
              <br />위 탭에서 설계사를 바꿔보세요.
            </>
          }
        />
        <div className={cn(CARD, "flex flex-col gap-5 px-5 py-6")}>
          <PartnerNoteBubble
            partnerName={active.partner.name}
            avatarUrl={active.partner.avatarUrl}
            note={active.note}
          />
          <ProposalMetricsCard proposal={active} />
        </div>
      </section>

      {/* ── 02 AI가 비교하고 ── */}
      <section
        ref={(el) => {
          zoneRefs.current[1] = el;
        }}
        className={cn("transition-all duration-500", blurClass(1))}
      >
        <ZoneHeader
          index="02"
          active={activeZone === 1}
          caption={
            <>
              AI가 보장 범위와 예상 수령액을 분석했어요.
              <br />그래프를 움직여보세요.
            </>
          }
        />
        <div className={cn(CARD, "px-5 py-6")}>
          <RoiChart
            proposals={DEMO_PROPOSALS}
            scenarios={DEMO_SCENARIOS}
            scenarioId={scenarioId}
            onScenarioChange={(id) => setScenarioId(id)}
            activeId={active.id}
          />
        </div>
      </section>

      {/* ── 03 당신은 선택합니다 — 임팩트 있는 CTA 버튼 하나 ── */}
      <section
        ref={(el) => {
          zoneRefs.current[2] = el;
        }}
        className={cn("transition-all duration-500", blurClass(2))}
      >
        <ZoneHeader
          index="03"
          active={activeZone === 2}
          caption={
            <>
              비교를 끝냈다면,
              <br />이제 당신 차례예요.
            </>
          }
          emphasis
        />
        <LandingCtaButton
          className="h-16 w-full rounded-full text-lg font-semibold"
          googleAdsConversionTarget={googleAdsConversionTarget}
        >
          요청서 작성하고 제안 받기
        </LandingCtaButton>
      </section>
    </div>
  );
}

/**
 * zone 머리말 — 카드 밖에 놓이는 번호 + 한 줄 설명. 헤드라인 구절은 여기 두지
 * 않는다(sticky 헤드라인이 담당). 화면 중앙에 온 zone 은 번호·설명이 검정으로
 * 강조돼 헤드라인의 하이라이트 구절과 함께 움직인다.
 */
function ZoneHeader({
  index,
  active,
  caption,
  emphasis = false,
}: {
  index: string;
  active: boolean;
  caption: React.ReactNode;
  /** 중요한 카피 — 캡션을 크게 키운다 (zone 3 의 CTA 리드 문구용). */
  emphasis?: boolean;
}) {
  // px-3: 모든 zone 머리말을 카드 안쪽으로 살짝 들여 — 위치 일관.
  return (
    <div className="px-3 pb-4">
      <span
        className={cn(
          "font-mono text-[0.72rem] font-bold tracking-[0.12em] transition-colors duration-300",
          active ? "text-black" : "text-[#cdcdcd]",
        )}
      >
        {index}
      </span>
      <p
        className={cn(
          "mt-1.5 leading-relaxed transition-colors duration-300",
          emphasis ? "text-lg font-medium" : "text-xs",
          active
            ? emphasis
              ? "text-black"
              : "text-[#4b4b4b]"
            : "text-[#9a9a9a]",
        )}
      >
        {caption}
      </p>
    </div>
  );
}
