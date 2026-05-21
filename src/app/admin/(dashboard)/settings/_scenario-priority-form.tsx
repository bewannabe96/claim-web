"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { saveScenarioPriority } from "@/features/admin/actions";
import {
  CATEGORY_LABEL,
  KNOWN_CATEGORIES,
  type KnownCategory,
  labelForCategory,
} from "@/features/plan-proposals/category-labels";
import { cn } from "@/lib/utils";

import { Banner, Card } from "../_components/page-shell";

/**
 * 결과 페이지 시나리오 우선순위 편집 — 어드민이 카테고리를 골라 ordered list 로 관리.
 */
export function ScenarioPriorityForm({
  initial,
}: {
  initial: readonly string[];
}) {
  // 라벨 없는 잔여 (운영상 빠진 매핑) 는 무시 — 어드민이 다시 선택하게 강제.
  const initialKnown = useMemo(
    () =>
      initial.filter((c): c is KnownCategory =>
        (KNOWN_CATEGORIES as readonly string[]).includes(c),
      ),
    [initial],
  );

  const [priority, setPriority] = useState<KnownCategory[]>(initialKnown);
  const [state, formAction, pending] = useActionState(
    saveScenarioPriority,
    undefined,
  );
  const errors = state && "errors" in state ? state.errors : undefined;
  const success = state && "ok" in state && state.ok;

  const prioritySet = useMemo(() => new Set(priority), [priority]);

  const available = useMemo(
    () =>
      KNOWN_CATEGORIES.filter((c) => !prioritySet.has(c)).sort((a, b) =>
        CATEGORY_LABEL[a].localeCompare(CATEGORY_LABEL[b], "ko"),
      ),
    [prioritySet],
  );

  function moveUp(idx: number) {
    if (idx === 0) return;
    setPriority((arr) => {
      const next = [...arr];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveDown(idx: number) {
    setPriority((arr) => {
      if (idx >= arr.length - 1) return arr;
      const next = [...arr];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next;
    });
  }
  function remove(idx: number) {
    setPriority((arr) => arr.filter((_, i) => i !== idx));
  }
  function add(category: KnownCategory) {
    setPriority((arr) => [...arr, category]);
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input
        type="hidden"
        name="scenarioPriority"
        value={JSON.stringify(priority)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListPanel
          title="우선순위"
          count={priority.length}
          hint="위→아래 순서대로 표시"
        >
          {priority.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-[#afafaf]">
              우선순위가 비어 있어요.
              <br />
              오른쪽에서 카테고리를 골라 추가하세요.
            </p>
          ) : (
            <ol className="divide-y divide-[#efefef]">
              {priority.map((category, idx) => (
                <li
                  key={category}
                  className="flex items-center gap-2 px-4 py-2.5"
                >
                  <span className="w-6 text-xs font-bold text-[#afafaf] tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-black truncate">
                    {labelForCategory(category)}
                  </span>
                  <IconButton
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    label="위로"
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    onClick={() => moveDown(idx)}
                    disabled={idx === priority.length - 1}
                    label="아래로"
                  >
                    ↓
                  </IconButton>
                  <IconButton onClick={() => remove(idx)} label="제거">
                    ×
                  </IconButton>
                </li>
              ))}
            </ol>
          )}
        </ListPanel>

        <ListPanel
          title="미등재"
          count={available.length}
          hint="모달 “기타” 영역에 가나다순 노출"
        >
          {available.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-[#afafaf]">
              모든 카테고리가 우선순위에 등재됐어요.
            </p>
          ) : (
            <ul className="divide-y divide-[#efefef] max-h-96 overflow-y-auto">
              {available.map((category) => (
                <li key={category}>
                  <button
                    type="button"
                    onClick={() => add(category)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-[#fafafa]"
                  >
                    <span className="text-sm text-black truncate">
                      {labelForCategory(category)}
                    </span>
                    <span className="text-xs text-[#afafaf]">＋</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ListPanel>
      </div>

      {errors?.scenarioPriority && (
        <Banner tone="error">{errors.scenarioPriority[0]}</Banner>
      )}
      {errors?._form && <Banner tone="error">{errors._form[0]}</Banner>}
      {success && (
        <Banner tone="success">저장되었습니다. 결과 페이지에 즉시 반영돼요.</Banner>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full px-8 text-sm font-medium"
        >
          {pending ? "저장 중..." : "우선순위 저장"}
        </Button>
      </div>
    </form>
  );
}

function ListPanel({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="none">
      <div className="px-4 py-3 border-b border-[#efefef] flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-black tracking-tight">
          {title}{" "}
          <span className="text-xs font-medium text-[#afafaf] tabular-nums">
            {count}
          </span>
        </h3>
        <p className="text-[11px] text-[#afafaf]">{hint}</p>
      </div>
      {children}
    </Card>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "w-7 h-7 rounded-md text-xs grid place-items-center transition-colors",
        disabled
          ? "text-[#d4d4d4] cursor-default"
          : "text-[#4b4b4b] hover:bg-[#f4f4f4] hover:text-black",
      )}
    >
      {children}
    </button>
  );
}
