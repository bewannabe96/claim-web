"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitStep1 } from "@/features/requests/actions";
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
} from "@/features/requests/schema";
import {
  Chip,
  ChipGroup,
  ProgressSegment,
} from "@/features/requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";
import { type Gender } from "@/types";

/* ============================================================
 * Form state — 모든 phase 가 공유. 이름·전화번호는 confirm 단계에서 따로 수집.
 *
 * coverage 입력은 flat 필드 (coverageIntent / focusedConcerns) 로 두어 form
 * interaction 이 단순하고, 제출 시점에 schema 의 CoverageRequest discriminated
 * union 으로 변환.
 * ============================================================ */

type FormState = {
  // basic phase: 성별 + 직업
  gender?: Gender;
  occupation?: string;
  // coverage phase
  coverageIntent?: CoverageIntent;
  /** focused 일 때 선택된 질병/상황 id 들 (multi-select) */
  focusedConcerns: FocusedConcernId[];
  /** 그외 요청사항 (자유 텍스트, 선택) */
  additionalNotes?: string;
  // budget phase
  monthlyBudgetMin?: string;
  monthlyBudgetMax?: string;
  // medical phase
  medicalHistory: MedicalHistoryEntry[];
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
  "basic",
  "coverage",
  "budget",
  "medical",
  "notes",
] as const;
type PhaseKey = (typeof PHASE_KEYS)[number];

const PHASES: Record<PhaseKey, { title: string }> = {
  basic: { title: "기본 정보를 알려주세요" },
  coverage: { title: "무엇을 대비하고 싶으세요?" },
  budget: { title: "월 보험료는 어느 정도 생각하세요?" },
  medical: { title: "보다 최적화된 제안서를 받기 위해 알려주세요" },
  notes: { title: "마지막으로 더 알려주실 내용이 있나요?" },
};

/** 매칭 로딩 화면 최소 노출 시간 (ms). */
const MIN_MATCHING_MS = 2800;

export function Step1Wizard() {
  const router = useRouter();
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [data, setData] = useState<FormState>({
    medicalHistory: [],
    focusedConcerns: [],
  });
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
    if (data.occupation) fd.append("occupation", data.occupation);
    if (data.monthlyBudgetMin)
      fd.append("monthlyBudgetMin", data.monthlyBudgetMin);
    if (data.monthlyBudgetMax)
      fd.append("monthlyBudgetMax", data.monthlyBudgetMax);
    fd.append("coverage", JSON.stringify(buildCoverage(data)));
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
        설계사가 제안하고,
        <br />
        AI가 비교하고,
        <br />
        당신은 선택합니다.
      </h1>
      <p className="mt-3 text-xs text-[#4b4b4b]">
        간단한 요청 한 번으로 여러 제안서를 받아볼 수 있어요
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

        <div className="mt-6">
          {phaseKey === "basic" && (
            <BasicFields data={data} setData={setData} />
          )}

          {phaseKey === "coverage" && (
            <CoverageFields data={data} setData={setData} />
          )}

          {phaseKey === "budget" && (
            <BudgetFields data={data} setData={setData} />
          )}

          {phaseKey === "medical" && (
            <MedicalFields data={data} setData={setData} />
          )}

          {phaseKey === "notes" && (
            <NotesFields data={data} setData={setData} />
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
    case "basic":
      return !!d.gender && !!d.occupation && d.occupation.trim().length > 0;
    case "coverage": {
      // 의도 필수. focused 면 chip 최소 1개.
      if (!d.coverageIntent) return false;
      if (d.coverageIntent === "focused" && d.focusedConcerns.length === 0) {
        return false;
      }
      return true;
    }
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
    case "medical":
      // 병력 row 마다 모든 필수 필드 채워졌는지. 빈 배열은 OK (없으면 비워둠).
      return d.medicalHistory.every(isMedicalEntryComplete);
    case "notes":
      // 그외 요청사항 — 항상 선택. 비어있어도 통과.
      return true;
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
 * Basic phase — 성별 + 직업
 * ============================================================ */

function BasicFields({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="성별">
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
      </Field>

      <Field label="직업">
        <Input
          type="text"
          maxLength={50}
          placeholder="예: 반도체연구원, 학원선생님, 트럭운전사"
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
 * Coverage phase — 가입 의도 → (focused 시) 질병/상황 chip
 *
 * 흐름:
 *   1. 종합 / 특정 보장 집중 둘 중 선택 (IntentCard)
 *   2. focused 면 대비하고 싶은 질병/상황 chip 멀티선택
 *
 * 서버 제출 시 buildCoverage 가 schema 의 CoverageRequest discriminated union
 * 으로 변환. JSON 직렬화 후 hidden field 로 action 에 전달.
 * ============================================================ */

function CoverageFields({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  function toggleConcern(id: FocusedConcernId) {
    setData((d) => {
      const has = d.focusedConcerns.includes(id);
      return {
        ...d,
        focusedConcerns: has
          ? d.focusedConcerns.filter((x) => x !== id)
          : [...d.focusedConcerns, id],
      };
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <IntentCard
        title="종합적으로 알아보고 있어요"
        selected={data.coverageIntent === "broad"}
        onClick={() => setData((d) => ({ ...d, coverageIntent: "broad" }))}
      />
      <IntentCard
        title="대비하고 싶은 질병이나 상황이 있어요"
        selected={data.coverageIntent === "focused"}
        onClick={() => setData((d) => ({ ...d, coverageIntent: "focused" }))}
      />

      {/* focused 일 때만 — IntentCard 바로 아래 작은 간격으로 붙임 */}
      {data.coverageIntent === "focused" && (
        <ChipGroup>
          {FOCUSED_CONCERN_IDS.map((id) => (
            <Chip
              key={id}
              selected={data.focusedConcerns.includes(id)}
              onClick={() => toggleConcern(id)}
            >
              {FOCUSED_CONCERN_LABEL[id]}
            </Chip>
          ))}
        </ChipGroup>
      )}
    </div>
  );
}

/**
 * 가입 의도 선택 카드 — title 만 가진 가로 풀폭 버튼.
 * Phase title 이 직접 prompt 가 되므로 부가 설명은 두지 않음.
 */
function IntentCard({
  title,
  selected,
  onClick,
}: {
  title: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-5 py-4 rounded-xl text-left text-base font-medium transition-colors",
        selected
          ? "bg-black text-white"
          : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
      )}
    >
      {title}
    </button>
  );
}

/**
 * Flat form state → schema 의 CoverageRequest discriminated union 변환.
 * isPhaseValid 가 이미 broad/focused 케이스를 차단하므로 여기선 분기만 처리.
 */
function buildCoverage(d: FormState): CoverageRequest {
  if (d.coverageIntent === "focused") {
    return {
      intent: "focused",
      concerns: d.focusedConcerns,
    };
  }
  return { intent: "broad" };
}

/* ============================================================
 * Budget phase — 월 보험료 chip (단일 선택, min/max 동시 set)
 * ============================================================ */

function BudgetFields({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
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
  );
}

/* ============================================================
 * Medical phase — 병력 (선택, 빈 배열 허용)
 * ============================================================ */

function MedicalFields({
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

  function updateMedicalEntry(
    idx: number,
    patch: Partial<MedicalHistoryEntry>,
  ) {
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
    <Field label="병력" optional>
      <div className="flex flex-col gap-3">
        {data.medicalHistory.length > 0 && (
          <p className="text-xs text-[#4b4b4b]">
            {data.medicalHistory.length}건 추가됨
          </p>
        )}

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
    </Field>
  );
}

/* ============================================================
 * Notes phase — 그외 요청사항 (자유 텍스트, 선택)
 * ============================================================ */

function NotesFields({
  data,
  setData,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <textarea
      maxLength={1000}
      rows={6}
      placeholder={`예를 들어:
당뇨가 있어서 당뇨로 생길 수 있는 병을 잘 대비하고 싶어요
납입면제는 꼭 들어갔으면 좋겠어요
가족이 유방암을 앓으셨어서 암 보장이 탄탄했으면 좋겠어요`}
      value={data.additionalNotes ?? ""}
      onChange={(e) =>
        setData((d) => ({ ...d, additionalNotes: e.target.value }))
      }
      className="w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
    />
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
  "요청서 분석 중",
  "보장 요구사항 매칭 중",
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
