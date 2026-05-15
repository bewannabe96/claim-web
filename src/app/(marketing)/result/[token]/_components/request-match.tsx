import { cn } from "@/lib/utils";

import {
  FOCUSED_CONCERN_LABEL,
  type CoverageItem,
  type CoverageRequest,
  type FocusedConcernId,
} from "../_mock/data";

/**
 * 요청 매칭 카드 — "내가 선택한 보장 영역을 이 진설계가 얼마나 다루나".
 *
 * 흐름:
 *   1. 가입자가 선택한 concern chip + 자유 텍스트 인용 (`other`)
 *   2. "선택한 N가지 중 M가지 보장 포함" 정직한 분수
 *   3. concern 별 카드 — 커버되면 항목 리스트, 미커버면 안내 한 줄
 *
 * broad intent 일 땐 매칭 섹션 자체를 그리지 않음 — 비교는 radar / ROI 위주.
 * 따라서 ResultView 가 broad 인지 체크 후 mount/skip 을 결정. 이 컴포넌트는
 * focused 케이스 전용.
 */
export function RequestMatch({
  request,
  coverage,
}: {
  request: Extract<CoverageRequest, { intent: "focused" }>;
  coverage: Record<string, CoverageItem[]>;
}) {
  return (
    <section className="rounded-xl border border-[#efefef] p-5 flex flex-col gap-4">
      <h2 className="text-base font-bold text-black tracking-tight">
        대비하고 싶은 보장
      </h2>

      {/* concern 별 체크리스트 — 커버 여부만 한 줄씩 */}
      <ul className="flex flex-col gap-3">
        {request.concerns.map((id) => {
          const covered = (coverage[id] ?? []).length > 0;
          return (
            <li key={id} className="flex items-center gap-3">
              <StatusIcon covered={covered} />
              <p
                className={cn(
                  "flex-1 text-sm font-medium",
                  covered ? "text-black" : "text-[#4b4b4b]",
                )}
              >
                {FOCUSED_CONCERN_LABEL[id]}
              </p>
              {!covered && (
                <span className="text-xs text-[#afafaf]">
                  포함되지 않았어요
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================
 * 보조 — 상태 아이콘 (커버 ✓ / 미커버 빈 원)
 * ============================================================ */

function StatusIcon({ covered }: { covered: boolean }) {
  if (covered) {
    return (
      <span
        aria-hidden
        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-black"
      >
        <svg
          viewBox="0 0 16 16"
          className="w-3 h-3"
          fill="none"
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3,8 7,12 13,4" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-[#d4d4d4]"
    >
      <svg
        viewBox="0 0 16 16"
        className="w-2.5 h-2.5"
        fill="none"
        stroke="#afafaf"
        strokeWidth={2.5}
        strokeLinecap="round"
      >
        <line x1="4" y1="8" x2="12" y2="8" />
      </svg>
    </span>
  );
}
