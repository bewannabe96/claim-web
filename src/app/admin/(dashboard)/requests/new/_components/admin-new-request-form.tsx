"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBudgetRange } from "@/features/plan-request-pricing/format";
import type { PriceTier } from "@/features/plan-request-pricing/schema";
import { createPlanRequestByAdmin } from "@/features/plan-requests/actions";
import {
  FOCUSED_CONCERN_IDS,
  FOCUSED_CONCERN_LABEL,
  TREATMENT_PERIODS,
  TREATMENT_PERIOD_LABEL,
  type CoverageIntent,
  type CoverageRequest,
  type FocusedConcernId,
  type MedicalHistoryEntry,
  type TreatmentPeriod,
} from "@/features/plan-requests/schema";
import { Chip, ChipGroup } from "@/features/plan-requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";

import { Banner, Card } from "../../../_components/page-shell";

/* ============================================================
 * 어드민 — 가입자 대신 요청서 작성 폼.
 *
 * 가입자 step1-wizard 와 confirm-wizard 의 모든 필드를 한 페이지에 펼쳐서 입력.
 * wizard 의 step-by-step 흐름 대신 admin productivity 우선의 단일 폼 + 섹션 카드.
 * useActionState 대신 useTransition + 직접 호출 — 성공 시 router.replace 로 상세
 * 페이지로 이동해야 해서 useActionState 의 redirect 처리보다 직접 제어가 명확.
 *
 * coverage / medicalHistory 는 step1-wizard 와 동일한 JSON 직렬화 → hidden field
 * 전송 패턴을 따른다 (action 측 parseMedicalHistory / parseJsonField 가 짝).
 * ============================================================ */

type FormState = {
  // 가입자 식별
  name: string;
  rrnFront: string;
  rrnBack1: string;
  phone: string;
  // 요청서 본문
  occupation: string;
  coverageIntent?: CoverageIntent;
  focusedConcerns: FocusedConcernId[];
  monthlyBudgetMin?: string;
  monthlyBudgetMax?: string;
  medicalHistory: MedicalHistoryEntry[];
  additionalNotes: string;
  // 동의 (관리자 attest)
  consentThirdParty: boolean;
  consentMessaging: boolean;
};

type BudgetOption = {
  id: string;
  label: string;
  min: number;
  max: number;
};

function toBudgetOptions(tiers: ReadonlyArray<PriceTier>): BudgetOption[] {
  return tiers.map((t) => ({
    id: t.id,
    label: formatBudgetRange(t.budgetMin, t.budgetMax),
    min: t.budgetMin,
    max: t.budgetMax,
  }));
}

function isValidPhone(p: string): boolean {
  return /^01\d{8,9}$/.test(p);
}

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

function formatPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function buildCoverage(d: FormState): CoverageRequest | null {
  if (!d.coverageIntent) return null;
  if (d.coverageIntent === "focused") {
    if (d.focusedConcerns.length === 0) return null;
    return { intent: "focused", concerns: d.focusedConcerns };
  }
  return { intent: "broad" };
}

function isMedicalEntryComplete(e: MedicalHistoryEntry): boolean {
  return (
    !!e.diagnosis &&
    e.diagnosis.trim().length > 0 &&
    !!e.treatmentPeriod &&
    !!e.treatmentStartDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.treatmentStartDate) &&
    Number.isFinite(e.hospitalizationDays) &&
    e.hospitalizationDays >= 0 &&
    Number.isFinite(e.outpatientVisits) &&
    e.outpatientVisits >= 0 &&
    typeof e.hadSurgery === "boolean"
  );
}

export function AdminNewRequestForm({
  priceTiers,
}: {
  priceTiers: PriceTier[];
}) {
  const router = useRouter();
  const budgetOptions = toBudgetOptions(priceTiers);
  const [data, setData] = useState<FormState>({
    name: "",
    rrnFront: "",
    rrnBack1: "",
    phone: "",
    occupation: "",
    focusedConcerns: [],
    medicalHistory: [],
    additionalNotes: "",
    consentThirdParty: true,
    consentMessaging: true,
  });
  const [errors, setErrors] = useState<Partial<Record<string, string[]>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * 사용자가 필드를 수정하면 그 필드의 서버 에러를 즉시 클리어. 다음 submit 결과를
   * 기다리지 않고 시각적으로 "고친" 상태로 보이게 한다. RRN 두 칸은 같은 row 라 하나만
   * 건드려도 둘 다 비움.
   */
  function clearFieldError(...keys: string[]) {
    setErrors((prev) => {
      let next = prev;
      for (const key of keys) {
        if (next[key]) {
          if (next === prev) next = { ...prev };
          delete next[key];
        }
      }
      return next;
    });
  }

  // priceTiers 가 비어있으면 작성 자체를 막고 안내. 액션 호출 에러와 합쳐서 단일
  // banner 로 노출 — useEffect 로 state 동기화하면 cascading render 경고 발생.
  const priceTierMissing = priceTiers.length === 0;
  const serverError = priceTierMissing
    ? "보험료 옵션이 등록돼 있지 않아요. 설정에서 가격 tier 를 먼저 추가해주세요."
    : submitError;

  const coverage = buildCoverage(data);
  const phoneValid = isValidPhone(data.phone);
  const rrnValid = isValidRrn(data.rrnFront, data.rrnBack1);
  const nameValid = data.name.trim().length > 0 && data.name.length <= 20;
  const budgetValid =
    !!data.monthlyBudgetMin &&
    !!data.monthlyBudgetMax &&
    Number(data.monthlyBudgetMin) >= 0 &&
    Number(data.monthlyBudgetMax) >= Number(data.monthlyBudgetMin);
  const medicalValid = data.medicalHistory.every(isMedicalEntryComplete);

  const canSubmit =
    nameValid &&
    rrnValid &&
    phoneValid &&
    !!data.occupation.trim() &&
    !!coverage &&
    budgetValid &&
    medicalValid &&
    data.consentMessaging &&
    priceTiers.length > 0;

  function handleSubmit() {
    if (!canSubmit || isPending) return;
    setSubmitError(null);
    setErrors({});

    const fd = new FormData();
    fd.append("name", data.name);
    fd.append("rrnFront", data.rrnFront);
    fd.append("rrnBack1", data.rrnBack1);
    fd.append("phone", data.phone);
    fd.append("occupation", data.occupation);
    fd.append("coverage", JSON.stringify(coverage));
    fd.append("monthlyBudgetMin", data.monthlyBudgetMin ?? "");
    fd.append("monthlyBudgetMax", data.monthlyBudgetMax ?? "");
    fd.append("medicalHistory", JSON.stringify(data.medicalHistory));
    if (data.additionalNotes.trim()) {
      fd.append("additionalNotes", data.additionalNotes.trim());
    }
    fd.append("consentThirdParty", data.consentThirdParty ? "on" : "off");
    fd.append("consentMessaging", data.consentMessaging ? "on" : "off");

    startTransition(async () => {
      const result = await createPlanRequestByAdmin(undefined, fd);
      if (result && "ok" in result && result.ok) {
        // 상세 페이지로 이동 — 어드민이 곧바로 송부 결과 확인 가능. revalidatePath 가
        // 액션 안에서 호출되므로 목록도 자동 갱신.
        router.replace(`/admin/requests/${result.requestId}`);
        return;
      }
      const msg =
        result && "errors" in result && result.errors?._form?.[0]
          ? result.errors._form[0]
          : "요청서 생성에 실패했어요. 입력값을 확인해주세요.";
      setSubmitError(msg);
      if (result && "errors" in result && result.errors) {
        setErrors(result.errors as Partial<Record<string, string[]>>);
      }
    });
  }

  return (
    // <form> 으로 래핑 — input 에서 Enter 키로 onSubmit 트리거. 데이터 전송 자체는
    // useTransition + 직접 호출이라 preventDefault 후 handleSubmit() 만 호출.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      {/* 가입자 식별 정보 */}
      <Card>
        <SectionTitle>가입자 정보</SectionTitle>
        <p className="mt-1 text-xs text-[#4b4b4b]">
          가입자에게 직접 받은 정보를 입력해주세요. 입력한 휴대폰 번호로 분석 완료
          알림톡이 발송돼요.
        </p>
        <div className="mt-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-5">
            <Field label="이름" error={errors.name?.[0]}>
              <Input
                type="text"
                maxLength={20}
                placeholder="홍길동"
                value={data.name}
                onChange={(e) => {
                  setData((d) => ({ ...d, name: e.target.value }));
                  clearFieldError("name");
                }}
                className="h-11"
                autoComplete="off"
              />
            </Field>
            <Field
              label="휴대폰"
              error={errors.phone?.[0]}
              hint={!phoneValid && data.phone.length > 0 ? "010xxxxxxxx 형식" : undefined}
            >
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="010-1234-5678"
                maxLength={13}
                value={formatPhoneDisplay(data.phone)}
                onChange={(e) => {
                  setData((d) => ({
                    ...d,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 11),
                  }));
                  clearFieldError("phone");
                }}
                className="h-11"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field
            label="주민등록번호"
            error={errors.rrnFront?.[0] ?? errors.rrnBack1?.[0]}
            hint="앞 6자리(YYMMDD) + 뒤 1자리. 원본은 저장하지 않고 생년월일/성별만 추출돼요."
          >
            <div className="flex items-center gap-2">
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="YYMMDD"
                maxLength={6}
                value={data.rrnFront}
                onChange={(e) => {
                  setData((d) => ({
                    ...d,
                    rrnFront: e.target.value.replace(/\D/g, "").slice(0, 6),
                  }));
                  clearFieldError("rrnFront", "rrnBack1");
                }}
                className="h-11 tracking-wider flex-1"
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
                onChange={(e) => {
                  setData((d) => ({
                    ...d,
                    rrnBack1: e.target.value.replace(/\D/g, "").slice(0, 1),
                  }));
                  clearFieldError("rrnFront", "rrnBack1");
                }}
                className="h-11 px-3 text-center w-12"
                autoComplete="off"
              />
              <span
                className="text-[#afafaf] tracking-[0.2em] select-none"
                aria-hidden
              >
                ●●●●●●
              </span>
            </div>
          </Field>
        </div>
      </Card>

      {/* 요청서 본문 — 직업/보장/예산 */}
      <Card>
        <SectionTitle>기본 요청</SectionTitle>
        <div className="mt-5 flex flex-col gap-5">
          <Field label="직업" error={errors.occupation?.[0]}>
            <Input
              type="text"
              maxLength={50}
              placeholder="예: 반도체연구원, 학원선생님, 트럭운전사"
              value={data.occupation}
              onChange={(e) => {
                setData((d) => ({ ...d, occupation: e.target.value }));
                clearFieldError("occupation");
              }}
              className="h-11"
            />
          </Field>

          <Field label="대비하고 싶은 보장" error={errors.coverage?.[0]}>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <IntentChip
                  label="종합적으로 알아보는 중"
                  selected={data.coverageIntent === "broad"}
                  onClick={() => {
                    setData((d) => ({ ...d, coverageIntent: "broad" }));
                    clearFieldError("coverage");
                  }}
                />
                <IntentChip
                  label="특정 질병/상황 집중"
                  selected={data.coverageIntent === "focused"}
                  onClick={() => {
                    setData((d) => ({ ...d, coverageIntent: "focused" }));
                    clearFieldError("coverage");
                  }}
                />
              </div>
              {data.coverageIntent === "focused" && (
                <ChipGroup density="compact">
                  {FOCUSED_CONCERN_IDS.map((id) => {
                    const on = data.focusedConcerns.includes(id);
                    return (
                      <Chip
                        key={id}
                        density="compact"
                        selected={on}
                        onClick={() => {
                          setData((d) => ({
                            ...d,
                            focusedConcerns: on
                              ? d.focusedConcerns.filter((x) => x !== id)
                              : [...d.focusedConcerns, id],
                          }));
                          clearFieldError("coverage");
                        }}
                      >
                        {FOCUSED_CONCERN_LABEL[id]}
                      </Chip>
                    );
                  })}
                </ChipGroup>
              )}
            </div>
          </Field>

          <Field
            label="월 보험료"
            error={errors.monthlyBudgetMin?.[0] ?? errors.monthlyBudgetMax?.[0]}
            hint={priceTiers.length === 0 ? "가격 tier 가 등록돼 있지 않아요." : undefined}
          >
            <ChipGroup density="compact">
              {budgetOptions.map((opt) => {
                const selected =
                  data.monthlyBudgetMin === String(opt.min) &&
                  data.monthlyBudgetMax === String(opt.max);
                return (
                  <Chip
                    key={opt.id}
                    density="compact"
                    selected={selected}
                    onClick={() => {
                      setData((d) => ({
                        ...d,
                        monthlyBudgetMin: String(opt.min),
                        monthlyBudgetMax: String(opt.max),
                      }));
                      clearFieldError("monthlyBudgetMin", "monthlyBudgetMax");
                    }}
                  >
                    {opt.label}
                  </Chip>
                );
              })}
            </ChipGroup>
          </Field>
        </div>
      </Card>

      {/* 병력 */}
      <Card>
        <SectionTitle>
          병력 <span className="text-xs font-normal text-[#afafaf]">선택</span>
        </SectionTitle>
        <div className="mt-5 flex flex-col gap-3">
          {data.medicalHistory.length === 0 && (
            <p className="text-xs text-[#4b4b4b]">
              치료/진단 이력이 있다면 추가해주세요. 최대 20건.
            </p>
          )}
          {data.medicalHistory.map((entry, idx) => (
            <MedicalEntryCard
              key={idx}
              index={idx}
              entry={entry}
              onChange={(patch) =>
                setData((d) => ({
                  ...d,
                  medicalHistory: d.medicalHistory.map((e, i) =>
                    i === idx ? { ...e, ...patch } : e,
                  ),
                }))
              }
              onRemove={() =>
                setData((d) => ({
                  ...d,
                  medicalHistory: d.medicalHistory.filter((_, i) => i !== idx),
                }))
              }
            />
          ))}
          <button
            type="button"
            disabled={data.medicalHistory.length >= 20}
            onClick={() =>
              setData((d) => ({
                ...d,
                medicalHistory: [
                  ...d.medicalHistory,
                  {
                    diagnosis: "",
                    treatmentPeriod: "within_3m" as TreatmentPeriod,
                    treatmentStartDate: "",
                    hospitalizationDays: 0,
                    outpatientVisits: 0,
                    hadSurgery: false,
                  },
                ],
              }))
            }
            className={cn(
              "h-11 rounded-lg border-2 border-dashed text-sm font-medium transition-colors",
              data.medicalHistory.length >= 20
                ? "border-[#e2e2e2] text-[#afafaf] cursor-not-allowed"
                : "border-[#e2e2e2] text-black hover:border-black hover:bg-[#fafafa]",
            )}
          >
            + 병력 추가
          </button>
        </div>
      </Card>

      {/* 추가 요청 */}
      <Card>
        <SectionTitle>
          추가 요청사항{" "}
          <span className="text-xs font-normal text-[#afafaf]">선택</span>
        </SectionTitle>
        <textarea
          rows={5}
          maxLength={1000}
          placeholder="예: 가족력, 납입면제 등 가입자가 강조한 내용"
          value={data.additionalNotes}
          onChange={(e) =>
            setData((d) => ({ ...d, additionalNotes: e.target.value }))
          }
          className="mt-5 w-full px-4 py-3 text-sm rounded-lg border border-[#e2e2e2] resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </Card>

      {/* 동의 */}
      <Card>
        <SectionTitle>동의</SectionTitle>
        <p className="mt-1 text-xs text-[#4b4b4b]">
          관리자가 가입자에게 받은 동의를 attest 해요.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <ConsentToggle
            checked={data.consentMessaging}
            onChange={(v) =>
              setData((d) => ({ ...d, consentMessaging: v }))
            }
            label="결과 알림톡 수신 동의 (필수)"
            description="제안서 결과를 가입자에게 카카오 알림톡으로 보내려면 필요해요."
          />
          <ConsentToggle
            checked={data.consentThirdParty}
            onChange={(v) =>
              setData((d) => ({ ...d, consentThirdParty: v }))
            }
            label="제3자 정보 제공 동의"
            description="동의 시 선택된 설계사에게 가입자 휴대폰 번호가 노출돼요."
          />
        </div>
      </Card>

      {serverError && <Banner tone="error">{serverError}</Banner>}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!canSubmit || isPending}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {isPending ? "송부 중..." : "요청서 작성 + 즉시 송부"}
        </Button>
      </div>
    </form>
  );
}

/* ============================================================
 * 보조 컴포넌트
 * ============================================================ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-black tracking-tight">{children}</h2>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#4b4b4b]">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-[#afafaf]">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function IntentChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 px-4 rounded-xl text-sm font-medium transition-colors text-left",
        selected
          ? "bg-black text-white"
          : "bg-[#fafafa] text-black hover:bg-[#efefef]",
      )}
    >
      {label}
    </button>
  );
}

function MedicalEntryCard({
  index,
  entry,
  onChange,
  onRemove,
}: {
  index: number;
  entry: MedicalHistoryEntry;
  onChange: (patch: Partial<MedicalHistoryEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#e2e2e2] bg-white p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#4b4b4b]">
          병력 {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-[#4b4b4b] hover:text-black underline"
        >
          삭제
        </button>
      </div>

      <SubField label="진단명">
        <Input
          type="text"
          maxLength={100}
          placeholder="예: 고혈압, 갑상선 결절"
          value={entry.diagnosis}
          onChange={(e) => onChange({ diagnosis: e.target.value })}
          className="h-10 px-3"
        />
      </SubField>

      <SubField label="치료기간">
        <ChipGroup density="compact">
          {TREATMENT_PERIODS.map((p) => (
            <Chip
              key={p}
              density="compact"
              selected={entry.treatmentPeriod === p}
              onClick={() => onChange({ treatmentPeriod: p })}
            >
              {TREATMENT_PERIOD_LABEL[p]}
            </Chip>
          ))}
        </ChipGroup>
      </SubField>

      <SubField label="치료 시작일">
        <Input
          type="date"
          value={entry.treatmentStartDate}
          onChange={(e) => onChange({ treatmentStartDate: e.target.value })}
          className="h-10 px-3"
        />
      </SubField>

      <div className="grid grid-cols-2 gap-3">
        <SubField label="입원일수">
          <UnitInput
            value={String(entry.hospitalizationDays ?? 0)}
            suffix="일"
            onChange={(v) =>
              onChange({ hospitalizationDays: Number(v) || 0 })
            }
          />
        </SubField>
        <SubField label="외래 횟수">
          <UnitInput
            value={String(entry.outpatientVisits ?? 0)}
            suffix="회"
            onChange={(v) => onChange({ outpatientVisits: Number(v) || 0 })}
          />
        </SubField>
      </div>

      <SubField label="수술 여부">
        <ChipGroup density="compact">
          <Chip
            density="compact"
            selected={entry.hadSurgery === false}
            onClick={() => onChange({ hadSurgery: false })}
          >
            수술 없음
          </Chip>
          <Chip
            density="compact"
            selected={entry.hadSurgery === true}
            onClick={() => onChange({ hadSurgery: true })}
          >
            수술 있음
          </Chip>
        </ChipGroup>
      </SubField>
    </div>
  );
}

function SubField({
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

function UnitInput({
  value,
  suffix,
  onChange,
}: {
  value: string;
  suffix: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-10 px-3 pr-10"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4b4b4b] pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

function ConsentToggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full text-left rounded-xl p-4 flex gap-3 transition-colors border",
        checked ? "border-black bg-[#fafafa]" : "border-[#e2e2e2] bg-white",
      )}
    >
      <span
        className={cn(
          "shrink-0 flex items-center justify-center w-5 h-5 rounded-md transition-colors",
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
      <span className="flex flex-col gap-0.5 flex-1">
        <span className="text-sm font-medium text-black">{label}</span>
        <span className="text-xs text-[#4b4b4b]">{description}</span>
      </span>
    </button>
  );
}
