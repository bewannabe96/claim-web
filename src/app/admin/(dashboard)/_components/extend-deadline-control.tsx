"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extendRequestDeadline } from "@/features/plan-requests/actions";
import type { ExtendDeadlineResult } from "@/features/plan-requests/schema";

import { formatDateTime } from "../_lib/format";

/**
 * 제출 마감 연장 컨트롤 — 어드민 요청 상세 페이지 (`dispatched` / `analyzing` 이고
 * 마감이 미래인 요청에만 노출).
 *
 * UX:
 *   1. idle  → "마감 연장" 버튼
 *   2. armed → 시간 input + 새 마감 미리보기 + "연장" / "취소"
 *   3. 결과 → 성공/실패 인라인 메시지 (성공 시 페이지 revalidate 로 헤더 갱신)
 *
 * 새 마감 = `currentDeadlineAt + extendBy` (페이지 가드로 currentDeadlineAt 이
 * 미래임이 보장됨). 폼을 열어둔 채 마감이 지나는 드문 race 는 서버 액션이
 * `already_past` / `conflict` 로 반환 → 인라인 안내.
 *
 * 부수 효과 안내: pending 설계사에게 LMS 안내가 자동 발송됨을 미리 고지 — admin 이
 * "버튼 한 번에 LMS 보내짐" 을 인지하고 결정하도록.
 */
export function ExtendDeadlineControl({
  planRequestId,
  currentDeadlineAt,
}: {
  planRequestId: string;
  /** ISO string. 페이지 노출 조건에 의해 미래로 보장됨. */
  currentDeadlineAt: string;
}) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [hoursInput, setHoursInput] = useState("24");
  const [result, setResult] = useState<
    { kind: "success"; newDeadlineAt: string } | { kind: "error"; message: string } | null
  >(null);

  const parsedHours = parseHours(hoursInput);
  // 새 마감 = currentDeadlineAt + extendBy. Date.now() 안 씀 — purity rule 회피
  // + 페이지 가드 덕에 currentDeadlineAt 이 항상 미래라 단순화 가능.
  const previewDeadline = useMemo(() => {
    if (parsedHours === null) return null;
    return new Date(
      Date.parse(currentDeadlineAt) + parsedHours * 3_600_000,
    ).toISOString();
  }, [currentDeadlineAt, parsedHours]);

  function submit() {
    if (parsedHours === null) return;
    startTransition(async () => {
      try {
        const res = await extendRequestDeadline(planRequestId, parsedHours);
        if (res.ok) {
          setResult({ kind: "success", newDeadlineAt: res.newDeadlineAt });
          setArmed(false);
        } else {
          setResult({
            kind: "error",
            message: errorMessage(res),
          });
        }
      } catch (e) {
        console.error("[extend-deadline] action failed", e);
        setResult({
          kind: "error",
          message: "연장 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        });
      }
    });
  }

  const btnClass = "rounded-full font-medium h-8 px-3 text-xs";

  if (armed) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={168}
            step={1}
            value={hoursInput}
            onChange={(e) => setHoursInput(e.target.value)}
            disabled={pending}
            className="h-8 w-20 text-xs tabular-nums"
            aria-label="추가할 시간 (시간 단위)"
          />
          <span className="text-xs text-[#4b4b4b]">시간 추가</span>
          <Button
            type="button"
            disabled={pending || parsedHours === null}
            onClick={submit}
            className={btnClass}
          >
            {pending ? "연장 중…" : "연장"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setArmed(false);
              setResult(null);
            }}
            className={btnClass}
          >
            취소
          </Button>
        </div>
        {parsedHours === null ? (
          <p className="text-xs text-red-600">1~168 사이 정수를 입력해주세요.</p>
        ) : (
          previewDeadline && (
            <p className="text-xs text-[#4b4b4b]">
              새 마감: <span className="font-semibold text-black tabular-nums">{formatDateTime(previewDeadline)}</span>
              <span className="ml-1 text-[#afafaf]">
                ({parsedHours}시간 추가)
              </span>
            </p>
          )
        )}
        <p className="text-[11px] text-[#afafaf] leading-relaxed">
          연장 즉시 미제출 설계사에게 새 마감 시각이 LMS 로 안내돼요.
          가입자에게는 별도 안내가 가지 않아요 (dispatched 페이지가 자동 갱신).
        </p>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <Button
        type="button"
        onClick={() => {
          setResult(null);
          setArmed(true);
        }}
        className={btnClass}
      >
        마감 연장
      </Button>
      {result?.kind === "success" && (
        <span className="text-xs text-black">
          연장됐어요 ·{" "}
          <span className="tabular-nums">
            {formatDateTime(result.newDeadlineAt)}
          </span>
        </span>
      )}
      {result?.kind === "error" && (
        <span className="text-xs text-red-600">{result.message}</span>
      )}
    </div>
  );
}

function parseHours(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < 1 || n > 168) return null;
  return n;
}

function errorMessage(
  res: Extract<ExtendDeadlineResult, { ok: false }>,
): string {
  switch (res.error) {
    case "not_found":
      return "요청서를 찾지 못했어요.";
    case "invalid_status":
      return "이미 마감된 요청이라 연장할 수 없어요. 새로고침 해주세요.";
    case "invalid_hours":
      return res.message ?? "올바른 시간이 아니에요.";
    case "already_past":
      return "마감 시각이 이미 지났어요. 새로고침 해주세요.";
    case "conflict":
      return "마감 처리와 충돌했어요. 새로고침 후 다시 시도해주세요.";
    default: {
      // 신규 error case 추가 시 컴파일러가 잡도록 exhaustive 가드.
      const _exhaustive: never = res.error;
      return _exhaustive;
    }
  }
}
