"use client";

import { useActionState, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { finalizeRequest, sendOtp } from "@/features/requests/actions";
import { cn } from "@/lib/utils";

/**
 * 본인 인증 + 동의 (단일 페이지).
 *
 * 흐름: 후보 선택 → 이 화면 → dispatched.
 * 진설계 정보는 모두 Step1 에서 수집되므로 여기서는 휴대폰 번호 + 동의 + OTP 만 받음.
 */

type FormState = {
  name: string;
  /** digits only — 11자리 (010xxxxxxxx) */
  phone: string;
  /** 6자리 OTP — digits only */
  otpCode: string;
  consentThirdParty: boolean;
  consentMessaging: boolean;
};

function formatPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function isValidPhone(p: string): boolean {
  return /^01\d{8,9}$/.test(p);
}

export function ConfirmWizard({
  requestId,
  selectedCount,
}: {
  requestId: string;
  selectedCount: number;
}) {
  const [data, setData] = useState<FormState>({
    name: "",
    phone: "",
    otpCode: "",
    consentThirdParty: false,
    consentMessaging: false,
  });

  const [otpSent, setOtpSent] = useState(false);
  const [sendOtpError, setSendOtpError] = useState<string | null>(null);
  const [sendingOtp, startSendOtpTransition] = useTransition();

  const finalizeWithId = finalizeRequest.bind(null, requestId);
  const [state, formAction, pending] = useActionState(
    finalizeWithId,
    undefined,
  );

  const phoneValid = isValidPhone(data.phone);
  const nameValid = data.name.trim().length > 0 && data.name.length <= 20;
  const canSubmit =
    nameValid &&
    phoneValid &&
    otpSent &&
    data.otpCode.length === 6 &&
    data.consentThirdParty &&
    data.consentMessaging;

  function handleSendOtp() {
    if (!phoneValid || sendingOtp) return;
    setSendOtpError(null);

    const fd = new FormData();
    fd.append("phone", data.phone);

    startSendOtpTransition(async () => {
      const result = await sendOtp(requestId, undefined, fd);
      if (result?.ok) {
        setOtpSent(true);
      } else {
        const msg =
          result?.errors?._form?.[0] ??
          result?.errors?.phone?.[0] ??
          "전송에 실패했어요. 잠시 후 다시 시도해주세요.";
        setSendOtpError(msg);
      }
    });
  }

  function setPhone(digits: string) {
    setData((d) => ({ ...d, phone: digits, otpCode: "" }));
    setOtpSent(false);
    setSendOtpError(null);
  }

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <BrandMark />
      <p className="mt-2 text-xs text-[#4b4b4b]">
        선택하신{" "}
        <span className="font-semibold text-black">설계사 {selectedCount}명</span>
        에게 진설계를 요청해요
      </p>

      <div className="mt-10 flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-black leading-tight">
          본인 인증 후 바로 시작해요
        </h1>
        <p className="text-sm text-[#4b4b4b]">
          휴대폰 번호로 인증하면 결과를 카카오 알림톡으로 받을 수 있어요
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-5">
        {/* 이름 */}
        <Field label="이름">
          <Input
            type="text"
            maxLength={20}
            placeholder="홍길동"
            value={data.name}
            onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
            className="h-14 px-4 text-base"
            autoComplete="name"
          />
        </Field>

        {/* 휴대폰 번호 + 인증번호 전송 */}
        <Field label="휴대폰 번호">
          <div className="flex gap-2">
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="010-1234-5678"
              maxLength={13}
              value={formatPhoneDisplay(data.phone)}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))
              }
              className="h-14 px-4 text-base tracking-wider flex-1"
            />
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={!phoneValid || sendingOtp}
              className={cn(
                "shrink-0 h-14 px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                phoneValid && !sendingOtp
                  ? "bg-black text-white hover:bg-[#1a1a1a]"
                  : "bg-[#efefef] text-[#afafaf] cursor-not-allowed",
              )}
            >
              {sendingOtp ? "전송 중..." : otpSent ? "재전송" : "인증번호 전송"}
            </button>
          </div>
          {sendOtpError && (
            <p className="mt-2 text-xs text-red-600">{sendOtpError}</p>
          )}
        </Field>

        {/* 인증번호 입력 — 발송 후 노출 */}
        {otpSent && (
          <Field label="인증번호 6자리">
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={data.otpCode}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  otpCode: e.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              className="h-14 px-4 text-base tracking-[0.4em] text-center"
              autoFocus
            />
            {state?.errors?.code?.[0] ? (
              <p className="mt-2 text-xs text-red-600">
                {state.errors.code[0]}
              </p>
            ) : (
              <p className="mt-2 text-xs text-[#4b4b4b]">
                MVP 데모 — 인증번호는{" "}
                <span className="font-semibold text-black">000000</span> 으로 들어가요
              </p>
            )}
          </Field>
        )}

        {/* 동의 항목 */}
        <div className="flex flex-col gap-3 pt-2">
          <ConsentRow
            checked={data.consentThirdParty}
            onChange={(v) => setData((d) => ({ ...d, consentThirdParty: v }))}
            label="선택한 설계사에게 정보 제공"
            required
            description="입력한 정보가 선택한 설계사들에게 전달됩니다. 설계사는 진설계 작성 목적으로만 사용해요."
          />
          <ConsentRow
            checked={data.consentMessaging}
            onChange={(v) => setData((d) => ({ ...d, consentMessaging: v }))}
            label="결과 알림톡 수신"
            required
            description="진설계 결과를 카카오 알림톡으로 받아요."
          />
        </div>
      </div>

      {state?.errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">
          {state.errors._form[0]}
        </p>
      )}

      {/* CTA */}
      <form action={formAction} className="pt-6 mt-auto">
        {data.consentThirdParty && (
          <input type="hidden" name="consentThirdParty" value="on" />
        )}
        {data.consentMessaging && (
          <input type="hidden" name="consentMessaging" value="on" />
        )}
        <input type="hidden" name="name" value={data.name} />
        <input type="hidden" name="phone" value={data.phone} />
        <input type="hidden" name="code" value={data.otpCode} />
        <Button
          type="submit"
          disabled={!canSubmit || pending}
          className="w-full h-14 rounded-full text-base font-medium"
        >
          {pending ? "확인 중..." : "본인 인증 완료"}
        </Button>
      </form>
    </main>
  );
}

/* ============================================================
 * 보조 컴포넌트
 * ============================================================ */

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

function ConsentRow({
  checked,
  onChange,
  label,
  description,
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  required?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full text-left rounded-xl bg-white p-4 flex flex-col gap-1.5 transition-all border",
        checked ? "border-black bg-[#fafafa]" : "border-[#e2e2e2]",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded-md transition-colors shrink-0",
            checked ? "bg-black text-white" : "border border-[#afafaf] bg-white",
          )}
          aria-hidden
        >
          {checked && (
            <svg
              viewBox="0 0 12 12"
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 6.5L5 9.5L10 3.5" />
            </svg>
          )}
        </span>
        <span className="text-sm font-medium text-black">
          {label}
          {required && (
            <span className="ml-1 text-[#4b4b4b] font-normal">(필수)</span>
          )}
        </span>
      </div>
      <p className="ml-8 text-xs text-[#4b4b4b] leading-relaxed">
        {description}
      </p>
    </button>
  );
}
