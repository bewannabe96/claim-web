"use client";

import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";

/**
 * 어드민 폼용 휴대폰 번호 입력 — 입력 시 자동으로 `010-1234-5678` 포맷을 적용.
 *
 * 시각적으로는 항상 dashes 가 들어간 상태를 보여주고, 폼 submit 값은 dashes
 * 가 제거된 digits-only — 서버 schema (`^01[0-9]{8,9}$`) 가 그대로 통과하므로
 * 액션 / 검증 코드는 변경하지 않는다.
 *
 * 구현: 보이는 `<Input>` 은 name 없이 formatted 값을 표시, 옆의 hidden input 이
 * 진짜 `name={name}` 으로 digits-only 값을 폼에 실어 보냄.
 *
 * defaultValue 는 digits-only 또는 dashes 섞인 문자열 모두 허용 — 내부에서
 * 비숫자를 모두 제거하므로 호출자는 raw 또는 formatted 어느 쪽이든 넘겨도 된다.
 *
 * `onDigitsBlur` — 보이는 input 의 blur 이벤트가 발생할 때 digits-only 값을
 * 받는 콜백. 예: partner-form 의 어드민 본인 phone lookup.
 */
type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange" | "onBlur" | "type" | "name"
> & {
  name: string;
  defaultValue?: string;
  onDigitsBlur?: (digits: string) => void;
};

export function PhoneInput({
  name,
  defaultValue,
  onDigitsBlur,
  placeholder = "010-1234-5678",
  inputMode = "numeric",
  autoComplete = "tel",
  ...rest
}: Props) {
  const [digits, setDigits] = useState<string>(() => sanitize(defaultValue ?? ""));

  return (
    <>
      <Input
        type="tel"
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        // maxLength 는 dashes 포함 13 (010-1234-5678).
        maxLength={13}
        value={formatDigits(digits)}
        onChange={(e) => setDigits(sanitize(e.target.value))}
        onBlur={() => onDigitsBlur?.(digits)}
        {...rest}
      />
      {/* 폼 submit 값 = digits-only. 서버 schema 가 dashes 를 받지 않음. */}
      <input type="hidden" name={name} value={digits} />
    </>
  );
}

/** 입력 문자열에서 숫자만 추출하고 11자리로 자른다. */
function sanitize(s: string): string {
  return s.replace(/\D/g, "").slice(0, 11);
}

/**
 * digits-only → 단계적 `xxx-xxxx-xxxx`. 부분 입력 중에도 자연스럽게 dashes 를
 * 채워 넣어 사용자가 항상 포맷된 모양을 본다.
 *
 *   ""           → ""
 *   "010"        → "010"
 *   "01012"      → "010-12"
 *   "0101234"    → "010-1234"
 *   "01012345"   → "010-1234-5"
 *   "01012345678"→ "010-1234-5678"
 *
 * 10자리 (구 011/016/...) 도 같은 3-4-N 모양으로 진행 — schema 는 10/11 모두 허용.
 */
function formatDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
