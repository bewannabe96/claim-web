"use client";

import { useActionState, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { finalizeRequest, sendOtp } from "@/features/requests/actions";
import {
  Chip,
  ChipGroup,
  ProgressSegment,
} from "@/features/requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";

type FormState = {
  birthDate?: string;
  occupation?: string;
  smoker?: "yes" | "no";
  heightCm?: string;
  weightKg?: string;
  hasExistingInsurance?: "yes" | "no";
  existingInsuranceNote?: string;
  medicalHistory?: string;
  consentThirdParty: boolean;
  consentMessaging: boolean;
  /** digits only — 11자리 (010xxxxxxxx) */
  phone: string;
  /** 6자리 OTP — digits only */
  otpCode: string;
};

const PHASES = ["basic", "history", "consent"] as const;
type Phase = (typeof PHASES)[number];

const PHASE_TITLES: Record<Phase, { title: string; helper: string }> = {
  basic: {
    title: "진설계에 필요한 정보예요",
    helper: "선택하신 설계사에게만 전달돼요",
  },
  history: {
    title: "기존 보험이나 건강 정보를 알려주세요",
    helper: "정확한 진설계를 위해 필요해요. 없으면 비워두셔도 돼요",
  },
  consent: {
    title: "본인 인증 후 바로 시작해요",
    helper: "휴대폰 번호로 인증하면 결과를 카카오 알림톡으로 받을 수 있어요",
  },
};

/** 010-1234-5678 표시 포맷 (digits only 입력값을 받음) */
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
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [data, setData] = useState<FormState>({
    consentThirdParty: false,
    consentMessaging: false,
    phone: "",
    otpCode: "",
  });

  // OTP 발송 상태 (인증번호 전송 버튼 클릭으로 토글)
  const [otpSent, setOtpSent] = useState(false);
  const [sendOtpError, setSendOtpError] = useState<string | null>(null);
  const [sendingOtp, startSendOtpTransition] = useTransition();

  // 최종 제출
  const finalizeWithId = finalizeRequest.bind(null, requestId);
  const [state, formAction, pending] = useActionState(
    finalizeWithId,
    undefined,
  );

  const total = PHASES.length;
  const phase = PHASES[phaseIdx];
  const isLast = phaseIdx === total - 1;
  const canProceed = isPhaseValid(phase, data, otpSent);

  function next() {
    if (!isLast && canProceed) setPhaseIdx((i) => i + 1);
  }
  function prev() {
    if (phaseIdx > 0) setPhaseIdx((i) => i - 1);
  }

  function handleSendOtp() {
    if (!isValidPhone(data.phone) || sendingOtp) return;
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

  // 휴대폰 번호 변경 시 OTP 상태 초기화 (다른 번호로 받게 되면 재전송 필요)
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
        에게 전달할 정보예요
      </p>

      <div className="mt-6 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <ProgressSegment key={i} fill={i <= phaseIdx ? 1 : 0} />
        ))}
      </div>

      <div className="mt-10 flex flex-col flex-1 gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-bold text-black leading-tight">
            {PHASE_TITLES[phase].title}
          </h2>
          <p className="text-sm text-[#4b4b4b]">{PHASE_TITLES[phase].helper}</p>
        </div>

        {phase === "basic" && <BasicPhase data={data} setData={setData} />}
        {phase === "history" && <HistoryPhase data={data} setData={setData} />}
        {phase === "consent" && (
          <ConsentPhase
            data={data}
            setData={setData}
            phone={data.phone}
            setPhone={setPhone}
            otpSent={otpSent}
            sendingOtp={sendingOtp}
            sendOtpError={sendOtpError}
            onSendOtp={handleSendOtp}
            otpServerError={state?.errors?.code?.[0]}
          />
        )}
      </div>

      {state?.errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">
          {state.errors._form[0]}
        </p>
      )}

      <div className="pt-6 flex items-stretch gap-3">
        {phaseIdx > 0 && (
          <button
            type="button"
            onClick={prev}
            className="h-14 px-6 rounded-full text-sm font-medium bg-[#efefef] text-black hover:bg-[#e2e2e2] transition-colors"
          >
            이전
          </button>
        )}
        {isLast ? (
          <form action={formAction} className="flex-1">
            <input type="hidden" name="birthDate" value={data.birthDate ?? ""} />
            <input type="hidden" name="occupation" value={data.occupation ?? ""} />
            <input type="hidden" name="smoker" value={data.smoker ?? ""} />
            <input type="hidden" name="heightCm" value={data.heightCm ?? ""} />
            <input type="hidden" name="weightKg" value={data.weightKg ?? ""} />
            <input
              type="hidden"
              name="hasExistingInsurance"
              value={data.hasExistingInsurance ?? ""}
            />
            <input
              type="hidden"
              name="existingInsuranceNote"
              value={data.existingInsuranceNote ?? ""}
            />
            <input
              type="hidden"
              name="medicalHistory"
              value={data.medicalHistory ?? ""}
            />
            {data.consentThirdParty && (
              <input type="hidden" name="consentThirdParty" value="on" />
            )}
            {data.consentMessaging && (
              <input type="hidden" name="consentMessaging" value="on" />
            )}
            <input type="hidden" name="phone" value={data.phone} />
            <input type="hidden" name="code" value={data.otpCode} />
            <Button
              type="submit"
              disabled={!canProceed || pending}
              className="w-full h-14 rounded-full text-base font-medium"
            >
              {pending ? "확인 중..." : "본인 인증 완료"}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            onClick={next}
            disabled={!canProceed}
            className="flex-1 h-14 rounded-full text-base font-medium"
          >
            다음
          </Button>
        )}
      </div>
    </main>
  );
}

/* ============================================================
 * Phase 1 — 기본 정보
 * ============================================================ */

function BasicPhase({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="생년월일">
        <Input
          type="date"
          value={data.birthDate ?? ""}
          onChange={(e) => setData((d) => ({ ...d, birthDate: e.target.value }))}
          className="h-14 px-4 text-base"
        />
      </Field>

      <Field label="직업">
        <Input
          type="text"
          maxLength={50}
          placeholder="예: 회사원, 자영업, 학생"
          value={data.occupation ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, occupation: e.target.value }))
          }
          className="h-14 px-4 text-base"
        />
      </Field>

      <Field label="키 / 몸무게">
        <div className="flex gap-3">
          <NumberInput
            placeholder="키"
            suffix="cm"
            value={data.heightCm ?? ""}
            onChange={(v) => setData((d) => ({ ...d, heightCm: v }))}
          />
          <NumberInput
            placeholder="몸무게"
            suffix="kg"
            value={data.weightKg ?? ""}
            onChange={(v) => setData((d) => ({ ...d, weightKg: v }))}
          />
        </div>
      </Field>

      <Field label="흡연 여부">
        <ChipGroup>
          <Chip
            selected={data.smoker === "no"}
            onClick={() => setData((d) => ({ ...d, smoker: "no" }))}
          >
            비흡연
          </Chip>
          <Chip
            selected={data.smoker === "yes"}
            onClick={() => setData((d) => ({ ...d, smoker: "yes" }))}
          >
            흡연
          </Chip>
        </ChipGroup>
      </Field>
    </div>
  );
}

/* ============================================================
 * Phase 2 — 보험 이력
 * ============================================================ */

function HistoryPhase({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="기존 가입 보험이 있나요?">
        <ChipGroup>
          <Chip
            selected={data.hasExistingInsurance === "no"}
            onClick={() =>
              setData((d) => ({
                ...d,
                hasExistingInsurance: "no",
                existingInsuranceNote: "",
              }))
            }
          >
            없음
          </Chip>
          <Chip
            selected={data.hasExistingInsurance === "yes"}
            onClick={() =>
              setData((d) => ({ ...d, hasExistingInsurance: "yes" }))
            }
          >
            있음
          </Chip>
        </ChipGroup>
        {data.hasExistingInsurance === "yes" && (
          <textarea
            placeholder="어떤 보험에 가입돼 있는지 간단히 알려주세요 (선택)"
            maxLength={500}
            rows={3}
            value={data.existingInsuranceNote ?? ""}
            onChange={(e) =>
              setData((d) => ({
                ...d,
                existingInsuranceNote: e.target.value,
              }))
            }
            className="mt-3 w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        )}
      </Field>

      <Field label="병력이 있나요?" optional>
        <textarea
          placeholder="치료받은 질환이 있다면 알려주세요 (선택)"
          maxLength={500}
          rows={3}
          value={data.medicalHistory ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, medicalHistory: e.target.value }))
          }
          className="w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </Field>
    </div>
  );
}

/* ============================================================
 * Phase 3 — 본인 인증 + 약관 동의
 * ============================================================ */

function ConsentPhase({
  data,
  setData,
  phone,
  setPhone,
  otpSent,
  sendingOtp,
  sendOtpError,
  onSendOtp,
  otpServerError,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
  phone: string;
  setPhone: (digits: string) => void;
  otpSent: boolean;
  sendingOtp: boolean;
  sendOtpError: string | null;
  onSendOtp: () => void;
  otpServerError?: string;
}) {
  const phoneValid = isValidPhone(phone);

  return (
    <div className="flex flex-col gap-5">
      {/* 휴대폰 번호 + 인증번호 전송 (오른쪽) */}
      <Field label="휴대폰 번호">
        <div className="flex gap-2">
          <Input
            type="tel"
            inputMode="numeric"
            placeholder="010-1234-5678"
            maxLength={13}
            value={formatPhoneDisplay(phone)}
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))
            }
            className="h-14 px-4 text-base tracking-wider flex-1"
          />
          <button
            type="button"
            onClick={onSendOtp}
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
          {otpServerError ? (
            <p className="mt-2 text-xs text-red-600">{otpServerError}</p>
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
  );
}

/* ============================================================
 * 보조 컴포넌트
 * ============================================================ */

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1.5">
        <label className="text-sm font-medium text-black">{label}</label>
        {optional && <span className="text-xs text-[#afafaf]">선택</span>}
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  placeholder,
  suffix,
  value,
  onChange,
}: {
  placeholder: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1">
      <Input
        type="number"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-14 px-4 pr-10 text-base"
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#4b4b4b] pointer-events-none">
        {suffix}
      </span>
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

/* ============================================================
 * 검증
 * ============================================================ */

function isPhaseValid(phase: Phase, d: FormState, otpSent: boolean): boolean {
  switch (phase) {
    case "basic": {
      if (!d.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate)) return false;
      if (!d.occupation || d.occupation.trim().length === 0) return false;
      if (!d.smoker) return false;
      const h = Number(d.heightCm);
      const w = Number(d.weightKg);
      if (!Number.isFinite(h) || h < 100 || h > 230) return false;
      if (!Number.isFinite(w) || w < 20 || w > 200) return false;
      return true;
    }
    case "history":
      return !!d.hasExistingInsurance;
    case "consent":
      return (
        isValidPhone(d.phone) &&
        otpSent &&
        d.otpCode.length === 6 &&
        d.consentThirdParty &&
        d.consentMessaging
      );
  }
}
