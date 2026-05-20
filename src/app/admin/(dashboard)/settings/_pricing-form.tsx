"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAllPriceTiers } from "@/features/plan-request-pricing/actions";
import type { PriceTier } from "@/features/plan-request-pricing/schema";

/**
 * 가격 tier 일괄 편집 — 모든 row 한 form, 한 액션으로 atomic 저장.
 *
 * 데이터 모델 결정:
 *   - 비중첩 + 연속 구간이라는 제약은 본질적으로 boundary 모델. row i 의 max 와
 *     row i+1 의 min 이 같은 boundary 라는 사실을 UI 가 직접 표현하므로 사용자는
 *     사이 boundary 만 N-1 개 입력. 첫 row 의 min=0, 마지막 row 의 max=∞ 는
 *     자동.
 *   - 입력은 만원 단위. 원 환산은 server action 에서.
 *
 * UX 결정:
 *   - row 헤더의 "5~10만원" 라이브 라벨이 인접 boundary 와 가격을 동시에 식별
 *     해주므로, 입력 칸의 라벨/outline 은 모두 제거. placeholder + "만원" suffix
 *     로 식별.
 *   - 저장 시 클라이언트가 boundary 오름차순으로 정렬 → 사용자는 입력 순서를
 *     신경쓰지 않아도 됨.
 *   - 부모 page 에 key 가 걸려 있어 server action 성공 후 revalidate 로 새 prop
 *     이 흘러올 때 컴포넌트가 remount, useState 의 stale draft 가 자동 폐기.
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

      <p className="text-xs text-[#4b4b4b]">
        만원 단위로 입력. 저장 시 전체 구간을 한 번에 갈아끼워요 — 진행 중 요청은
        snapshot 으로 보존돼요.
      </p>

      <div className="flex flex-col">
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

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_TIERS}
        className="h-10 rounded-full border border-dashed border-[#cfcfcf] text-sm font-medium text-[#4b4b4b] transition-colors hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        + tier 추가
      </button>

      {errors?._form && errors._form.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-red-50 p-3 text-xs text-red-600">
          {errors._form.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {success && (
        <p className="text-xs text-black">
          저장되었습니다. 다음 신규 요청부터 적용돼요.
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
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
          className="h-11 rounded-full px-6 text-sm font-medium"
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
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-[#f4f4f4] py-3 last:border-b-0">
      <span className="w-5 text-xs tabular-nums text-[#afafaf]">
        {index + 1}
      </span>
      <p
        className={
          invalid ? "text-sm font-medium text-red-600" : "text-sm font-medium text-black"
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
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9c9c9c]">
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
