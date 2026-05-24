"use client";

import { useState } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Q8 — 휴대폰 번호 입력 + "확인" 버튼. 확인 클릭 시 sendOtp 트리거 (chatbot-shell
 * 이 그 직후 phase 를 PROC2_SENDING_OTP 로 전이 → 결과에 따라 Q9 or Q8 복귀).
 *
 * 별도 OtpInput 위젯이 Q9 에서 사용 (6자리 숫자 + 재전송).
 */
export function PhoneInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (phone: string) => void;
  disabled?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const valid = /^01\d{8,9}$/.test(phone);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !disabled) onSubmit(phone);
      }}
      className="flex gap-2"
    >
      <Input
        type="tel"
        inputMode="numeric"
        placeholder="010-1234-5678"
        maxLength={13}
        value={formatPhoneDisplay(phone)}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
        // confirm-wizard 휴대폰 input (h-14 px-4 text-sm tracking-wider) 과 정합.
        className={cn("h-14 flex-1 px-4 text-sm tracking-wider", NO_TRACK_CLASS)}
        autoFocus
        autoComplete="tel"
      />
      <Button
        type="submit"
        disabled={!valid || disabled}
        className="h-14 shrink-0 rounded-lg px-5 text-sm font-medium"
      >
        확인
      </Button>
    </form>
  );
}

/**
 * Q9 — OTP 6자리 입력 + 재전송 버튼. cooldown 초가 있으면 재전송 disabled +
 * 카운트다운 표시.
 */
export function OtpInput({
  cooldownSeconds,
  onSubmit,
  onResend,
}: {
  cooldownSeconds: number;
  onSubmit: (code: string) => void;
  onResend: () => void;
}) {
  const [code, setCode] = useState("");
  const valid = /^\d{6}$/.test(code);

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(code);
        }}
        className="flex gap-2"
      >
        <Input
          type="tel"
          inputMode="numeric"
          placeholder="000000"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          // confirm-wizard OTP input (h-14 px-4 text-sm tracking-[0.4em] text-center) 과 정합.
          className={cn(
            "h-14 flex-1 px-4 text-center text-sm tracking-[0.4em]",
            NO_TRACK_CLASS,
          )}
          autoFocus
          autoComplete="one-time-code"
        />
        <Button
          type="submit"
          disabled={!valid}
          className="h-14 shrink-0 rounded-lg px-5 text-sm font-medium"
        >
          확인
        </Button>
      </form>
      <button
        type="button"
        onClick={onResend}
        disabled={cooldownSeconds > 0}
        className={cn(
          "self-end text-xs underline-offset-4",
          cooldownSeconds > 0
            ? "cursor-not-allowed text-[#afafaf]"
            : "text-[#4b4b4b] hover:text-black hover:underline",
        )}
      >
        {cooldownSeconds > 0
          ? `${cooldownSeconds}초 후 재전송 가능`
          : "인증번호 재전송"}
      </button>
    </div>
  );
}

function formatPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
