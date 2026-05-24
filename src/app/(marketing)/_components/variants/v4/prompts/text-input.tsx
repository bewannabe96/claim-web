"use client";

import { useState } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 자유텍스트 1줄 입력 — Q3 (직업) / Q6 (이름) / Q8 (전화번호) / Q9 (OTP).
 *
 * 모든 자유텍스트가 PII 가능성 있어 input 자체에 NO_TRACK_CLASS. Enter 키로
 * 제출 + 우측 "전송" 버튼 둘 다 지원.
 *
 * placeholder / inputMode / maxLength / 검증 함수를 외부에서 prop 으로 받아
 * 위젯 자체는 dumb.
 */
export function TextInput({
  placeholder,
  inputMode = "text",
  maxLength,
  autoComplete,
  validate,
  transform,
  submitLabel = "전송",
  onSubmit,
}: {
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  maxLength?: number;
  autoComplete?: string;
  /** 빈 값/형식 오류면 false. 기본은 trim 후 길이 > 0. */
  validate?: (value: string) => boolean;
  /** input 의 raw value 를 정규화 (예: phone digits only). */
  transform?: (raw: string) => string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const isValid = (validate ?? defaultValidate)(value);

  function handleSubmit() {
    if (!isValid) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex gap-2"
    >
      <Input
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) =>
          setValue(transform ? transform(e.target.value) : e.target.value)
        }
        autoComplete={autoComplete}
        // step1-wizard / confirm-wizard Input 톤 (h-14 px-4 text-sm) 과 정합.
        // 챗봇 슬롯에서도 시각 위계는 같은 단일소스.
        className={cn("h-14 flex-1 px-4 text-sm", NO_TRACK_CLASS)}
        autoFocus
      />
      <Button
        type="submit"
        disabled={!isValid}
        className="h-14 shrink-0 rounded-lg px-5 text-sm font-medium"
      >
        {submitLabel}
      </Button>
    </form>
  );
}

function defaultValidate(v: string): boolean {
  return v.trim().length > 0;
}
