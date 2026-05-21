"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  requestPartnerSignupOtp,
  verifyPartnerSignupOtp,
} from "../../actions";

/**
 * Step 2 본인인증 폼 — invitation.phone 으로 알리고 SMS 발송 → 6자리 OTP 검증.
 *
 * 진입 게이트: verify 페이지가 Kakao 세션 + invitation.linkedAuthId 매칭을 검증.
 * 액션 자체도 동일 검증을 자체 수행 (server action 은 layout 게이트 미적용).
 *
 * 이름·휴대폰: invitation prefill, readonly (수정 불가) — 발송 대상이 고정되어
 * 횡령 방지 게이트가 됨.
 * 인증번호 발송: 누르면 server action 이 알리고로 코드 SMS, Redis 에 EX=180 저장.
 *   응답의 retryAfterSeconds 로 클라 쿨다운 타이머 동기화.
 * 확인: OTP 6자리 입력 후 활성. 통과 시 server action 이 단일 트랜잭션으로
 *   user + partner INSERT + invitation 소비 후 `/partner` 로 redirect.
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
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [verifying, startVerifying] = useTransition();
  // 재전송 쿨다운 — 서버가 알려준 잔여 초로 초기화, 1초씩 감소. 0 도달 시 재전송 가능.
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onSend = () => {
    if (sending || cooldown > 0) return;
    setSendError(null);
    setVerifyError(null);
    startSending(async () => {
      const result = await requestPartnerSignupOtp(token);
      if (result.ok) {
        setOtpSent(true);
        setCooldown(result.retryAfterSeconds);
        // 다음 tick 에 OTP input mount 후 focus.
        setTimeout(() => codeRef.current?.focus(), 0);
      } else {
        setSendError(result.error);
        // 쿨다운 에러일 때 서버가 잔여 초를 알려주면 타이머 초기화 — 정확한 카운트다운.
        if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          setCooldown(result.retryAfterSeconds);
        }
      }
    });
  };

  const onVerify = () => {
    setVerifyError(null);
    startVerifying(async () => {
      // 성공 시 server action 이 `/partner` 로 redirect 를 throw → 이 라인 도달 안 함.
      const result = await verifyPartnerSignupOtp(token, code);
      if (!result.ok) setVerifyError(result.error);
    });
  };

  const canVerify = otpSent && code.length === 6 && !verifying;

  return (
    <section className="mt-8 flex flex-col gap-5">
      <Field label="이름">
        <Input
          value={name}
          disabled
          className="h-14 px-4 text-sm bg-[#fafafa] text-black disabled:bg-[#fafafa] disabled:text-black disabled:opacity-100"
        />
      </Field>

      <Field label="휴대폰 번호">
        <div className="flex gap-2">
          <Input
            value={formatPhone(phone)}
            disabled
            className="h-14 px-4 text-sm tracking-wider flex-1 bg-[#fafafa] text-black disabled:bg-[#fafafa] disabled:text-black disabled:opacity-100"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || cooldown > 0}
            className={cn(
              "shrink-0 h-14 px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              !sending && cooldown === 0
                ? "bg-black text-white hover:bg-[#1a1a1a]"
                : "bg-[#efefef] text-[#afafaf] cursor-not-allowed",
            )}
          >
            {sending
              ? "전송 중..."
              : cooldown > 0
                ? `${cooldown}초 후 재전송`
                : otpSent
                  ? "재전송"
                  : "인증번호 전송"}
          </button>
        </div>
        {sendError && (
          <p className="mt-2 text-xs text-red-600">{sendError}</p>
        )}
      </Field>

      {otpSent && (
        <Field label="인증번호 6자리">
          <Input
            ref={codeRef}
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="h-14 px-4 text-sm tracking-[0.4em] text-center"
          />
          {verifyError && (
            <p className="mt-2 text-xs text-red-600">{verifyError}</p>
          )}
        </Field>
      )}

      <Button
        type="button"
        onClick={onVerify}
        disabled={!canVerify}
        className="mt-2 w-full h-14 rounded-full text-base font-medium"
      >
        {verifying ? "확인 중..." : "본인인증하고 가입 완료"}
      </Button>
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
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-black">{label}</label>
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
