"use client";

import { PartnerAvatar } from "@/features/partners/ui/partner-avatar";
import { cn } from "@/lib/utils";

import type { PlanProposalData } from "./chart-types";

/**
 * 제안서 전환 탭 칩 — 아바타 + 설계사 이름. 선택 시 검정 반전.
 *
 * 결과 페이지의 sticky chip 탭과 랜딩 데모가 공유. 칩 버튼 1개만 책임지고,
 * 가로 스크롤 strip(`<ul>` / `<div>`) 은 호출자가 감싼다 — sticky 여부 등
 * 컨테이너 정책이 라우트마다 달라서다.
 *
 * 분석 미완료 제안서는 우측에 pulse dot.
 */
export function ProposalTabChip({
  proposal,
  selected,
  onSelect,
}: {
  proposal: PlanProposalData;
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
        name={proposal.partner.name}
        avatarUrl={proposal.partner.avatarUrl}
        className="h-7 w-7 text-xs font-bold"
        fallbackClassName={
          selected ? "bg-white text-black" : "bg-black text-white"
        }
      />
      {proposal.partner.name}
      {!proposal.analyzed && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full animate-pulse",
            selected ? "bg-white" : "bg-[#4b4b4b]",
          )}
          aria-label="분석 중"
        />
      )}
    </button>
  );
}
