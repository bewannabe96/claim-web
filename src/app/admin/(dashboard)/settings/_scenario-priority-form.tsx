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

/**
 * 결과 페이지 시나리오 우선순위 편집 — 어드민이 카테고리를 골라 ordered list 로 관리.
 *
 * UI 흐름:
 *  - 좌: 현재 우선순위 (위→아래 = 1순위→N순위). 위/아래 이동 + 삭제.
 *  - 우: 미등재 카테고리 (가나다순). 클릭으로 우선순위 끝에 추가.
 *  - 저장 시 ordered JSON 으로 server action 호출.
 *
 * KNOWN_CATEGORIES 외부 키만 추가 가능 (category-labels.ts 에 라벨 있는 것만).
 * 외부 schema 가 새 카테고리 도입 시 라벨 먼저 추가하면 자동 노출.
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
    <form action={formAction} className="flex flex-col gap-4">
      {/* hidden — 액션이 받아 zod 검증. JSON 문자열로 ordered 보존. */}
      <input
        type="hidden"
        name="scenarioPriority"
        value={JSON.stringify(priority)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 우선순위 (ordered) */}
        <div className="rounded-xl border border-[#efefef] bg-white">
          <div className="px-4 py-3 border-b border-[#efefef]">
            <h3 className="text-sm font-bold text-black">
              우선순위 ({priority.length}개)
            </h3>
            <p className="mt-0.5 text-xs text-[#4b4b4b]">
              결과 페이지 top3 와 모달 상단 노출. 위→아래 순서대로 표시.
            </p>
          </div>
          {priority.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[#afafaf]">
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
                  <span className="w-6 text-xs font-bold text-[#4b4b4b] tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-black truncate">
                    {labelForCategory(category)}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    aria-label="위로"
                    className={cn(
                      "w-7 h-7 rounded-md text-xs grid place-items-center",
                      idx === 0
                        ? "text-[#d4d4d4] cursor-default"
                        : "text-[#4b4b4b] hover:bg-[#f4f4f4]",
                    )}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx === priority.length - 1}
                    aria-label="아래로"
                    className={cn(
                      "w-7 h-7 rounded-md text-xs grid place-items-center",
                      idx === priority.length - 1
                        ? "text-[#d4d4d4] cursor-default"
                        : "text-[#4b4b4b] hover:bg-[#f4f4f4]",
                    )}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    aria-label="제거"
                    className="w-7 h-7 rounded-md text-xs grid place-items-center text-[#4b4b4b] hover:bg-[#f4f4f4]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* 미등재 (가나다순) */}
        <div className="rounded-xl border border-[#efefef] bg-white">
          <div className="px-4 py-3 border-b border-[#efefef]">
            <h3 className="text-sm font-bold text-black">
              미등재 ({available.length}개)
            </h3>
            <p className="mt-0.5 text-xs text-[#4b4b4b]">
              결과 페이지 모달 &ldquo;기타&rdquo; 영역에 가나다순으로 노출.
            </p>
          </div>
          {available.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[#afafaf]">
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
                    <span className="text-xs text-[#4b4b4b]">+ 추가</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {errors?.scenarioPriority && (
        <p className="text-xs text-red-600">
          {errors.scenarioPriority[0]}
        </p>
      )}
      {errors?._form && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {errors._form[0]}
        </p>
      )}
      {success && (
        <p className="text-sm text-black bg-[#efefef] px-3 py-2 rounded-lg">
          저장되었습니다. 결과 페이지에 즉시 반영돼요.
        </p>
      )}

      <div className="flex justify-end pt-2">
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
