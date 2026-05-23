"use client";

import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ProposalTabChip } from "@/features/plan-proposals/ui/proposal-tab-chip";
import { cn } from "@/lib/utils";

import { DEMO_PROPOSALS } from "../_lib/demo-proposals";
import { ProposalComparisonDemo } from "./proposal-comparison-demo";

/**
 * 랜딩 Hero — 스크롤에 반응하는 제품 화면 가이드.
 *
 * 상단 고정 헤더 = [헤드라인] + [설계사 선택 pill-group] + [fade 띠] 한 덩어리.
 * 스크롤 중 어느 zone 에 있든 설계사를 바꿀 수 있도록 pill-group 을 헤드라인과
 * 함께 sticky 로 고정한다. 그래서 `activeId`(선택 설계사)를 여기서 소유하고,
 * 선택된 제안서를 ProposalComparisonDemo 로 내려준다.
 *
 * 헤드라인은 데모의 어느 zone 을 보고 있느냐에 따라 해당 구절만 검정으로
 * 살아난다. 맨 위에선 살짝 크게(scale) → 고정되면 원래 크기로 줄어든다.
 */
const HEADLINE_PHRASES = [
  "설계사가 제안하고,",
  "AI가 비교하고,",
  "당신은 선택합니다.",
];

export function HeroExperience({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget?: string;
}) {
  // 데모에서 현재 화면 중앙에 있는 zone. null = 데모 진입 전.
  const [activeZone, setActiveZone] = useState<number | null>(null);
  // 헤더가 상단에 고정됐는가 — 고정 시 구절 추적 + 헤드라인 축소.
  const [stuck, setStuck] = useState(false);
  // 선택된 설계사 — sticky pill-group 이 관장, 데모로 내려준다.
  const [activeId, setActiveId] = useState(DEMO_PROPOSALS[0].id);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const active =
    DEMO_PROPOSALS.find((p) => p.id === activeId) ?? DEMO_PROPOSALS[0];

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="px-6 pt-10 pb-14">
      <BrandMark />

      {/* 헤더 고정 시점을 감지하는 sentinel */}
      <div ref={sentinelRef} aria-hidden className="mt-9 h-0" />

      {/* 고정 헤더 — 헤드라인 + 설계사 pill-group + fade 띠 한 덩어리. */}
      <div className="sticky top-0 z-20 -mx-6">
        {/* 헤드라인 텍스트 (비인터랙티브). */}
        <div className="pointer-events-none bg-white/90 px-6 pt-4 pb-3">
          {/* 맨 위에선 조금 크게(scale 1.15), 고정되면 원래 크기로 — transform
            * 만 바뀌어 레이아웃은 불변, 아래 콘텐츠가 밀리는 스냅 없음.
            *
            * w-fit 필수 — h1 이 컨테이너 전폭 블록이면 scale(1.15) 한 박스가
            * 뷰포트보다 15% 넓어지고, scale 은 scrollable overflow 에 포함돼
            * 페이지가 좌우로 스크롤된다. 텍스트 폭만큼만 차지하게 줄여서
            * 1.15 배 해도 뷰포트 안에 머물게 한다. */}
          <h1
            className={cn(
              "w-fit origin-bottom-left text-[2rem] font-bold leading-[1.22] tracking-tight transition-transform duration-300 ease-out",
              stuck ? "scale-[0.8]" : "scale-[1.15]",
            )}
          >
            {HEADLINE_PHRASES.map((phrase, i) => (
              <span
                key={phrase}
                className={cn(
                  "block transition-colors duration-500",
                  stuck && activeZone !== null && activeZone !== i
                    ? "text-[#d4d4d4]"
                    : "text-black",
                )}
              >
                {phrase}
              </span>
            ))}
          </h1>
        </div>

        {/* 설계사 선택 pill-group — 헤더와 함께 고정돼 항상 접근 가능. */}
        <div className="bg-white/90 px-6 pb-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {DEMO_PROPOSALS.map((p) => (
              <ProposalTabChip
                key={p.id}
                proposal={p}
                selected={p.id === active.id}
                onSelect={() => setActiveId(p.id)}
              />
            ))}
          </div>
        </div>

        {/* fade 띠 — 데모가 경계 없이 헤더 밑으로 사라진다. */}
        <div
          aria-hidden
          className="pointer-events-none h-8 bg-[linear-gradient(to_bottom,#ffffffe6,#ffffff00)]"
        />
      </div>

      {/* 데모를 섹션 px-6 보다 양옆으로 살짝 넓힘 (카드 마진 축소). */}
      <div className="-mx-2 mt-[112px]">
        <ProposalComparisonDemo
          active={active}
          googleAdsConversionTarget={googleAdsConversionTarget}
          onActiveZoneChange={setActiveZone}
        />
      </div>
    </section>
  );
}
