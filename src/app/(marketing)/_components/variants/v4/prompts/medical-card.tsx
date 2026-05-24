"use client";

import { useState } from "react";

import { NO_TRACK_CLASS } from "@/components/analytics/no-track";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TREATMENT_PERIODS,
  TREATMENT_PERIOD_LABEL,
  type MedicalHistoryEntry,
  type TreatmentPeriod,
} from "@/features/plan-requests/schema";
import {
  Chip,
  ChipGroup,
} from "@/features/plan-requests/ui/wizard-primitives";
import { cn } from "@/lib/utils";

/**
 * Q4.5 — 병력 입력 인라인 카드 셋.
 *
 * 하단 슬롯에 들어가는 사이즈가 크지만, 단계 진행 자체가 멈춰있는 phase 라
 * 키보드 올라온 상태에서 카드 내부 스크롤로 처리. 슬롯 자체에는 max-height
 * + overflow-y-auto 가 chatbot-shell 의 슬롯 컨테이너에 걸린다.
 *
 * "병력 추가" 로 카드 인스턴스 1개씩 늘려가다 (최대 20건) "다 적었어요" 클릭
 * 시 onConfirm(entries) — chatbot-shell 이 medicalHistory 에 set + Q5 로 전이.
 * 모든 필드가 채워지지 않은 카드가 있으면 "다 적었어요" disabled.
 */
export function MedicalCardPrompt({
  onConfirm,
}: {
  onConfirm: (entries: MedicalHistoryEntry[]) => void;
}) {
  const [entries, setEntries] = useState<MedicalHistoryEntry[]>(() => [
    emptyEntry(),
  ]);

  function update(idx: number, patch: Partial<MedicalHistoryEntry>) {
    setEntries((es) => es.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function add() {
    if (entries.length >= 20) return;
    setEntries((es) => [...es, emptyEntry()]);
  }
  function remove(idx: number) {
    setEntries((es) => es.filter((_, i) => i !== idx));
  }

  const allComplete = entries.length > 0 && entries.every(isComplete);

  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
      {entries.map((entry, idx) => (
        <Card
          key={idx}
          entry={entry}
          index={idx}
          canRemove={entries.length > 1}
          onChange={(patch) => update(idx, patch)}
          onRemove={() => remove(idx)}
        />
      ))}
      <button
        type="button"
        onClick={add}
        disabled={entries.length >= 20}
        className={cn(
          "h-12 rounded-lg border-2 border-dashed text-sm font-medium transition-colors",
          entries.length >= 20
            ? "cursor-not-allowed border-[#e2e2e2] text-[#afafaf]"
            : "border-[#e2e2e2] text-black hover:border-black hover:bg-[#fafafa]",
        )}
      >
        + 병력 추가
      </button>
      <Button
        type="button"
        onClick={() => onConfirm(entries)}
        disabled={!allComplete}
        className="h-14 w-full rounded-full text-sm font-medium"
      >
        다 적었어요
      </Button>
    </div>
  );
}

function emptyEntry(): MedicalHistoryEntry {
  return {
    diagnosis: "",
    treatmentPeriod: "within_3m",
    treatmentStartDate: "",
    hospitalizationDays: 0,
    outpatientVisits: 0,
    hadSurgery: false,
  };
}

function isComplete(e: MedicalHistoryEntry): boolean {
  return (
    e.diagnosis.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.treatmentStartDate) &&
    e.hospitalizationDays >= 0 &&
    e.outpatientVisits >= 0
  );
}

function Card({
  entry,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  entry: MedicalHistoryEntry;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<MedicalHistoryEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-[#e2e2e2] bg-white p-4",
        NO_TRACK_CLASS,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#4b4b4b]">병력 {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-[#4b4b4b] underline hover:text-black"
          >
            삭제
          </button>
        )}
      </div>

      <Field label="진단명">
        <Input
          type="text"
          maxLength={100}
          placeholder="예: 고혈압, 갑상선 결절"
          value={entry.diagnosis}
          onChange={(e) => onChange({ diagnosis: e.target.value })}
          className="h-12 px-3 text-sm"
        />
      </Field>

      <Field label="치료기간">
        <ChipGroup>
          {TREATMENT_PERIODS.map((p) => (
            <Chip
              key={p}
              selected={entry.treatmentPeriod === p}
              onClick={() => onChange({ treatmentPeriod: p as TreatmentPeriod })}
            >
              {TREATMENT_PERIOD_LABEL[p]}
            </Chip>
          ))}
        </ChipGroup>
      </Field>

      <Field label="치료 시작일">
        <Input
          type="date"
          value={entry.treatmentStartDate}
          onChange={(e) => onChange({ treatmentStartDate: e.target.value })}
          className="h-12 px-3 text-sm"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="입원일수">
          <UnitInput
            value={String(entry.hospitalizationDays ?? 0)}
            suffix="일"
            onChange={(v) => onChange({ hospitalizationDays: Number(v) || 0 })}
          />
        </Field>
        <Field label="외래 횟수">
          <UnitInput
            value={String(entry.outpatientVisits ?? 0)}
            suffix="회"
            onChange={(v) => onChange({ outpatientVisits: Number(v) || 0 })}
          />
        </Field>
      </div>

      <Field label="수술 여부">
        <ChipGroup>
          <Chip
            selected={!entry.hadSurgery}
            onClick={() => onChange({ hadSurgery: false })}
          >
            수술 없음
          </Chip>
          <Chip
            selected={entry.hadSurgery}
            onClick={() => onChange({ hadSurgery: true })}
          >
            수술 있음
          </Chip>
        </ChipGroup>
      </Field>
    </div>
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
        className="h-12 px-3 pr-8 text-sm"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#4b4b4b]">
        {suffix}
      </span>
    </div>
  );
}
