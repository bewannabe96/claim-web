"use client";

import { cn } from "@/lib/utils";

/**
 * 카드 2~3개 단일선택 — Q1 (의도) / Q4 (병력 유무) / Q5 (추가요청 유무).
 *
 * step1-wizard 의 IntentCard 와 동일 비주얼 (회색 풀폭 → 검정 선택). 클릭
 * 즉시 onSelect 발화 — 별도 "확인" 버튼 없음 (단일선택이므로 즉답).
 */
export function ChoiceCards<T extends string>({
  options,
}: {
  options: ReadonlyArray<{
    label: string;
    value: T;
    onSelect: () => void;
  }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={opt.onSelect}
          className={cn(
            "rounded-xl bg-[#efefef] px-5 py-4 text-left text-sm font-medium text-black",
            "transition-colors hover:bg-[#e2e2e2]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
