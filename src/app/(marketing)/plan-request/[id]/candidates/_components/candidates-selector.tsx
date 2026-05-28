"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { StickyBottomBar } from "@/components/sticky-bottom-bar";
import { Button } from "@/components/ui/button";
import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import type { PartnerCard } from "@/features/partners/schema";
import { cn } from "@/lib/utils";

/**
 * Candidates 선택의 종결 — finalize 책임을 호출자에게 위임하기 위한 contract.
 *
 * v1 실 라우트 (현재 #125 의 frontend auto-skip 모드라 미사용): `submitStep2`
 * server action 호출 + `/plan-request/{id}/confirm` 으로 redirect.
 * v2 풀 path (PRD §4.3, §5.4): 회원 컨텍스트 finalize + dispatched 페이지로 직진.
 *
 * step1-wizard 의 `Step1SubmitOutcome` 과 동일한 outcome 패턴 — caller 가 navigate
 * target 과 errorMessage 만 책임지고 selector 는 form / pending / disabled 만 책임.
 */
export type Step2SubmitOutcome =
  | { ok: true; nextHref: string }
  | { ok: false; errorMessage: string };

export function CandidatesSelector({
  candidates,
  selectLimit,
  subtitle,
  onSubmit,
}: {
  candidates: PartnerCard[];
  selectLimit: number;
  subtitle: string;
  /** 선택된 partnerIds 를 받아 finalize → nextHref 또는 errorMessage 반환. */
  onSubmit: (partnerIds: string[]) => Promise<Step2SubmitOutcome>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const atLimit = selected.length >= selectLimit;
  const canSubmit = selected.length > 0 && !isPending;

  function toggle(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= selectLimit) return s;
      return [...s, id];
    });
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setErrorMessage(null);
    startTransition(async () => {
      const outcome = await onSubmit(selected);
      if (outcome.ok) {
        router.push(outcome.nextHref as never);
        return;
      }
      setErrorMessage(outcome.errorMessage);
    });
  }

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 bg-white">
      <BrandMark />
      <header className="mt-3 flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          잘 맞을 것 같은
          <br />
          설계사 {candidates.length}명이에요
        </h1>
        <p className="mt-1 text-sm text-[#4b4b4b]">{subtitle}</p>
      </header>

      {/* 선택 가이드 */}
      <p className="mt-4 text-xs text-[#4b4b4b]">
        최대 <span className="font-semibold text-black">{selectLimit}명</span>
        까지 선택할 수 있어요 ·{" "}
        <span className="font-semibold text-black">{selected.length}명</span>{" "}
        선택됨
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {candidates.map((c) => (
          <li key={c.id}>
            <CandidateCard
              card={c}
              selected={selected.includes(c.id)}
              disabled={!selected.includes(c.id) && atLimit}
              onToggle={() => toggle(c.id)}
            />
          </li>
        ))}
      </ul>

      {errorMessage && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">
          {errorMessage}
        </p>
      )}

      <StickyBottomBar>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full h-14 rounded-full text-base font-medium"
        >
          {isPending
            ? "다음 단계로 이동 중..."
            : selected.length === 0
              ? "설계사를 선택해주세요"
              : `${selected.length}명에게 제안서 받기`}
        </Button>
      </StickyBottomBar>
    </main>
  );
}

/* ============================================================
 * Candidate card — Figma 디자인 (오렌지 이니셜 아바타 + 트러스트 라인)
 * ============================================================ */

function CandidateCard({
  card,
  selected,
  disabled,
  onToggle,
}: {
  card: PartnerCard;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  // 하단 강조 pill — 신규 등록 설계사면 별도 라벨, 아니면 경력 강조
  const highlightLabel = card.isNew
    ? "새로운 추천 설계사"
    : `경력 ${card.yearsOfExperience}년 설계사`;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "w-full text-left rounded-xl bg-white p-4 flex flex-col gap-3 relative transition-all",
        // 카드 elevation: 기본 = whisper shadow, 선택 = 검정 ring + 그림자 유지
        selected
          ? "shadow-[0_4px_16px_rgba(0,0,0,0.16)] ring-2 ring-black"
          : disabled
            ? "shadow-[0_4px_16px_rgba(0,0,0,0.08)] opacity-50"
            : "shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.16)]",
      )}
    >
      {/* 선택 체크 표시 — 검정 인버전 */}
      <span
        className={cn(
          "absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-full transition-colors",
          selected
            ? "bg-black text-white"
            : "border border-[#e2e2e2] bg-white",
        )}
        aria-hidden
      >
        {selected && (
          <svg
            viewBox="0 0 12 12"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6.5L5 9.5L10 3.5" />
          </svg>
        )}
      </span>

      {/* 헤더: 프로필 아바타 + 이름/경력 */}
      <div className="flex items-center gap-3 pr-8">
        <PartnerAvatar
          name={card.name}
          avatarUrl={card.avatarUrl}
          className="w-12 h-12 text-lg font-bold"
          fallbackClassName="bg-black text-white"
        />
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-black">{card.name}</span>
            <span className="text-xs text-[#4b4b4b]">
              경력 {card.yearsOfExperience}년
            </span>
          </div>
        </div>
      </div>

      {/* Quote */}
      <p className="text-sm text-[#4b4b4b] leading-snug">
        &ldquo;{card.bio}&rdquo;
      </p>

      {/* Divider */}
      <div className="h-px bg-[#efefef]" />

      {/* Trust metric + highlight pill */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[#4b4b4b]">{card.trustMetric}</p>
        <div className="flex">
          <HighlightPill>{highlightLabel}</HighlightPill>
        </div>
      </div>
    </button>
  );
}

function HighlightPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#efefef] text-black">
      {children}
    </span>
  );
}
