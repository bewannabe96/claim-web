"use client";

import type { CardMeta } from "@/features/plan-proposals/card-meta";
import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { cn } from "@/lib/utils";

/**
 * 제안서 전환 탭 칩 — 아바타 + 설계사 이름. 선택 시 검정 반전.
 *
 * `CardMeta` 만 받음 — 분석 리포트 버전 무관. 결과 페이지의 sticky chip 탭과
 * 랜딩 데모가 공유. 칩 버튼 1개만 책임지고, 가로 스크롤 strip(`<ul>` / `<div>`)
 * 은 호출자가 감싼다.
 *
 * 분석 미완료 카드는 우측에 dot — 진행 중이면 pulse, "분석 건너뜀" 이면 정적.
 */
export function ProposalTabChip({
  card,
  selected,
  onSelect,
}: {
  card: CardMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full py-1 pr-4 pl-1 text-sm font-medium whitespace-nowrap transition-colors",
        selected
          ? "bg-black text-white"
          : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
      )}
    >
      <PartnerAvatar
        name={card.partner.name}
        avatarUrl={card.partner.avatarUrl}
        className="h-7 w-7 text-xs font-bold"
        fallbackClassName={
          selected ? "bg-white text-black" : "bg-black text-white"
        }
      />
      {card.partner.name}
      {!card.analyzed && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            // skip 은 회복 안 되는 상태라 pulse 없이 정적 dot — UX 톤이 다름.
            card.analysisSkipped ? "" : "animate-pulse",
            selected ? "bg-white" : "bg-[#4b4b4b]",
          )}
          aria-label={card.analysisSkipped ? "분석 불가" : "분석 중"}
        />
      )}
    </button>
  );
}
