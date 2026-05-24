"use client";

import { useState } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Q5.5 — 자유 메모용 textarea + 전송. 가족 병력 등 PII 가능성으로 NO_TRACK_CLASS.
 *
 * 1줄 이상 입력될 가능성 있어 textarea. 비어있어도 (사용자가 마음 바뀜)
 * "건너뛰기" 별도 버튼으로 빠질 수 있게 하는 대신, Q5 단계에서 이미 분기
 * 처리됐으므로 Q5.5 에서는 비어있으면 전송 disable — 진짜로 비울 거면 뒤로
 * 돌아가는 게 자연스러움 (현재 흐름엔 뒤로가기 UI 없으므로 무엇이라도 적게).
 */
export function TextareaInput({
  placeholder,
  maxLength = 1000,
  onSubmit,
}: {
  placeholder?: string;
  maxLength?: number;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const valid = value.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        rows={3}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // step1-wizard NotesFields 의 textarea 와 동일 톤 — border-black +
        // focus ring 10% 으로 또렷한 인풋 윤곽 유지 (회색 보더 보다 PII 입력
        // 임을 시각적으로 더 명확히).
        className={cn(
          "w-full resize-none rounded-lg border border-black px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/10",
          NO_TRACK_CLASS,
        )}
        autoFocus
      />
      <Button
        type="button"
        onClick={() => valid && onSubmit(value)}
        disabled={!valid}
        className="h-14 w-full rounded-full text-sm font-medium"
      >
        전송
      </Button>
    </div>
  );
}
