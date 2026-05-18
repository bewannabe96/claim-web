"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  requestPartnerSignupOtp,
  verifyPartnerSignupOtp,
} from "../actions";

/**
 * Step 1 본인인증 폼 — 이름/주민번호/휴대폰 입력 + OTP 발송/검증.
 *
 * 이름·휴대폰: invitation prefill, readonly (수정 불가).
 * 주민번호: 사용자 입력 (앞 6 / 뒤 1). 6자리 채우면 자동 focus → 뒤 1자리.
 * 인증번호 발송: 주민번호 형식 통과 후 활성. 누르면 OTP 입력 칸 노출.
 * 확인: OTP 6자리 입력 후 활성. 통과 시 router.refresh() → 페이지가 Step 2 분기.
 *
 * PortOne 연동 전 placeholder — 서버 액션은 production 환경에서 fail-closed.
 */
export function VerifyForm({
  token,
  name,
  phone,
}: {
  token: string;
  name: string;
  phone: string;
}) {
  const router = useRouter();
  const [rrnFront, setRrnFront] = useState("");
  const [rrnBack, setRrnBack] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [verifying, startVerifying] = useTransition();

  const rrnBackRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const rrnFormatOk =
    /^\d{6}$/.test(rrnFront) && /^\d$/.test(rrnBack);

  const onRrnFrontChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setRrnFront(digits);
    if (digits.length === 6) rrnBackRef.current?.focus();
  };

  const onSend = () => {
    setError(null);
    startSending(async () => {
      const result = await requestPartnerSignupOtp(token, rrnFront, rrnBack);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOtpSent(true);
      // 다음 tick 에 OTP input mount 후 focus.
      setTimeout(() => codeRef.current?.focus(), 0);
    });
  };

  const onVerify = () => {
    setError(null);
    startVerifying(async () => {
      const result = await verifyPartnerSignupOtp(token, code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="mt-8 flex flex-col gap-5">
      <Field label="이름">
        <Input
          value={name}
          disabled
          className="h-11 bg-[#fafafa] text-black disabled:bg-[#fafafa] disabled:text-black disabled:opacity-100"
        />
      </Field>

      <Field label="주민등록번호">
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={rrnFront}
            onChange={(e) => onRrnFrontChange(e.target.value)}
            placeholder="앞 6자리"
            className="h-11 flex-1"
          />
          <span className="text-[#afafaf]">-</span>
          <Input
            ref={rrnBackRef}
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            value={rrnBack}
            onChange={(e) =>
              setRrnBack(e.target.value.replace(/\D/g, "").slice(0, 1))
            }
            placeholder=""
            className="h-11 w-12 text-center"
          />
          <span
            className="text-[#afafaf] tracking-[0.3em] select-none"
            aria-hidden="true"
          >
            ••••••
          </span>
        </div>
      </Field>

      <Field label="휴대폰">
        <div className="flex items-stretch gap-2">
          <Input
            value={formatPhone(phone)}
            disabled
            className="h-11 flex-1 bg-[#fafafa] text-black disabled:bg-[#fafafa] disabled:text-black disabled:opacity-100"
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={!rrnFormatOk || sending}
            className="h-11 rounded-full px-5 text-sm font-medium shrink-0"
          >
            {sending ? "발송 중..." : otpSent ? "재발송" : "인증번호 발송"}
          </Button>
        </div>
      </Field>

      {otpSent && (
        <Field label="인증번호">
          <div className="flex items-stretch gap-2">
            <Input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6자리"
              className="h-11 flex-1 tracking-[0.4em]"
            />
            <Button
              type="button"
              onClick={onVerify}
              disabled={code.length !== 6 || verifying}
              className={cn(
                "h-11 rounded-full px-5 text-sm font-medium shrink-0",
              )}
            >
              {verifying ? "확인 중..." : "확인"}
            </Button>
          </div>
        </Field>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}

      <p className="text-[11px] text-[#afafaf] leading-relaxed">
        ⚠ PortOne 본인인증 연동 전 placeholder — dev 전용. 실 운영 환경에서는
        본인인증 서비스 결과로 검증됩니다.
      </p>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#4b4b4b]">{label}</label>
      {children}
    </div>
  );
}

/** 01012345678 → 010-1234-5678 (11자리) / 0123456789 → 012-345-6789 (10자리) */
function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}
