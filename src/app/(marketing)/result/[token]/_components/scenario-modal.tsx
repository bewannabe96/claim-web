"use client";

import { useEffect, useMemo, useState } from "react";

import { labelForCategory } from "@/features/proposals/category-labels";
import type { ScenarioCard } from "@/features/proposals/select-scenarios";
import { cn } from "@/lib/utils";

/* ============================================================
 * 시나리오 모달 — 모든 카테고리를 한글 가나다순 단일 리스트로.
 *
 *  - 검색: 일반 substring + 한글 초성 매칭 ("ㅍ" → "폐암"). 자모만 입력하면
 *    라벨의 초성과 비교, 아니면 일반 substring.
 *  - row: 라벨만 노출 (보장액/담보건수 X). 미보장 카테고리는 disabled + 흐릿.
 *  - border 카드 대신 divide-y 단순 리스트 — 24개 row 답답함 해소.
 *  - "선택" trailing 텍스트 제거 — hover/clickability 만으로 인지.
 * ============================================================ */

export function ScenarioModal({
  open,
  onClose,
  cards,
  onSelect,
  title = "질병",
}: {
  open: boolean;
  onClose: () => void;
  cards: ScenarioCard[];
  /** 행 클릭 시 호출 (있을 때). 호출 후 모달은 호출자가 close. */
  onSelect?: (category: string) => void;
  title?: string;
}) {
  const [query, setQuery] = useState("");

  // ESC 닫기 + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const filtered = useMemo(() => filterByQuery(cards, query), [cards, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 배경 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      {/* 패널 — 모바일 bottom sheet, 데스크탑 centered.
        * radius: DESIGN "Comfortable 12px" (rounded-xl). shadow: Level 2 whisper. */}
      <div className="relative w-full max-w-[480px] max-h-[85vh] flex flex-col bg-white rounded-t-xl sm:rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.16)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#efefef]">
          {/* DESIGN: Small Heading 20px UberMove Bold — 모달 위계에 맞춤. */}
          <h2 className="text-xl font-bold text-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-[#f3f3f3] text-[#4b4b4b]"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-3 border-b border-[#efefef]">
          {/* 검색은 chip 변형 — Chip Gray bg + 999px pill. */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="질병 검색 (예: 폐암, ㅍㅇ)"
            className="w-full h-10 px-4 rounded-full bg-[#efefef] text-sm placeholder:text-[#afafaf] focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-[#afafaf] py-12">
              &ldquo;{query}&rdquo; 와 일치하는 질병이 없어요.
            </p>
          ) : (
            <ul className="divide-y divide-[#efefef]">
              {filtered.map((card) => {
                const covered = card.payout.coverage_count > 0;
                return (
                  <li key={card.category}>
                    <button
                      type="button"
                      onClick={() =>
                        covered && onSelect?.(card.category)
                      }
                      disabled={!covered}
                      className={cn(
                        "w-full px-5 py-3 text-left text-sm transition-colors",
                        covered
                          ? "text-black hover:bg-[#f3f3f3] cursor-pointer"
                          : "text-[#afafaf] cursor-not-allowed",
                      )}
                    >
                      {labelForCategory(card.category)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 검색 매칭 — 한글 자소(자모) 분리 substring + 초성 fallback
 *
 *  1. 라벨/검색어를 모두 자모(초성+중성+종성) 시퀀스로 분해 → substring 매칭.
 *     "폐" → "ㅍㅖ" / "폐암" → "ㅍㅖㅇㅏㅁ".
 *     → "ㅍ", "ㅍㅖ", "폐", "폐암" 모두 "폐암" 매칭.
 *  2. 그래도 미매칭이면, query 가 초성 자모로만 구성된 경우 초성 substring
 *     으로도 비교 — "ㅍㅇ" → 라벨 초성 "ㅍㅇ" 매칭.
 *  3. 영문/숫자/혼합은 일반 lowercase substring 으로 처리됨 (자모 분해 함수가
 *     비-한글 음절은 그대로 통과).
 * ============================================================ */

const CHOSUNG = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
];
const JUNGSUNG = [
  "ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ",
];
const JONGSUNG = [
  "","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
];
const CHOSUNG_SET = new Set(CHOSUNG);
const HANGUL_SYLLABLE_BASE = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const SYLLABLE_BLOCK = 588; // 28 종성 × 21 중성

/** 한글 음절 → 자모(초성+중성+종성) 시퀀스. 종성 없으면 skip. 비-한글은 그대로. */
function decomposeJamo(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_SYLLABLE_BASE && code <= HANGUL_SYLLABLE_END) {
      const sIdx = code - HANGUL_SYLLABLE_BASE;
      const cho = Math.floor(sIdx / SYLLABLE_BLOCK);
      const jung = Math.floor((sIdx % SYLLABLE_BLOCK) / 28);
      const jong = sIdx % 28;
      out += CHOSUNG[cho] + JUNGSUNG[jung];
      if (jong > 0) out += JONGSUNG[jong];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 한글 음절 → 초성만. 비-한글은 그대로. ("ㅍㅇ" 초성 fallback 용) */
function toChosung(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_SYLLABLE_BASE && code <= HANGUL_SYLLABLE_END) {
      out += CHOSUNG[Math.floor((code - HANGUL_SYLLABLE_BASE) / SYLLABLE_BLOCK)];
    } else {
      out += ch;
    }
  }
  return out;
}

function isChosungOnly(text: string): boolean {
  if (text.length === 0) return false;
  for (const ch of text) {
    if (!CHOSUNG_SET.has(ch)) return false;
  }
  return true;
}

function filterByQuery(
  cards: ScenarioCard[],
  rawQuery: string,
): ScenarioCard[] {
  const q = rawQuery.trim();
  if (!q) return cards;

  const qJamo = decomposeJamo(q).toLowerCase();
  const qChosungFallback = isChosungOnly(q) ? q : null;

  return cards.filter((c) => {
    const label = labelForCategory(c.category);
    const labelJamo = decomposeJamo(label).toLowerCase();
    if (labelJamo.includes(qJamo)) return true;
    if (qChosungFallback && toChosung(label).includes(qChosungFallback)) {
      return true;
    }
    return false;
  });
}
