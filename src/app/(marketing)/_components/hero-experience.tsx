"use client";

import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ProposalTabChip } from "@/features/plan-proposals/ui/proposal-tab-chip";
import { cn } from "@/lib/utils";

import { DEMO_PROPOSALS } from "../_lib/demo-proposals";
import { LandingCtaButton } from "./landing-cta-button";
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

/**
 * 신뢰/마찰해소 칩 — 무료/소요시간 같은 1차 의문에 답하는 작은 pill.
 * 모노크롬 시스템 (border + light bg). HeroExperience 위에 선언해
 * Turbopack HMR 의 hoisting 불안정성 회피.
 */
function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-full border border-[#e2e2e2] bg-[#f7f7f7] px-2.5 py-1 text-[0.7rem] font-medium text-[#4b4b4b]">
      {children}
    </li>
  );
}

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
  // 첫 진입 시 pill-group 아래 (2nd pill 이서연 기준) 에 "탭해서 비교" 툴팁
  // 노출. 첫 탭 후 영구 해제.
  const [showPillTooltip, setShowPillTooltip] = useState(true);
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

      {/* ── 첫 뷰포트 CTA + trust chips — 헤드라인 위, 진입 즉시 행동 경로 ──
        *
        * 분석: 광고 유입 71 세션 중 76% 가 0–25% 에서 이탈. 시적 헤드라인이
        * 의미를 잡기 전에 명확한 행동 경로 + 마찰해소 신호(무료/소요시간)를
        * 첫 뷰포트에 노출. 스크롤하면 자연스럽게 위로 사라지고, 그 후엔
        * sticky-bottom-cta 가 지속적 진입을 담당.
        */}
      <div className="mt-6">
        <LandingCtaButton
          className="h-12 w-full rounded-full text-[0.95rem] font-semibold"
          googleAdsConversionTarget={googleAdsConversionTarget}
        >
          1분만에 무료로 제안받기
        </LandingCtaButton>
        <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
          <TrustChip>100% 무료</TrustChip>
          <TrustChip>약 1분</TrustChip>
        </ul>
      </div>

      {/* 헤더 고정 시점을 감지하는 sentinel */}
      <div ref={sentinelRef} aria-hidden className="mt-10 h-0" />

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

        {/* 설계사 선택 pill-group — 헤더와 함께 고정돼 항상 접근 가능.
          *
          * pill-group 자체는 데이터 표시 + 인터랙션 모두 담당하지만, 콜드
          * 방문자에게는 "탭할 수 있다" 가 명확하지 않다 (광고 유입 76% 가
          * 0–25% 이탈). 첫 진입 시 짧은 검정 툴팁을 띄워 인터랙티브함을
          * 신호하고, 첫 탭 즉시 자동 dismiss.
          */}
        <div className="relative bg-white/90 px-6 pb-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {DEMO_PROPOSALS.map((p) => (
              <ProposalTabChip
                key={p.id}
                proposal={p}
                selected={p.id === active.id}
                onSelect={() => {
                  setActiveId(p.id);
                  setShowPillTooltip(false);
                }}
              />
            ))}
          </div>
          {showPillTooltip && (
            <div
              aria-live="polite"
              // left-[170px] = 2nd pill (이서연) 중심의 sticky-container 기준 x 좌표.
              // -translate-x-1/2 로 툴팁 중심을 그 x 에 맞춘다. pill 폭이 균일
              // (~92px) + gap (8px) + px-6 (24px) 가정. 폭이 바뀌면 재측정.
              className="pointer-events-none absolute top-full left-[170px] z-30 mt-1 -translate-x-1/2"
            >
              <div className="relative rounded-md bg-black px-2.5 py-1.5 text-[0.7rem] font-medium whitespace-nowrap text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)]">
                {/* 위쪽을 가리키는 삼각 포인터 — 2nd pill (이서연) 중심으로. */}
                <span
                  aria-hidden
                  className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-black"
                />
                탭해서 다른 설계사 제안서 보기
              </div>
            </div>
          )}
        </div>

        {/* fade 띠 — 데모가 경계 없이 헤더 밑으로 사라진다. */}
        <div
          aria-hidden
          className="pointer-events-none h-8 bg-[linear-gradient(to_bottom,#ffffffe6,#ffffff00)]"
        />
      </div>

      {/* 데모를 섹션 px-6 보다 양옆으로 살짝 넓힘 (카드 마진 축소).
        * sticky header fade 띠와 zone 1 사이 breathing — mt-4 로 타이트하게.
        * 위쪽에 CTA + chips + 헤드라인 + 툴팁이 이미 충분히 차지하므로 데모는
        * 가깝게 붙여 첫 뷰포트 안에 zone 1 entrance 까지 확보. */}
      <div className="-mx-2 mt-4">
        <ProposalComparisonDemo
          active={active}
          googleAdsConversionTarget={googleAdsConversionTarget}
          onActiveZoneChange={setActiveZone}
        />
      </div>
    </section>
  );
}
