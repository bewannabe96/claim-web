"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { BrandMark } from "@/components/brand-mark";
import { StickyBottomBar } from "@/components/sticky-bottom-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBudgetRange } from "@/features/plan-request-pricing/format";
import type { PriceTier } from "@/features/plan-request-pricing/schema";
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
import {
  Chip,
  ChipGroup,
  ProgressSegment,
} from "@/features/plan-requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";

/* ============================================================
 * Form state — 모든 phase 가 공유. 이름·전화번호·성별은 confirm 단계에서 따로 수집.
 *
 * coverage 입력은 flat 필드 (coverageIntent / focusedConcerns) 로 두어 form
 * interaction 이 단순하고, 제출 시점에 schema 의 CoverageRequest discriminated
 * union 으로 변환.
 * ============================================================ */

type FormState = {
  // coverage phase
  coverageIntent?: CoverageIntent;
  /** focused 일 때 선택된 질병/상황 id 들 (multi-select) */
  focusedConcerns: FocusedConcernId[];
  /** 그외 요청사항 (자유 텍스트, 선택) */
  additionalNotes?: string;
  // budget phase
  monthlyBudgetMin?: string;
  monthlyBudgetMax?: string;
  // medical phase: 직업 + 병력 (직업은 매칭/제안서 작성에 필수 컨텍스트)
  occupation?: string;
  medicalHistory: MedicalHistoryEntry[];
};

/**
 * 보험료 옵션 — 진실 공급원은 DB `plan_request_price_tier`. 부모 server component
 * 가 listPriceTiers() 로 읽어 prop 으로 내려줌. admin 이 추가/삭제/가격수정 한 결과가
 * 그대로 반영됨.
 */
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

const PHASE_KEYS = [
  "coverage",
  "budget",
  "medical",
  "notes",
] as const;
type PhaseKey = (typeof PHASE_KEYS)[number];

const PHASES: Record<PhaseKey, { title: string }> = {
  coverage: { title: "무엇을 대비하고 싶으세요?" },
  budget: { title: "월 보험료는 어느 정도 생각하세요?" },
  medical: { title: "보다 최적화된 제안서를 받기 위해 알려주세요" },
  notes: { title: "마지막으로 더 알려주실 내용이 있나요?" },
};

/** 매칭 로딩 화면 최소 노출 시간 (ms). */
const MIN_MATCHING_MS = 2800;

/**
 * Wizard submit 의 종결 — finalize 책임을 호출자에게 위임하기 위한 contract.
 *
 * v1 실 라우트: submitStep1 server action 호출 + 성공 시 `/plan-request/{id}/candidates`.
 * v2 mock / 풀 path: in-memory 또는 회원 컨텍스트의 finalize + dispatched 페이지로 직진.
 *
 * wizard 는 UI / 상태 / 매칭 로딩 화면만 책임지고, 어떤 action 으로 어디로 가는지는
 * caller 가 결정 (PRD v2 §5.4 — wizard 재사용 전략).
 */
export type Step1SubmitOutcome =
  | { ok: true; nextHref: string }
  | { ok: false; errorMessage: string };

export function Step1Wizard({
  priceTiers,
  onSubmit,
  showMatchingScreen = true,
}: {
  priceTiers: PriceTier[];
  /** wizard 가 채운 FormData 를 받아 finalize → nextHref 또는 errorMessage 반환. */
  onSubmit: (fd: FormData) => Promise<Step1SubmitOutcome>;
  /**
   * submit 직후 "맞춤 설계사를 찾고 있어요" 매칭 로딩 화면을 보일지. default true.
   *
   * v1 흐름은 wizard submit 이 곧 finalize 라 후보 산출이라는 의미가 있어 매칭
   * 화면이 자연스럽다. v2 풀 path (PRD §4.3) 는 wizard submit 다음 화면이
   * candidates 선택이라 "찾는 중" 화면이 의미상 중복 — false 로 끄면 MatchingScreen
   * 도 안 보이고 MIN_MATCHING_MS 인공 지연도 적용 안 됨 (submit button 의 pending
   * state 만 짧게 노출 후 곧장 다음 화면).
   */
  showMatchingScreen?: boolean;
}) {
  const router = useRouter();
  const budgetOptions = toBudgetOptions(priceTiers);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [data, setData] = useState<FormState>({
    medicalHistory: [],
    focusedConcerns: [],
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // submit 성공 후 router.replace 가 다음 화면으로 갈아끼울 때까지 true 유지.
  // async transition 은 router.replace 호출 직후 resolve 되어 navigate 완료 전에
  // isPending 이 false 로 떨어진다 — 그 한 프레임 동안 reset 된 1단계 form 이 flash
  // 되는 걸 막는 게이트. replace 가 이 컴포넌트를 unmount 하며 자연히 해제된다.
  const [navigating, setNavigating] = useState(false);

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

    const fd = new FormData();
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
      const outcome = await onSubmit(fd);
      // MatchingScreen 노출 시에만 최소 노출 시간 보장 — 끄면 즉시 다음 화면으로 직진.
      if (showMatchingScreen) {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_MATCHING_MS - elapsed);
        await new Promise((r) => setTimeout(r, remaining));
      }

      if (outcome.ok) {
        // navigate 완료(=이 컴포넌트 unmount)까지 켜 두는 게이트. async transition 은
        // router.replace 호출 직후 resolve 돼 isPending 이 navigate 전에 풀리므로,
        // 그 사이 커버(MatchingScreen)·pending button 을 유지하려면 별도 플래그가 필요.
        setNavigating(true);
        if (showMatchingScreen) {
          // v1: MatchingScreen 이 navigate 동안 화면을 덮으므로 여기서 phase/data 를
          // 리셋해도 사용자에게 안 보인다. Router Cache 가 client state 를 보존하는
          // 환경에서 다음 진입을 fresh 하게 만드는 안전장치 (CLAUDE.md 의 reset 패턴).
          setPhaseIdx(0);
          setData({ medicalHistory: [], focusedConcerns: [] });
        }
        // v2 풀 path 는 덮개가 없다 — 여기서 리셋하면 reset 된 1단계가 그대로 노출되고
        // 그게 곧 flash 다. 마지막 phase 를 유지한 채 candidates 로 직행한다. cross-route
        // replace 가 wizard 를 unmount 하므로 다음 진입은 어차피 새 mount(=초기 state).
        // replace 로 wizard URL 이 history 에 남지 않게 함.
        router.replace(outcome.nextHref as never);
        return;
      }

      setServerError(outcome.errorMessage);
    });
  }

  // v1: navigate fetch 끝(=unmount)까지 MatchingScreen 유지 — isPending 은 replace
  // 직후 풀리므로 navigating 으로 연장. "맞춤 설계사를 찾고 있어요" 는 v1 의 의도된 화면.
  if (showMatchingScreen && (isPending || navigating)) return <MatchingScreen />;
  // v2 풀 path 는 별도 전환 화면 없음 — 마지막 phase 를 그대로 유지(리셋 안 함)하고
  // 제출 button 만 navigating 동안 pending 으로 둔다. candidates 가 그려지면 자연히 swap.

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 bg-white">
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
          {phaseKey === "coverage" && (
            <CoverageFields data={data} setData={setData} />
          )}

          {phaseKey === "budget" && (
            <BudgetFields
              data={data}
              setData={setData}
              options={budgetOptions}
            />
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

      <StickyBottomBar>
        <div className="flex items-stretch gap-3">
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
            disabled={!canProceed || isPending || navigating}
            className="flex-1 h-14 rounded-full text-base font-medium"
          >
            {isPending || navigating
              ? "이동 중..."
              : isLast
                ? "설계사 찾기"
                : "다음"}
          </Button>
        </div>
      </StickyBottomBar>
    </main>
  );
}

function isPhaseValid(phase: PhaseKey, d: FormState): boolean {
  switch (phase) {
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
      // 직업 필수 + 병력 row 마다 모든 필수 필드 채워졌는지. 빈 배열은 OK.
      return (
        !!d.occupation &&
        d.occupation.trim().length > 0 &&
        d.medicalHistory.every(isMedicalEntryComplete)
      );
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
  options,
}: {
  data: FormState;
  setData: React.Dispatch<React.SetStateAction<FormState>>;
  options: ReadonlyArray<BudgetOption>;
}) {
  if (options.length === 0) {
    return (
      <p className="text-sm text-[#4b4b4b]">
        보험료 옵션이 아직 등록되지 않았어요. 잠시 후 다시 시도해주세요.
      </p>
    );
  }
  return (
    <ChipGroup>
      {options.map((opt) => {
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
    <div className="flex flex-col gap-6">
      <Field label="직업">
        <Input
          type="text"
          maxLength={50}
          placeholder="예: 반도체연구원, 학원선생님, 트럭운전사"
          value={data.occupation ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, occupation: e.target.value }))
          }
          className={cn("h-14 px-4 text-sm", NO_TRACK_CLASS)}
        />
      </Field>

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
    </div>
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
      // 자유 텍스트 — 가족 병력, 구체 질환명 등 어떤 PII 가 들어갈지 통제 불가.
      className={cn(
        "w-full px-4 py-3 text-sm rounded-lg border border-black resize-none focus:outline-none focus:ring-2 focus:ring-black/10",
        NO_TRACK_CLASS,
      )}
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
    // 카드 전체가 가입자 병력 — 진단명/날짜/입원/외래/수술 모두 민감 의료정보.
    // 카드 안 chip 선택/삭제 click 추적은 잃지만, 카드 add (외부 button) 와 form
    // 제출 (외부 CTA) 는 그대로 추적되어 funnel 분석엔 영향 없음.
    <div
      className={cn(
        "rounded-xl border border-[#e2e2e2] bg-white p-4 flex flex-col gap-4",
        NO_TRACK_CLASS,
      )}
    >
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
          className="h-12 px-3"
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
          className="h-12 px-3"
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
        className="h-12 px-3 pr-10"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4b4b4b] pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

