"use client";

import { Chip, ChipGroup } from "@/features/plan-requests/ui/wizard-primitives";

/**
 * Chip 단일선택 — Q2 (보험료) 등.
 *
 * `wizard-primitives` 의 Chip 을 그대로 재사용해 step1-wizard 와 동일한
 * 픽셀/컬러/hover. 단일선택이라 클릭 즉시 onSelect 발화, selected state 는
 * 챗봇에선 즉시 user bubble 로 전이되므로 항상 false 로 렌더.
 */
export function ChipSingle<T extends string>({
  options,
}: {
  options: ReadonlyArray<{
    label: string;
    value: T;
    onSelect: () => void;
  }>;
}) {
  return (
    <ChipGroup>
      {options.map((opt) => (
        <Chip key={opt.value} selected={false} onClick={opt.onSelect}>
          {opt.label}
        </Chip>
      ))}
    </ChipGroup>
  );
}
