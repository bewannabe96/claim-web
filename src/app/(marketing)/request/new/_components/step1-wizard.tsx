"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { submitStep1 } from "@/features/requests/actions";
import {
  Chip,
  ChipGroup,
  ProgressSegment,
} from "@/features/requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";
import {
  AGE_RANGES,
  AGE_RANGE_LABEL,
  INSURANCE_CATEGORIES,
  INSURANCE_CATEGORY_LABEL,
  KOREAN_REGIONS,
  type AgeRange,
  type Gender,
  type InsuranceCategory,
  type KoreanRegion,
} from "@/types";

type FormState = {
  ageRange?: AgeRange;
  gender?: Gender;
  categories: InsuranceCategory[];
  region?: KoreanRegion;
  monthlyBudgetMin?: string;
  monthlyBudgetMax?: string;
};

/** 보험료 옵션 — 칩 선택용 */
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

const STEP_KEYS = [
  "age",
  "gender",
  "categories",
  "region",
  "budget",
] as const;
type StepKey = (typeof STEP_KEYS)[number];

const QUESTIONS: Record<StepKey, { title: string; helper?: string }> = {
  age: { title: "연령대를 알려주세요" },
  gender: { title: "성별을 알려주세요" },
  categories: {
    title: "관심 있는 보험을 선택해주세요",
    helper: "여러 개 선택 가능해요",
  },
  region: { title: "거주 지역은 어디인가요?" },
  budget: { title: "월 예상 보험료를 선택해주세요" },
};

/** 매칭 로딩 화면 최소 노출 시간 (ms). 응답이 빠르더라도 이 시간만큼 보여줌. */
const MIN_MATCHING_MS = 2800;

export function Step1Wizard() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [data, setData] = useState<FormState>({ categories: [] });
  const [phase, setPhase] = useState<"form" | "matching">("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const total = STEP_KEYS.length;
  const stepKey = STEP_KEYS[stepIdx];
  const isLast = stepIdx === total - 1;

  const canProceed = isStepValid(stepKey, data);

  function next() {
    if (!isLast && canProceed) setStepIdx((i) => i + 1);
  }
  function prev() {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }

  function handleSubmit() {
    if (!canProceed) return;
    setServerError(null);
    setPhase("matching");

    const fd = new FormData();
    if (data.ageRange) fd.append("ageRange", data.ageRange);
    if (data.gender) fd.append("gender", data.gender);
    data.categories.forEach((c) => fd.append("categories", c));
    if (data.region) fd.append("region", data.region);
    if (data.monthlyBudgetMin) fd.append("monthlyBudgetMin", data.monthlyBudgetMin);
    if (data.monthlyBudgetMax) fd.append("monthlyBudgetMax", data.monthlyBudgetMax);

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
        30초 안에 나와 맞는 설계사를 추천해드려요
      </p>

      {/* Progress — 마이크로 step 갯수만큼 segment, 진행 중인 step까지 채움 */}
      <div className="mt-6 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <ProgressSegment key={i} fill={i <= stepIdx ? 1 : 0} />
        ))}
      </div>

      {/* Question area */}
      <div className="mt-10 flex flex-col flex-1">
        <h2 className="text-xl font-bold text-black leading-tight">
          {QUESTIONS[stepKey].title}
        </h2>
        {QUESTIONS[stepKey].helper && (
          <p className="mt-1 text-sm text-[#4b4b4b]">
            {QUESTIONS[stepKey].helper}
          </p>
        )}

        <div className="mt-6">
          {stepKey === "age" && (
            <ChipGroup>
              {AGE_RANGES.map((a) => (
                <Chip
                  key={a}
                  selected={data.ageRange === a}
                  onClick={() => setData((d) => ({ ...d, ageRange: a }))}
                >
                  {AGE_RANGE_LABEL[a]}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {stepKey === "gender" && (
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

          {stepKey === "categories" && (
            <ChipGroup>
              {INSURANCE_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  selected={data.categories.includes(c)}
                  onClick={() =>
                    setData((d) => ({
                      ...d,
                      categories: d.categories.includes(c)
                        ? d.categories.filter((x) => x !== c)
                        : [...d.categories, c],
                    }))
                  }
                >
                  {INSURANCE_CATEGORY_LABEL[c]}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {stepKey === "region" && (
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

          {stepKey === "budget" && (
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

        </div>
      </div>

      {/* Server-side error (e.g. duplicate phone) */}
      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">
          {serverError}
        </p>
      )}

      {/* CTA — 마지막 step은 직접 핸들러 호출. Secondary white + Primary black 페어. */}
      <div className="pt-6 flex items-stretch gap-3">
        {stepIdx > 0 && (
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

function isStepValid(step: StepKey, d: FormState): boolean {
  switch (step) {
    case "age":
      return !!d.ageRange;
    case "gender":
      return !!d.gender;
    case "categories":
      return d.categories.length > 0;
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
  }
}

/* ============================================================
 * 매칭 로딩 화면 — "전문 시스템이 일하고 있다" 인상
 * ============================================================ */

const MATCHING_STEPS = [
  "관심 보장 분야 분석 중",
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
 * UI primitives — Step1 전용 (BigCard 는 성별 선택만 사용)
 * ============================================================ */

/**
 * BigCard — 성별 선택 같은 큰 타일.
 * 카드 컨벤션: rounded-xl(12px) + 선택 시 검정 인버전.
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
