import Link from "next/link";

import { LandingCtaButton } from "../../landing-cta-button";
import { TrustChipList } from "../../trust-chip";

/**
 * 랜딩 변형 V3 — 스크롤 없는 단일 뷰포트 랜딩.
 *
 * v1 (스크롤 인터랙티브 데모) / v2 (스크롤 narrative) 와 정반대 접근: 광고 클릭
 * 직후 첫 화면에 정체성 인용구 + 핵심 메시지(h1) + 서브카피 + 단일 CTA 만.
 * 인용구가 "우리는 누구인가" 를 먼저 못 박은 뒤 h1 이 가치 제안 (WHAT — "여러
 * 설계사 제안서를 AI 로 비교") 을, 서브카피가 메커니즘 (HOW — "요청서만 쓰면
 * 전문가 제안 + 예상 보장금액") 을 설명하고 / CTA 가 즉시 행동을 받아낸다.
 * 인지 부하 최소화 가설.
 *
 * 레이아웃 (위→아래): 헤더(CLAIM) → 정체성 인용구(blockquote) → flex-[1]
 * spacer → 핵심 메시지(h1 빅타이포 + p 서브카피) → 결정 블록(CTA pill + trust
 * chips + 자세히 보기 링크) → flex-[3] spacer. **핵심 메시지 + 결정 블록** 묶음이
 * 두 spacer 사이에서 viewport 중앙에 떠 있는 구조.
 *
 * # spacer 비대칭 (flex-[1] : flex-[3])
 *
 * 상단 고정 컨텐츠 (header 44 + quote 80 = 124px) 가 하단 (0 — chips 가 결정
 * 블록 안이라 추가 하단 고정 없음) 보다 헤비라, 같은 가중치 두 spacer 면 cluster
 * 가 viewport 중앙보다 아래로 떨어진다. 하단을 3 배 무겁게 잡아 cluster 를
 * 위쪽으로 끌어 올린다. 실측:
 *   - 작은 폰 (~iPhone SE, 667h): cluster 중심이 viewport 중심 +40px (광학 중앙)
 *   - 큰 폰 (~iPhone 13, 812h): cluster 가 viewport 상부 약 60% 위치 (하단
 *     spacer 가 큰 폰에서 더 커지면서 자연 분포)
 *
 * spacer 비율 조정 시 양쪽 폰에서 다시 측정할 것 — cluster 높이는 h1·서브카피·
 * 결정 블록 합산이라 카피 변경마다 달라진다.
 *
 * # 결정 블록 — CTA + chips 한 단위
 *
 * CTA (h-16 검정 pill, bold) 바로 아래 `mt-4` 로 trust chips (`100% 무료 · 약
 * 1분 · 영업전화 없음`) 가 같은 section 에 묶여 있어 "버튼 → 안심 → 클릭"
 * 동선이 끊기지 않는다. v1 의 sticky bottom CTA 는 long-scroll 중간 이탈
 * 회수가 목적인데, v3 는 스크롤이 없어 inline CTA 가 항상 viewport 안에 있으므로
 * sticky 불필요.
 *
 * # 카피 단일 진실 공급원
 *
 * CTA 라벨 / trust chip 라벨은 `LandingCtaButton` / `TrustChipList` 가 책임 —
 * 변형 간 일관성 유지 + 라벨 변경 시 한 곳만 수정. 본문 카피 (인용구 / 핵심
 * 메시지) 만 변형 고유.
 */
export function VariantV3({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget: string | undefined;
}) {
  return (
    <main className="flex flex-1 flex-col bg-white">
      {/* Header — 브랜드만. */}
      <header className="px-6 pt-6">
        <p className="text-sm font-bold tracking-wide text-black">CLAIM</p>
      </header>

      {/*
       * 정체성 인용구 — 헤더 바로 아래에 박아 "우리는 누구인가" 를 먼저 못 박는다.
       * 좌측 검정 bar + 따옴표 = 인용구임을 시각적으로 한 번에 인식. 색은 무거운
       * 검정 (#1a1a1a) 으로 잡아 본문보다 한 단계 묵직하게.
       */}
      <section className="px-6 pt-5">
        <blockquote className="border-l-2 border-black pl-4 text-[0.875rem] leading-relaxed text-[#1a1a1a]">
          &ldquo;저희는 보험사도, 보험대리점도 아닙니다.
          <br />
          저희는 AI 기반 보험 스타트업입니다.&rdquo;
        </blockquote>
      </section>

      {/*
       * 상단 spacer (작음) — 인용구와 핵심 메시지 사이 breath. flex-[1]:flex-[3]
       * 비율로 하단 spacer 와 분배되어, 메시지→CTA→chips cluster 가 viewport
       * 중앙에 떨어진다 (큰 폰 = 정확히 정중앙, 작은 폰 = 광학 중앙 근처).
       */}
      <div className="flex-[1]" />

      {/*
       * 핵심 메시지 + 서브카피 — h1 빅타이포(2.25rem bold)가 가치 제안 (WHAT)
       * 을, 그 아래 서브카피가 메커니즘 (HOW — "요청서만 작성하면 전문가 제안과
       * 예상 보장금액을 받음") 을 설명. h1 검정 / 서브카피 회색(#4b4b4b) 의
       * 위계로 시선이 h1 → 서브카피 → CTA 순으로 자연스럽게 내려간다.
       */}
      <section className="px-6">
        <h1 className="text-[2.25rem] leading-[1.2] font-bold tracking-tight text-black">
          보험 가입시,
          <br />
          여러 설계사 제안서를
          <br />
          AI로 비교하세요
        </h1>
        <p className="mt-5 text-base leading-relaxed text-[#4b4b4b]">
          Claim은 요청서만 작성하면,
          <br />
          전문가 제안과 예상 보장금액을 확인할 수 있어요.
        </p>
      </section>

      {/*
       * 결정 블록 — CTA + trust chips + "AI 비교 더 알아보기" 한 단위. 평소보다
       * 크게 (h-16, text-base, bold) 잡은 검정 pill 바로 아래에 "100% 무료 · 약
       * 1분 · 영업전화 없음" 이 즉시 따라붙어 결정 직전 마찰을 한 번에 해소.
       * 마지막 줄 "AI 비교 더 알아보기 →" 는 보조 동선 — 본 CTA 의 시각 위계를
       * 침해하지 않도록 작은 회색 텍스트 링크로 `/demo` (v1 인터랙티브 스크롤
       * 랜딩) 로 보낸다.
       */}
      <section className="px-6 pt-8">
        <LandingCtaButton
          className="h-16 w-full rounded-full text-base font-bold"
          googleAdsConversionTarget={googleAdsConversionTarget}
        >
          제안서 비교하러 가기
        </LandingCtaButton>
        <TrustChipList className="mt-4 flex flex-wrap justify-center gap-2" />
        <Link
          href="/demo"
          className="mt-4 block text-center text-[0.8rem] text-[#6a6a6a] underline-offset-4 hover:text-black hover:underline"
        >
          AI 비교 더 알아보기 →
        </Link>
      </section>

      {/*
       * 하단 spacer (큼) — flex-[3] 으로 상단 (flex-[1]) 의 3 배. cluster 를
       * 위쪽으로 잡아당겨 viewport 정중앙에 떨어뜨린다 — 위쪽 고정 컨텐츠 (header
       * 44 + quote 80 = 124) 가 헤비하기 때문에 비대칭 비율이 필요.
       */}
      <div className="flex-[3]" />
    </main>
  );
}
