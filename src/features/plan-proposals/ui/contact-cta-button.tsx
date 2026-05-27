"use client";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { cn } from "@/lib/utils";

/**
 * 상담 진행하기 CTA — `ProposalResultView` 의 `bottomActionFor` slot 에 합성되는
 * pill button.
 *
 * 호출자가 props 만으로 모드를 결정 (route-agnostic):
 *   - 인터랙티브: `onClick` 전달, `contactRequested=false` → 검정 pill, 클릭 가능
 *   - 요청 완료: `contactRequested=true` → 회색 disabled + "상담 요청을 보냈어요"
 *   - 외부 disabled: `disabledNotice` 전달 → 회색 disabled + 버튼 위 인라인 안내.
 *     "왜 비활성인지" 는 호출자가 카피로 전달 (예: read-only preview wrapper).
 *
 * `disabledNotice` 가 있으면 `onClick` 은 무시됨 (외부 disabled 우선).
 *
 * 파트너명 span 만 `NO_TRACK_CLASS` 로 분석 제외 — 가입자↔설계사 매칭 식별 누출 방지.
 * 버튼 click 자체 (funnel 핵심 conversion) 는 추적 유지.
 */
export function ContactCtaButton({
  partnerName,
  contactRequested,
  onClick,
  disabledNotice,
}: {
  /** 활성 카드의 설계사 이름. CardMeta.partner.name. */
  partnerName: string;
  /** SSR `card.contactRequested` + (인터랙티브 모드에서) 클라이언트 optimistic state. */
  contactRequested: boolean;
  /** 인터랙티브 모드에서만 전달. `disabledNotice` 와 동시 전달 시 disabled 우선. */
  onClick?: () => void;
  /** 전달되면 disabled + 버튼 위 작은 인라인 안내. read-only 진입점에서 사용. */
  disabledNotice?: string;
}) {
  const externallyDisabled = disabledNotice != null;
  const disabled = externallyDisabled || contactRequested;

  const button = (
    <button
      type="button"
      onClick={externallyDisabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "w-full h-14 rounded-full text-base font-medium transition-colors",
        disabled
          ? "bg-[#efefef] text-[#4b4b4b] cursor-default"
          : "bg-black text-white hover:bg-[#1a1a1a]",
      )}
    >
      {contactRequested ? (
        "상담 요청을 보냈어요"
      ) : (
        <>
          <span className={NO_TRACK_CLASS}>{partnerName}</span> 설계사와
          상담 진행하기
        </>
      )}
    </button>
  );

  if (externallyDisabled) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-center text-[10px] text-[#afafaf]">{disabledNotice}</p>
        {button}
      </div>
    );
  }
  return button;
}
