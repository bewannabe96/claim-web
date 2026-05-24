"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/features/plan-requests/ui/wizard-primitives";

/**
 * Chip 멀티선택 + 확인 버튼 — Q1.5 (focused concerns).
 *
 * `wizard-primitives` 의 Chip 을 그대로 재사용. 토글 시 selected 색 (검정 인버전)
 * 으로 시각 피드백. 최소 1개 선택되어야 확인 활성.
 */
export function ChipMulti<T extends string>({
  options,
  onConfirm,
  confirmLabel = "선택 완료",
}: {
  options: ReadonlyArray<{ label: string; value: T }>;
  onConfirm: (values: T[]) => void;
  confirmLabel?: string;
}) {
  const [selected, setSelected] = useState<T[]>([]);

  function toggle(v: T) {
    setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipGroup>
        {options.map((opt) => (
          <Chip
            key={opt.value}
            selected={selected.includes(opt.value)}
            onClick={() => toggle(opt.value)}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipGroup>
      <Button
        type="button"
        onClick={() => onConfirm(selected)}
        disabled={selected.length === 0}
        className="h-14 w-full rounded-full text-sm font-medium"
      >
        {confirmLabel}
        {selected.length > 0 ? ` (${selected.length})` : ""}
      </Button>
    </div>
  );
}
