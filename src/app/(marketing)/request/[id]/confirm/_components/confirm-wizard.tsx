"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { finalizeRequest, sendOtp } from "@/features/requests/actions";
import {
  FOCUSED_CONCERN_LABEL,
  type CoverageRequest,
  type Step1Input,
} from "@/features/requests/schema";
import { cn } from "@/lib/utils";

/**
 * 본인 인증 + 동의 (단일 페이지).
 *
 * 흐름: 후보 선택 → 이 화면 → dispatched.
 * 제안서 정보는 모두 Step1 에서 수집되므로 여기서는 휴대폰 번호 + 동의 + OTP 만 받음.
 */

type FormState = {
  name: string;
  /** 주민번호 앞 6자리 — YYMMDD */
  rrnFront: string;
  /** 주민번호 뒤 첫자리 — 1~4 (1900s 남/여, 2000s 남/여) */
  rrnBack1: string;
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

/**
 * RRN 클라이언트 유효성 — schema.ts 의 deriveRrn 와 동일 로직.
 * 서버가 진실의 원천이고, 여기서는 제출 버튼 disabled 제어용.
 */
function isValidRrn(front: string, back1: string): boolean {
  if (!/^\d{6}$/.test(front) || !/^[1-4]$/.test(back1)) return false;
  const yy = Number(front.slice(0, 2));
  const mm = Number(front.slice(2, 4));
  const dd = Number(front.slice(4, 6));
  const year = (back1 === "1" || back1 === "2" ? 1900 : 2000) + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === mm - 1 &&
    d.getUTCDate() === dd
  );
}

export function ConfirmWizard({
  requestId,
  selectedCount,
  step1,
}: {
  requestId: string;
  selectedCount: number;
  step1: Step1Input;
}) {
  const [data, setData] = useState<FormState>({
    name: "",
    rrnFront: "",
    rrnBack1: "",
    phone: "",
    otpCode: "",
    consentThirdParty: false,
    consentMessaging: false,
  });

  const [otpSent, setOtpSent] = useState(false);
  const [sendOtpError, setSendOtpError] = useState<string | null>(null);
  const [sendingOtp, startSendOtpTransition] = useTransition();
  // 재전송 쿨다운 — 서버가 알려준 잔여 초로 초기화, 1초씩 감소. 0 도달 시 재전송 가능.
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const finalizeWithId = finalizeRequest.bind(null, requestId);
  const [state, formAction, pending] = useActionState(
    finalizeWithId,
    undefined,
  );

  const phoneValid = isValidPhone(data.phone);
  const nameValid = data.name.trim().length > 0 && data.name.length <= 20;
  const rrnValid = isValidRrn(data.rrnFront, data.rrnBack1);
  const canSubmit =
    nameValid &&
    rrnValid &&
    phoneValid &&
    otpSent &&
    data.otpCode.length === 6 &&
    data.consentThirdParty &&
    data.consentMessaging;

  function handleSendOtp() {
    if (!phoneValid || sendingOtp || cooldown > 0) return;
    setSendOtpError(null);

    const fd = new FormData();
    fd.append("phone", data.phone);

    startSendOtpTransition(async () => {
      const result = await sendOtp(requestId, undefined, fd);
      if (result?.ok) {
        setOtpSent(true);
        setCooldown(result.retryAfterSeconds);
      } else {
        const msg =
          result?.errors?._form?.[0] ??
          result?.errors?.phone?.[0] ??
          "전송에 실패했어요. 잠시 후 다시 시도해주세요.";
        setSendOtpError(msg);
        // 쿨다운 에러일 때 서버가 잔여 초를 알려주면 타이머 초기화 — 정확한 카운트다운.
        if (result?.retryAfterSeconds && result.retryAfterSeconds > 0) {
          setCooldown(result.retryAfterSeconds);
        }
      }
    });
  }

  function setPhone(digits: string) {
    setData((d) => ({ ...d, phone: digits, otpCode: "" }));
    setOtpSent(false);
    setSendOtpError(null);
    setCooldown(0);
  }

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <BrandMark />
      <p className="mt-2 text-xs text-[#4b4b4b]">
        선택하신{" "}
        <span className="font-semibold text-black">설계사 {selectedCount}명</span>
        에게 제안서를 요청해요
      </p>

      <div className="mt-10 flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-black leading-tight">
          본인 인증 후 바로 시작해요
        </h1>
        <p className="text-sm text-[#4b4b4b]">
          휴대폰 번호로 인증하면 결과를 카카오 알림톡으로 받을 수 있어요
        </p>
      </div>

      <RequestSummary step1={step1} />

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

        {/* 주민등록번호 — 앞 6자리(YYMMDD) + 뒤 1자리(성별/세기).
            원본은 저장 X, birthDate + gender 만 derive. */}
        <Field label="주민등록번호">
          <div className="flex items-center gap-2">
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="YYMMDD"
              maxLength={6}
              value={data.rrnFront}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  rrnFront: e.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              className="h-14 px-4 text-base tracking-wider flex-1"
              aria-invalid={state?.errors?.rrnFront ? true : undefined}
              autoComplete="off"
            />
            <span className="text-[#afafaf]" aria-hidden>
              -
            </span>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={data.rrnBack1}
              onChange={(e) =>
                setData((d) => ({
                  ...d,
                  rrnBack1: e.target.value.replace(/\D/g, "").slice(0, 1),
                }))
              }
              className="h-14 px-3 text-base text-center w-12"
              aria-invalid={state?.errors?.rrnBack1 ? true : undefined}
              autoComplete="off"
            />
            <span
              className="text-[#afafaf] tracking-[0.2em] select-none"
              aria-hidden
            >
              ●●●●●●
            </span>
          </div>
          {state?.errors?.rrnFront?.[0] && (
            <p className="mt-2 text-xs text-red-600">
              {state.errors.rrnFront[0]}
            </p>
          )}
          {state?.errors?.rrnBack1?.[0] && (
            <p className="mt-2 text-xs text-red-600">
              {state.errors.rrnBack1[0]}
            </p>
          )}
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
              disabled={!phoneValid || sendingOtp || cooldown > 0}
              className={cn(
                "shrink-0 h-14 px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                phoneValid && !sendingOtp && cooldown === 0
                  ? "bg-black text-white hover:bg-[#1a1a1a]"
                  : "bg-[#efefef] text-[#afafaf] cursor-not-allowed",
              )}
            >
              {sendingOtp
                ? "전송 중..."
                : cooldown > 0
                  ? `${cooldown}초 후 재전송`
                  : otpSent
                    ? "재전송"
                    : "인증번호 전송"}
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
            {state?.errors?.code?.[0] && (
              <p className="mt-2 text-xs text-red-600">
                {state.errors.code[0]}
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
            description="입력한 정보가 선택한 설계사들에게 전달됩니다. 설계사는 제안서 작성 목적으로만 사용해요."
          />
          <ConsentRow
            checked={data.consentMessaging}
            onChange={(v) => setData((d) => ({ ...d, consentMessaging: v }))}
            label="결과 알림톡 수신"
            required
            description="제안서 결과를 카카오 알림톡으로 받아요."
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
        <input type="hidden" name="rrnFront" value={data.rrnFront} />
        <input type="hidden" name="rrnBack1" value={data.rrnBack1} />
        <input type="hidden" name="phone" value={data.phone} />
        <input type="hidden" name="code" value={data.otpCode} />
        <Button
          type="submit"
          disabled={!canSubmit || pending}
          className="w-full h-14 rounded-full text-base font-medium"
        >
          {pending ? "확인 중..." : "본인 인증하고 요청 보내기"}
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

/**
 * 요청 요약 — OTP 전송 직전, 설계사에게 곧 전달될 내용을 가입자가 마지막으로
 * 검토할 자리. 길이가 적당하도록 핵심 fact 만: 직업·예산·보장·병력 개수·추가 메모.
 *
 * 작성 단계로 되돌릴 link 없음 — 후보 선택까지 끝난 시점이라 본문 수정 = 처음부터.
 * 잘못 적었으면 본인 인증 안 하고 이탈하면 됨.
 */
function RequestSummary({ step1 }: { step1: Step1Input }) {
  const budgetLabel = `${formatBudget(step1.monthlyBudgetMin)}~${formatBudget(step1.monthlyBudgetMax)}`;

  return (
    <section className="mt-6 rounded-xl border border-[#e2e2e2] p-5 flex flex-col gap-4">
      <p className="text-xs font-medium tracking-wide text-[#4b4b4b]">
        설계사에게 전달될 내용
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <SummaryItem label="직업" value={step1.occupation} />
        <SummaryItem label="월 예상 보험료" value={budgetLabel} />
      </dl>

      <CoverageSummary coverage={step1.coverage} />

      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-[#afafaf]">병력</p>
        <p className="text-sm text-black">
          {step1.medicalHistory.length === 0
            ? "없음"
            : `${step1.medicalHistory.length}건`}
        </p>
      </div>

      {step1.additionalNotes && step1.additionalNotes.trim().length > 0 && (
        <div className="rounded-lg bg-[#f8f8f8] px-3 py-2.5">
          <p className="text-[11px] text-[#afafaf]">추가 요청사항</p>
          <p className="mt-1 text-sm text-[#4b4b4b] leading-relaxed whitespace-pre-wrap">
            {step1.additionalNotes.trim()}
          </p>
        </div>
      )}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] text-[#afafaf]">{label}</dt>
      <dd className="text-sm font-medium text-black truncate">{value}</dd>
    </div>
  );
}

function CoverageSummary({ coverage }: { coverage: CoverageRequest }) {
  if (coverage.intent === "broad") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-[#afafaf]">대비하고 싶은 보장</p>
        <p className="text-sm text-black">종합적으로 알아보고 있어요</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-[#afafaf]">대비하고 싶은 보장</p>
      <ul className="flex flex-wrap gap-1.5">
        {coverage.concerns.map((id) => (
          <li
            key={id}
            className="px-2.5 py-1 rounded-full bg-[#efefef] text-xs font-medium text-black"
          >
            {FOCUSED_CONCERN_LABEL[id]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatBudget(n: number): string {
  if (n >= 10000) {
    const man = n / 10000;
    return Number.isInteger(man) ? `${man}만원` : `${man.toFixed(1)}만원`;
  }
  return `${n.toLocaleString("ko-KR")}원`;
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
