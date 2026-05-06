"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitProposal } from "@/features/proposals/actions";
import {
  REFUND_TYPE_LABEL,
  REFUND_TYPES,
  RENEWAL_TYPE_LABEL,
  RENEWAL_TYPES,
  type RefundType,
  type RenewalType,
} from "@/features/proposals/schema";
import {
  Chip,
  ChipGroup,
} from "@/features/requests/ui/wizard-primitives";
import type { MatchRequest } from "@/features/requests/schema";
import { cn } from "@/lib/utils";
import {
  AGE_RANGE_LABEL,
  GENDER_LABEL,
  INSURANCE_CATEGORY_LABEL,
} from "@/types";

/**
 * 설계사 진설계 작성 폼.
 *
 * 화면 흐름:
 * 1. 데드라인 카운트다운 + 가입자 컨텍스트 (Step1 + Step3 일부)
 * 2. 보험료 / 기간 / 보장
 * 3. 핵심 담보 3슬롯
 * 4. 갱신 / 환급 (chip)
 * 5. PDF + 메모
 * 6. 제출 CTA
 *
 * 휴대폰 번호는 노출하지 않음 — 가입자 PII 는 결과 화면의 "문자 받기" 통해 platform 이 relay.
 */
export function ProposalForm({
  token,
  agentName,
  remainingMs,
  request,
}: {
  token: string;
  agentName: string;
  remainingMs: number | null;
  request: MatchRequest;
}) {
  const submitWithToken = submitProposal.bind(null, token);
  const [state, formAction, pending] = useActionState(
    submitWithToken,
    undefined,
  );

  const errors = state && "errors" in state ? state.errors : undefined;

  return (
    <main className="flex flex-col flex-1 px-6 pt-6 pb-8 bg-white">
      {/* 인사 + 데드라인 */}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          {agentName} 설계사님
          <br />새 진설계 요청이 도착했어요
        </h1>
        {remainingMs !== null && <DeadlineBadge initialMs={remainingMs} />}
      </header>

      {/* 가입자 컨텍스트 */}
      <CustomerContext request={request} />

      {/* 폼 */}
      <form action={formAction} className="mt-8 flex flex-col gap-6">
        <Section title="보험료 · 기간 · 보장">
          <Field
            label="월 보험료"
            error={errors?.monthlyPremium?.[0]}
          >
            <UnitInput
              name="monthlyPremium"
              suffix="원"
              placeholder="120000"
              inputMode="numeric"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="납입기간"
              error={errors?.paymentYears?.[0]}
            >
              <UnitInput
                name="paymentYears"
                suffix="년"
                placeholder="20"
                inputMode="numeric"
              />
            </Field>
            <Field
              label="총 보장금액"
              error={errors?.totalCoverage?.[0]}
            >
              <UnitInput
                name="totalCoverage"
                suffix="원"
                placeholder="300000000"
                inputMode="numeric"
              />
            </Field>
          </div>
        </Section>

        <Section title="핵심 담보 (3개)">
          {[1, 2, 3].map((n) => {
            const key = `keyBenefit${n}` as
              | "keyBenefit1"
              | "keyBenefit2"
              | "keyBenefit3";
            return (
              <Field
                key={n}
                label={`핵심 담보 ${n}`}
                error={errors?.[key]?.[0]}
              >
                <Input
                  name={key}
                  type="text"
                  maxLength={60}
                  placeholder="예: 암 진단 5,000만원"
                  className="h-14 px-4 text-base"
                />
              </Field>
            );
          })}
        </Section>

        <Section title="형태">
          <Field label="갱신 여부" error={errors?.renewalType?.[0]}>
            <RadioChipGroup
              name="renewalType"
              options={RENEWAL_TYPES.map((v) => ({
                value: v as RenewalType,
                label: RENEWAL_TYPE_LABEL[v],
              }))}
            />
          </Field>
          <Field label="환급 여부" error={errors?.refundType?.[0]}>
            <RadioChipGroup
              name="refundType"
              options={REFUND_TYPES.map((v) => ({
                value: v as RefundType,
                label: REFUND_TYPE_LABEL[v],
              }))}
            />
          </Field>
        </Section>

        <Section title="첨부 · 메모">
          <Field label="진설계서 PDF" error={errors?.pdfFileName?.[0]}>
            <FileInput name="pdf" accept="application/pdf" />
          </Field>
          <Field label="메모" optional error={errors?.note?.[0]}>
            <textarea
              name="note"
              maxLength={2000}
              rows={4}
              placeholder="가입자에게 설명하고 싶은 포인트를 적어주세요. 결과 화면에 함께 노출돼요."
              className="w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </Field>
        </Section>

        {errors?._form && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {errors._form[0]}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="w-full h-14 rounded-full text-base font-medium"
        >
          {pending ? "제출 중..." : "진설계 제출"}
        </Button>

        <p className="text-center text-xs text-[#afafaf]">
          제출 후에는 수정할 수 없어요
        </p>
      </form>
    </main>
  );
}

/* ============================================================
 * 데드라인 배지 — 클라이언트에서 초 단위로 카운트다운
 * ============================================================ */

function DeadlineBadge({ initialMs }: { initialMs: number }) {
  const [remaining, setRemaining] = useState(initialMs);

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  const totalMin = Math.floor(remaining / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const urgent = remaining < 6 * 3600 * 1000; // 6h 이하 긴급

  const label =
    remaining <= 0
      ? "마감됨"
      : hours > 0
        ? `${hours}시간 ${minutes}분 남았어요`
        : `${minutes}분 남았어요`;

  return (
    <div
      className={cn(
        "mt-1 inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full text-xs font-medium",
        urgent
          ? "bg-black text-white"
          : "bg-[#efefef] text-black",
      )}
    >
      <ClockIcon />
      <span>{label}</span>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/* ============================================================
 * 가입자 컨텍스트 — 익명화된 요약. 휴대폰/생년월일 등 PII 제외.
 * ============================================================ */

function CustomerContext({ request }: { request: MatchRequest }) {
  const { step1, step3 } = request;
  const budgetLabel = `${formatBudget(step1.monthlyBudgetMin)}~${formatBudget(step1.monthlyBudgetMax)}`;

  return (
    <section className="mt-6 rounded-xl border border-[#e2e2e2] p-5 flex flex-col gap-4">
      <p className="text-xs font-medium tracking-wide text-[#4b4b4b]">
        가입자 요청
      </p>

      {/* 보장 분야 chips */}
      <div className="flex flex-wrap gap-1.5">
        {step1.categories.map((c) => (
          <span
            key={c}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-black text-white"
          >
            {INSURANCE_CATEGORY_LABEL[c]}
          </span>
        ))}
      </div>

      {/* 그리드 메타 */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Meta label="연령대" value={AGE_RANGE_LABEL[step1.ageRange]} />
        <Meta label="성별" value={GENDER_LABEL[step1.gender]} />
        <Meta label="거주 지역" value={step1.region} />
        <Meta label="월 예상 보험료" value={budgetLabel} />
        {step3 && (
          <>
            <Meta label="직업" value={step3.occupation} />
            <Meta
              label="흡연"
              value={step3.smoker ? "흡연" : "비흡연"}
            />
            <Meta
              label="키 / 몸무게"
              value={`${step3.heightCm}cm · ${step3.weightKg}kg`}
            />
            <Meta
              label="기존 보험"
              value={step3.hasExistingInsurance ? "있음" : "없음"}
            />
          </>
        )}
      </dl>

      {step3?.existingInsuranceNote && (
        <ContextNote label="기존 보험 메모" body={step3.existingInsuranceNote} />
      )}
      {step3?.medicalHistory && (
        <ContextNote label="병력" body={step3.medicalHistory} />
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] text-[#afafaf]">{label}</dt>
      <dd className="text-sm font-medium text-black truncate">{value}</dd>
    </div>
  );
}

function ContextNote({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2.5">
      <p className="text-[11px] text-[#afafaf]">{label}</p>
      <p className="mt-1 text-sm text-[#4b4b4b] leading-relaxed">{body}</p>
    </div>
  );
}

/* ============================================================
 * 폼 primitives
 * ============================================================ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-black tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-1.5">
        <label className="text-sm font-medium text-black">{label}</label>
        {optional && <span className="text-xs text-[#afafaf]">선택</span>}
      </div>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function UnitInput({
  name,
  suffix,
  placeholder,
  inputMode,
}: {
  name: string;
  suffix: string;
  placeholder: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className="relative">
      <Input
        name={name}
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        className="h-14 px-4 pr-10 text-base"
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#4b4b4b] pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

function RadioChipGroup<T extends string>({
  name,
  options,
}: {
  name: string;
  options: { value: T; label: string }[];
}) {
  // 클라이언트 상태로 단일 선택 관리. 폼 제출 시 hidden input 으로 같이 전송.
  const [selected, setSelected] = useState<T | null>(null);
  return (
    <>
      <ChipGroup>
        {options.map((opt) => (
          <Chip
            key={opt.value}
            selected={selected === opt.value}
            onClick={() => setSelected(opt.value)}
          >
            {opt.label}
          </Chip>
        ))}
      </ChipGroup>
      <input type="hidden" name={name} value={selected ?? ""} />
    </>
  );
}

function FileInput({ name, accept }: { name: string; accept: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 h-12 px-5 rounded-full text-sm font-medium bg-[#efefef] text-black hover:bg-[#e2e2e2] transition-colors"
      >
        파일 선택
      </button>
      <span
        className={cn(
          "text-sm truncate",
          fileName ? "text-black font-medium" : "text-[#afafaf]",
        )}
      >
        {fileName ?? "선택된 파일이 없어요"}
      </span>
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setFileName(f ? f.name : null);
        }}
      />
    </div>
  );
}

/* ============================================================
 * formatters
 * ============================================================ */

function formatBudget(n: number): string {
  if (n >= 10000) {
    const man = n / 10000;
    return Number.isInteger(man) ? `${man}만원` : `${man.toFixed(1)}만원`;
  }
  return `${n.toLocaleString("ko-KR")}원`;
}
