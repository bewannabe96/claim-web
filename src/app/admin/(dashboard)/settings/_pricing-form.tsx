"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAllPriceTiers } from "@/features/plan-request-pricing/actions";
import type { PriceTier } from "@/features/plan-request-pricing/schema";

import { Banner, Card } from "../_components/page-shell";

/**
 * 가격 tier 일괄 편집 — 모든 row 한 form, 한 액션으로 atomic 저장.
 */

const MAX_TIERS = 20;

type RowDraft = {
  /** 만원 단위 정수의 string. 마지막 row 는 빈 문자열 (UI 상 "∞"). */
  budgetMaxManwon: string;
  priceManwon: string;
};

export function PricingForm({ tiers }: { tiers: PriceTier[] }) {
  const initial = toDrafts(tiers);
  const [rows, setRows] = useState<RowDraft[]>(initial);
  const [state, formAction, pending] = useActionState(
    saveAllPriceTiers,
    undefined,
  );
  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  const isDirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const payloadJson = JSON.stringify(toPayload(rows));

  function updateRow(i: number, patch: Partial<RowDraft>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    if (rows.length >= MAX_TIERS) return;
    setRows((rs) => {
      const last = rs[rs.length - 1];
      return [
        ...rs.slice(0, -1),
        { budgetMaxManwon: "", priceManwon: "" },
        last,
      ];
    });
  }

  function removeRow(i: number) {
    if (rows.length <= 1) return;
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  function reset() {
    setRows(initial);
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={payloadJson} />

      <Card padding="none">
        <div className="divide-y divide-[#efefef]">
          {rows.map((row, i) => (
            <TierRow
              key={i}
              index={i}
              row={row}
              isLast={i === rows.length - 1}
              minManwon={i === 0 ? 0 : numericOr(rows[i - 1].budgetMaxManwon, 0)}
              canDelete={rows.length > 1}
              onChange={(patch) => updateRow(i, patch)}
              onRemove={() => removeRow(i)}
            />
          ))}
        </div>
      </Card>

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_TIERS}
        className="h-10 rounded-full border border-dashed border-[#cfcfcf] text-sm font-medium text-[#4b4b4b] transition-colors hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        + tier 추가
      </button>

      {errors?._form && errors._form.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {errors._form.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {success && <Banner tone="success">저장되었습니다. 다음 신규 요청부터 적용돼요.</Banner>}

      <div className="flex items-center justify-end gap-3">
        {isDirty && !pending && (
          <button
            type="button"
            onClick={reset}
            className="text-sm text-[#4b4b4b] underline-offset-2 hover:underline"
          >
            되돌리기
          </button>
        )}
        <Button
          type="submit"
          disabled={pending || !isDirty}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? "저장 중..." : "전체 저장"}
        </Button>
      </div>
    </form>
  );
}

function TierRow({
  index,
  row,
  isLast,
  minManwon,
  canDelete,
  onChange,
  onRemove,
}: {
  index: number;
  row: RowDraft;
  isLast: boolean;
  minManwon: number;
  canDelete: boolean;
  onChange: (patch: Partial<RowDraft>) => void;
  onRemove: () => void;
}) {
  const maxManwonNum = isLast ? null : numericOr(row.budgetMaxManwon, null);
  const invalid =
    !isLast &&
    maxManwonNum !== null &&
    maxManwonNum !== 0 &&
    maxManwonNum <= minManwon;
  const label = buildRowLabel(minManwon, maxManwonNum, isLast);

  return (
    <div className="grid grid-cols-[24px_1fr_auto_auto_auto] items-center gap-3 px-5 py-3">
      <span className="text-xs tabular-nums text-[#afafaf]">{index + 1}</span>
      <p
        className={
          invalid
            ? "text-sm font-medium text-red-600"
            : "text-sm font-medium text-black"
        }
      >
        {label}
      </p>
      {isLast ? (
        <div className="w-24" aria-hidden />
      ) : (
        <ManwonInput
          value={row.budgetMaxManwon}
          onChange={(v) => onChange({ budgetMaxManwon: v })}
          max={999}
          placeholder="상한"
        />
      )}
      <ManwonInput
        value={row.priceManwon}
        onChange={(v) => onChange({ priceManwon: v })}
        max={1000}
        placeholder="가격"
      />
      {canDelete ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${index + 1}번째 tier 삭제`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#9c9c9c] transition-colors hover:bg-red-50 hover:text-red-600"
        >
          ×
        </button>
      ) : (
        <span className="w-7" aria-hidden />
      )}
    </div>
  );
}

function ManwonInput({
  value,
  onChange,
  max,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
}) {
  return (
    <div className="relative w-24">
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder={placeholder}
        className="h-10 pr-10 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#afafaf]">
        만원
      </span>
    </div>
  );
}

/* ============================================================
 * 변환 / 라벨 헬퍼
 * ============================================================ */

function toDrafts(tiers: PriceTier[]): RowDraft[] {
  if (tiers.length === 0) return [{ budgetMaxManwon: "", priceManwon: "" }];
  const sorted = tiers.slice().sort((a, b) => a.position - b.position);
  return sorted.map((t, i, arr) => ({
    budgetMaxManwon:
      i === arr.length - 1 ? "" : String((t.budgetMax + 1) / 10_000),
    priceManwon: String(t.price / 10_000),
  }));
}

function toPayload(rows: RowDraft[]) {
  const last = rows[rows.length - 1];
  const others = rows.slice(0, -1).slice();
  others.sort((a, b) => {
    const av = numericOr(a.budgetMaxManwon, Number.POSITIVE_INFINITY);
    const bv = numericOr(b.budgetMaxManwon, Number.POSITIVE_INFINITY);
    return av - bv;
  });
  const sorted = [...others, last];
  return {
    tiers: sorted.map((r, i, arr) => {
      const isLast = i === arr.length - 1;
      return {
        budgetMaxManwon: isLast ? null : nullableNumber(r.budgetMaxManwon),
        priceManwon: nullableNumber(r.priceManwon),
      };
    }),
  };
}

function buildRowLabel(
  minManwon: number,
  maxManwon: number | null,
  isLast: boolean,
): string {
  if (isLast) {
    return minManwon === 0 ? "전체 구간" : `${minManwon}만원 이상`;
  }
  if (maxManwon === null || maxManwon === 0) {
    return minManwon === 0 ? "—" : `${minManwon}만원 이상 ~ ?`;
  }
  if (maxManwon <= minManwon)
    return `${minManwon}만원 이상 ~ ${maxManwon}만원 미만`;
  if (minManwon === 0) return `${maxManwon}만원 미만`;
  return `${minManwon}만원 이상 ~ ${maxManwon}만원 미만`;
}

function numericOr<T>(s: string, fallback: T): number | T {
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(s: string): number | null {
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
