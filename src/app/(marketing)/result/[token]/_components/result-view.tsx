"use client";

import { useMemo, useState } from "react";

import type { ProposalCard } from "@/features/proposals/queries";
import {
  REFUND_TYPE_LABEL,
  RENEWAL_TYPE_LABEL,
} from "@/features/proposals/schema";
import { cn } from "@/lib/utils";
import { INSURANCE_CATEGORY_LABEL } from "@/types";

type SortKey = "premium" | "coverage";

const SORT_LABELS: Record<SortKey, string> = {
  premium: "월 보험료 낮은 순",
  coverage: "총 보장 큰 순",
};

/**
 * 결과 화면 본체 — 진설계 카드 비교 + 정렬 토글 + 즉시 문자 CTA.
 *
 * 모바일 480px 컨테이너에 맞춰 카드 리스트로 구성. 비교표는 가독성이 떨어져서
 * 카드 안에서 핵심 지표를 큰 글자로 강조 + 부가 정보는 메타 라인으로 압축.
 */
export function ResultView({ cards }: { cards: ProposalCard[] }) {
  const [sort, setSort] = useState<SortKey>("premium");
  const [contactedAgentId, setContactedAgentId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...cards];
    if (sort === "premium") {
      copy.sort((a, b) => a.proposal.monthlyPremium - b.proposal.monthlyPremium);
    } else {
      copy.sort((a, b) => b.proposal.totalCoverage - a.proposal.totalCoverage);
    }
    return copy;
  }, [cards, sort]);

  const insights = useMemo(() => deriveInsights(cards), [cards]);

  if (cards.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center text-center gap-3">
        <p className="text-sm text-[#4b4b4b]">
          아직 도착한 진설계가 없어요. 도착하면 알림톡으로 알려드릴게요.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      {/* AI 분석 요약 — PRD §5.5 의 자리. MVP 는 데이터에서 직접 derive. */}
      {insights && (
        <section className="rounded-xl bg-black text-white p-5 flex flex-col gap-2.5">
          <p className="text-xs font-medium tracking-wide text-[#afafaf]">
            한눈에 보기
          </p>
          <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
            {insights.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-white shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 정렬 토글 */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={cn(
              "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors",
              sort === key
                ? "bg-black text-white"
                : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
            )}
          >
            {SORT_LABELS[key]}
          </button>
        ))}
      </div>

      {/* 카드 리스트 */}
      <ul className="flex flex-col gap-4">
        {sorted.map((card, idx) => (
          <li key={card.proposal.id}>
            <ProposalCardView
              card={card}
              rank={sort === "premium" ? idx : undefined}
              contacted={contactedAgentId === card.agent.id}
              onContact={() => setContactedAgentId(card.agent.id)}
            />
          </li>
        ))}
      </ul>

      <p className="pt-2 text-xs text-[#afafaf] text-center">
        결과는 7일간 유지돼요
      </p>
    </div>
  );
}

/* ============================================================
 * 진설계 카드 — 설계사 + 핵심 수치 + 핵심 담보 + CTA
 * ============================================================ */

function ProposalCardView({
  card,
  rank,
  contacted,
  onContact,
}: {
  card: ProposalCard;
  /** "월 보험료 낮은 순" 정렬일 때만 0 = 최저가 표시 */
  rank?: number;
  contacted: boolean;
  onContact: () => void;
}) {
  const { proposal, agent } = card;
  const initial = agent.name.charAt(0);

  return (
    <article className="rounded-xl bg-white shadow-[0_4px_16px_rgba(0,0,0,0.12)] overflow-hidden">
      {/* 헤더: 설계사 정보 + (옵션) 최저가 라벨 */}
      <header className="px-5 pt-5 pb-4 flex items-start gap-3">
        <div className="flex items-center justify-center w-11 h-11 rounded-full bg-black text-white text-base font-bold shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-bold text-black">{agent.name}</span>
            <span className="text-xs text-[#4b4b4b]">
              경력 {agent.yearsOfExperience}년
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {agent.specialties.map((s) => (
              <span
                key={s}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#efefef] text-black"
              >
                {INSURANCE_CATEGORY_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        {rank === 0 && (
          <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-black text-white">
            최저가
          </span>
        )}
      </header>

      {/* 핵심 수치 — 월 보험료 강조 */}
      <div className="px-5 py-4 bg-[#f8f8f8]">
        <p className="text-xs text-[#4b4b4b]">월 보험료</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight text-black">
          {formatCurrency(proposal.monthlyPremium)}
          <span className="ml-1 text-sm font-medium text-[#4b4b4b]">원</span>
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-[#4b4b4b]">
          <span>
            총 보장{" "}
            <span className="font-semibold text-black">
              {formatLargeAmount(proposal.totalCoverage)}
            </span>
          </span>
          <span className="h-3 w-px bg-[#e2e2e2]" />
          <span>
            납입기간{" "}
            <span className="font-semibold text-black">
              {proposal.paymentYears}년
            </span>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <MetaPill>{RENEWAL_TYPE_LABEL[proposal.renewalType]}</MetaPill>
          <MetaPill>{REFUND_TYPE_LABEL[proposal.refundType]}</MetaPill>
        </div>
      </div>

      {/* 핵심 담보 */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-[#4b4b4b]">핵심 담보</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {[proposal.keyBenefit1, proposal.keyBenefit2, proposal.keyBenefit3].map(
            (b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-black">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-black shrink-0" />
                <span>{b}</span>
              </li>
            ),
          )}
        </ul>

        {proposal.note && (
          <p className="mt-4 text-sm text-[#4b4b4b] leading-relaxed">
            &ldquo;{proposal.note}&rdquo;
          </p>
        )}

        {/* PDF 표시 — MVP 는 파일명만 */}
        <div className="mt-4 flex items-center gap-2 text-xs text-[#4b4b4b]">
          <PdfIcon />
          <span className="truncate">{proposal.pdfFileName}</span>
        </div>
      </div>

      {/* CTA — 설계사에게 즉시 문자. 누르면 contacted 상태로 락 (재발신 방지). */}
      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={onContact}
          disabled={contacted}
          className={cn(
            "w-full h-12 rounded-full text-sm font-medium transition-colors",
            contacted
              ? "bg-[#efefef] text-[#4b4b4b] cursor-default"
              : "bg-black text-white hover:bg-[#1a1a1a]",
          )}
        >
          {contacted
            ? "문자 요청을 보냈어요"
            : `${agent.name} 설계사에게 문자 받기`}
        </button>
      </div>
    </article>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-[#e2e2e2] text-[#4b4b4b]">
      {children}
    </span>
  );
}

function PdfIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/* ============================================================
 * 인사이트 derivation — 데이터에서 직접 추출. AI 호출 자리는 추후 §5.5.
 * ============================================================ */

function deriveInsights(cards: ProposalCard[]): string[] | null {
  if (cards.length === 0) return null;

  const lines: string[] = [];

  const cheapest = cards.reduce((acc, c) =>
    c.proposal.monthlyPremium < acc.proposal.monthlyPremium ? c : acc,
  );
  const widest = cards.reduce((acc, c) =>
    c.proposal.totalCoverage > acc.proposal.totalCoverage ? c : acc,
  );

  if (cards.length >= 2) {
    lines.push(
      `월 보험료가 가장 낮은 건 ${cheapest.agent.name} 설계사 (${formatCurrency(cheapest.proposal.monthlyPremium)}원)`,
    );
  }

  if (widest.proposal.id !== cheapest.proposal.id) {
    lines.push(
      `보장 규모가 가장 큰 건 ${widest.agent.name} 설계사 (${formatLargeAmount(widest.proposal.totalCoverage)})`,
    );
  }

  const nonRenewable = cards.filter(
    (c) => c.proposal.renewalType === "non_renewable",
  );
  if (nonRenewable.length > 0 && nonRenewable.length < cards.length) {
    lines.push(
      `비갱신형 진설계는 ${nonRenewable.length}건 — 평생 동일 보험료를 원하시면 참고하세요`,
    );
  }

  return lines.length > 0 ? lines : null;
}

/* ============================================================
 * formatters
 * ============================================================ */

function formatCurrency(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 250000000 → "2억 5천만원" 식 표기 — 모바일 가독성 */
function formatLargeAmount(n: number): string {
  if (n >= 100000000) {
    const eok = Math.floor(n / 100000000);
    const remainder = n % 100000000;
    if (remainder === 0) return `${eok}억원`;
    const cheonman = Math.floor(remainder / 10000000);
    if (cheonman > 0 && remainder % 10000000 === 0) {
      return `${eok}억 ${cheonman}천만원`;
    }
    return `${eok}억 ${(remainder / 10000).toLocaleString("ko-KR")}만원`;
  }
  if (n >= 10000) {
    return `${(n / 10000).toLocaleString("ko-KR")}만원`;
  }
  return `${n.toLocaleString("ko-KR")}원`;
}
