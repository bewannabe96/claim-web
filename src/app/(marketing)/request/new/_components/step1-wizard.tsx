"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitStep1 } from "@/features/requests/actions";
import {
  TREATMENT_PERIODS,
  TREATMENT_PERIOD_LABEL,
  type MedicalHistoryEntry,
  type TreatmentPeriod,
} from "@/features/requests/schema";
import {
  Chip,
  ChipGroup,
  ProgressSegment,
} from "@/features/requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";
import {
  KOREAN_REGIONS,
  type Gender,
  type KoreanRegion,
} from "@/types";

/* ============================================================
 * Form state — 모든 phase 가 공유. 전화번호는 confirm 단계에서 따로 수집.
 * ============================================================ */

type FormState = {
  // chip phases
  gender?: Gender;
  region?: KoreanRegion;
  monthlyBudgetMin?: string;
  monthlyBudgetMax?: string;
  // personal phase (이름은 confirm 단계에서 수집)
  birthDate?: string;
  occupation?: string;
  // details phase
  desiredCoverage?: string;
  medicalHistory: MedicalHistoryEntry[];
  additionalNotes?: string;
};

/** 보험료 옵션 */
const BUDGET_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  min: number;
  max: number;
}> = [
  { id: "under-5", label: "5만원 미만", min: 0, max: 49999 },
  { id: "5-10", label: "5~10만원", min: 50000, max: 100000 },
  { id: "10-20", label: "10~20만원", min: 100000, max: 200000 },
  { id: "20-30", label: "20~30만원", min: 200000, max: 300000 },
  { id: "30-50", label: "30~50만원", min: 300000, max: 500000 },
  { id: "over-50", label: "50만원 이상", min: 500000, max: 9999999 },
];

const PHASE_KEYS = [
  "gender",
  "region",
  "budget",
  "personal",
  "details",
] as const;
type PhaseKey = (typeof PHASE_KEYS)[number];

const PHASES: Record<PhaseKey, { title: string; helper?: string }> = {
  gender: { title: "성별을 알려주세요" },
  region: { title: "거주 지역은 어디인가요?" },
  budget: { title: "월 예상 보험료를 선택해주세요" },
  personal: {
    title: "기본 정보를 알려주세요",
    helper: "진설계서를 작성하는 데 필요한 정보예요",
  },
  details: {
    title: "원하시는 보장과 병력을 알려주세요",
    helper: "정확한 진설계를 위해 필요해요",
  },
};

/** 매칭 로딩 화면 최소 노출 시간 (ms). */
const MIN_MATCHING_MS = 2800;

export function Step1Wizard() {
  const router = useRouter();
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [data, setData] = useState<FormState>({ medicalHistory: [] });
  const [phase, setPhase] = useState<"form" | "matching">("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const total = PHASE_KEYS.length;
  const phaseKey = PHASE_KEYS[phaseIdx];
  const isLast = phaseIdx === total - 1;

  const canProceed = isPhaseValid(phaseKey, data);

  function next() {
    if (!isLast && canProceed) setPhaseIdx((i) => i + 1);
  }
  function prev() {
    if (phaseIdx > 0) setPhaseIdx((i) => i - 1);
  }

  function handleSubmit() {
    if (!canProceed) return;
    setServerError(null);
    setPhase("matching");

    const fd = new FormData();
    if (data.gender) fd.append("gender", data.gender);
    if (data.region) fd.append("region", data.region);
    if (data.birthDate) fd.append("birthDate", data.birthDate);
    if (data.occupation) fd.append("occupation", data.occupation);
    if (data.monthlyBudgetMin)
      fd.append("monthlyBudgetMin", data.monthlyBudgetMin);
    if (data.monthlyBudgetMax)
      fd.append("monthlyBudgetMax", data.monthlyBudgetMax);
    if (data.desiredCoverage) fd.append("desiredCoverage", data.desiredCoverage);
    fd.append("medicalHistory", JSON.stringify(data.medicalHistory));
    if (data.additionalNotes)
      fd.append("additionalNotes", data.additionalNotes);

    startTransition(async () => {
      const startedAt = Date.now();
      const result = await submitStep1(undefined, fd);
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_MATCHING_MS - elapsed);
      await new Promise((r) => setTimeout(r, remaining));

      if (result && "ok" in result && result.ok) {
        router.push(`/request/${result.requestId}/candidates`);
      } else {
        const msg =
          result && "errors" in result && result.errors?._form?.[0]
            ? result.errors._form[0]
            : "매칭에 실패했습니다. 다시 시도해주세요.";
        setServerError(msg);
        setPhase("form");
      }
    });
  }

  if (phase === "matching") return <MatchingScreen />;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <BrandMark />
      <h1 className="mt-3 text-2xl font-bold leading-[1.22] tracking-tight text-black">
        나에게 딱 맞는
        <br />
        보험 설계사를
        <br />
        찾아드립니다
      </h1>
      <p className="mt-3 text-xs text-[#4b4b4b]">
        몇 가지 정보만 알려주시면 맞춤 설계사를 추천해드려요
      </p>

      <div className="mt-6 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <ProgressSegment key={i} fill={i <= phaseIdx ? 1 : 0} />
        ))}
      </div>

      <div className="mt-10 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-black leading-tight">
          {PHASES[phaseKey].title}
        </h2>
        {PHASES[phaseKey].helper && (
          <p className="mt-1 text-sm text-[#4b4b4b]">
            {PHASES[phaseKey].helper}
          </p>
        )}

        <div className="mt-6">
          {phaseKey === "gender" && (
            <div className="grid grid-cols-2 gap-3">
              <BigCard
                emoji="👨"
                label="남성"
                selected={data.gender === "male"}
                onClick={() => setData((d) => ({ ...d, gender: "male" }))}
              />
              <BigCard
                emoji="👩"
                label="여성"
                selected={data.gender === "female"}
                onClick={() => setData((d) => ({ ...d, gender: "female" }))}
              />
            </div>
          )}

          {phaseKey === "region" && (
            <ChipGroup>
              {KOREAN_REGIONS.map((r) => (
                <Chip
                  key={r}
                  selected={data.region === r}
                  onClick={() => setData((d) => ({ ...d, region: r }))}
                >
                  {r}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {phaseKey === "budget" && (
            <ChipGroup>
              {BUDGET_OPTIONS.map((opt) => {
                const selected =
                  data.monthlyBudgetMin === String(opt.min) &&
                  data.monthlyBudgetMax === String(opt.max);
                return (
                  <Chip
                    key={opt.id}
                    selected={selected}
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        monthlyBudgetMin: String(opt.min),
                        monthlyBudgetMax: String(opt.max),
                      }))
                    }
                  >
                    {opt.label}
                  </Chip>
                );
              })}
            </ChipGroup>
          )}

          {phaseKey === "personal" && (
            <PersonalFields data={data} setData={setData} />
          )}

          {phaseKey === "details" && (
            <DetailsFields data={data} setData={setData} />
          )}
        </div>
      </div>

      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">
          {serverError}
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
        <Button
          type="button"
          onClick={isLast ? handleSubmit : next}
          disabled={!canProceed}
          className="flex-1 h-14 rounded-full text-base font-medium"
        >
          {isLast ? "설계사 찾기" : "다음"}
        </Button>
      </div>
    </main>
  );
}

function isPhaseValid(phase: PhaseKey, d: FormState): boolean {
  switch (phase) {
    case "gender":
      return !!d.gender;
    case "region":
      return !!d.region;
    case "budget": {
      const min = Number(d.monthlyBudgetMin);
      const max = Number(d.monthlyBudgetMax);
      return (
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        min >= 0 &&
        max >= min
      );
    }
    case "personal":
      return (
        !!d.birthDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) &&
        !!d.occupation &&
        d.occupation.trim().length > 0
      );
    case "details": {
      if (!d.desiredCoverage || d.desiredCoverage.trim().length === 0)
        return false;
      // 병력 row 마다 모든 필수 필드 채워졌는지
      return d.medicalHistory.every(isMedicalEntryComplete);
    }
  }
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

/* ============================================================
 * Personal phase — 이름, 생년월일, 직업
 * ============================================================ */

function PersonalFields({
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
          onChange={(e) =>
            setData((d) => ({ ...d, birthDate: e.target.value }))
          }
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
    </div>
  );
}

/* ============================================================
 * Details phase — 희망 담보 + 병력 + 그외 요청사항
 * ============================================================ */

function DetailsFields({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  function addMedicalEntry() {
    if (data.medicalHistory.length >= 20) return;
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
    }));
  }

  function updateMedicalEntry(idx: number, patch: Partial<MedicalHistoryEntry>) {
    setData((d) => ({
      ...d,
      medicalHistory: d.medicalHistory.map((e, i) =>
        i === idx ? { ...e, ...patch } : e,
      ),
    }));
  }

  function removeMedicalEntry(idx: number) {
    setData((d) => ({
      ...d,
      medicalHistory: d.medicalHistory.filter((_, i) => i !== idx),
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="희망하시는 담보">
        <textarea
          maxLength={500}
          rows={4}
          placeholder="예: 암 진단금 5천만원 이상, 입원/수술비, 비갱신형 선호 등"
          value={data.desiredCoverage ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, desiredCoverage: e.target.value }))
          }
          className="w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </Field>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-medium text-black">
            병력{" "}
            {data.medicalHistory.length > 0 && (
              <span className="text-xs text-[#4b4b4b]">
                ({data.medicalHistory.length}건)
              </span>
            )}
          </label>
          <span className="text-xs text-[#afafaf]">없으면 비워두세요</span>
        </div>

        {data.medicalHistory.length === 0 && (
          <p className="text-xs text-[#4b4b4b]">
            치료받았거나 진단받은 이력이 있다면 추가해주세요
          </p>
        )}

        {data.medicalHistory.map((entry, idx) => (
          <MedicalEntryCard
            key={idx}
            entry={entry}
            index={idx}
            onChange={(patch) => updateMedicalEntry(idx, patch)}
            onRemove={() => removeMedicalEntry(idx)}
          />
        ))}

        <button
          type="button"
          onClick={addMedicalEntry}
          disabled={data.medicalHistory.length >= 20}
          className={cn(
            "h-12 rounded-lg border-2 border-dashed text-sm font-medium transition-colors",
            data.medicalHistory.length >= 20
              ? "border-[#e2e2e2] text-[#afafaf] cursor-not-allowed"
              : "border-[#e2e2e2] text-black hover:border-black hover:bg-[#fafafa]",
          )}
        >
          + 병력 추가
        </button>
      </div>

      <Field label="그외 요청사항" optional>
        <textarea
          maxLength={1000}
          rows={3}
          placeholder="설계사에게 추가로 전달하고 싶은 내용이 있다면 자유롭게 적어주세요"
          value={data.additionalNotes ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, additionalNotes: e.target.value }))
          }
          className="w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </Field>
    </div>
  );
}

/* ============================================================
 * 병력 1건 입력 카드
 * ============================================================ */

function MedicalEntryCard({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: MedicalHistoryEntry;
  index: number;
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
          className="h-12 px-3 text-sm"
        />
      </SubField>

      <SubField label="치료기간">
        <ChipGroup>
          {TREATMENT_PERIODS.map((p) => (
            <Chip
              key={p}
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
          className="h-12 px-3 text-sm"
        />
      </SubField>

      <div className="grid grid-cols-2 gap-3">
        <SubField label="입원일수">
          <UnitInput
            value={String(entry.hospitalizationDays ?? 0)}
            suffix="일"
            onChange={(v) => onChange({ hospitalizationDays: Number(v) || 0 })}
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
        <ChipGroup>
          <Chip
            selected={entry.hadSurgery === false}
            onClick={() => onChange({ hadSurgery: false })}
          >
            수술 없음
          </Chip>
          <Chip
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

/* ============================================================
 * 매칭 로딩 화면
 * ============================================================ */

const MATCHING_STEPS = [
  "고객 정보 분석 중",
  "거주 지역 기반 매칭 중",
  "최적의 설계사 선별 중",
] as const;

function MatchingScreen() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const interval = MIN_MATCHING_MS / MATCHING_STEPS.length;
    const timers = MATCHING_STEPS.map((_, i) =>
      setTimeout(() => setStepIdx(i + 1), interval * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 items-center justify-center bg-white">
      <BrandMark />

      <div className="mt-12 flex items-center gap-2" aria-hidden>
        <PulseDot delay="0ms" />
        <PulseDot delay="150ms" />
        <PulseDot delay="300ms" />
      </div>

      <h2 className="mt-8 text-xl font-bold text-center text-black">
        맞춤 설계사를 찾고 있어요
      </h2>
      <p className="mt-2 text-sm text-[#4b4b4b] text-center">
        잠시만 기다려주세요
      </p>

      <ul className="mt-10 w-full max-w-xs flex flex-col gap-3">
        {MATCHING_STEPS.map((label, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 text-sm transition-colors",
                done
                  ? "text-black"
                  : active
                    ? "text-black font-medium"
                    : "text-[#afafaf]",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full border transition-colors",
                  done
                    ? "bg-black border-black text-white"
                    : active
                      ? "border-black"
                      : "border-[#e2e2e2]",
                )}
              >
                {done ? (
                  <CheckIcon />
                ) : active ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                ) : null}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function PulseDot({ delay }: { delay: string }) {
  return (
    <span
      className="block w-3 h-3 rounded-full bg-black animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 6.5L5 9.5L10 3.5" />
    </svg>
  );
}

/* ============================================================
 * UI primitives
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
        className="h-12 px-3 pr-10 text-sm"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4b4b4b] pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

/**
 * BigCard — 성별 선택용 큰 타일.
 */
function BigCard({
  emoji,
  label,
  selected,
  onClick,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-8 rounded-xl transition-colors",
        selected
          ? "bg-black text-white"
          : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
      )}
    >
      <span className="text-3xl">{emoji}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
