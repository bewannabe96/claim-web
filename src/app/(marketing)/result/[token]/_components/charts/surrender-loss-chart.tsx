"use client";

import { useRef, useState } from "react";

import {
  type ProposalData,
  type SurrenderLossPoint,
} from "../../_mock/data";

/**
 * 해지 시 손실 곡선 — "내가 아프지 않은 채로 해지하면 얼마 날리나".
 *
 * ROI 가 best-case (질병 발생 시 회수) 라면 이 그래프는 worst-case —
 * 아무 일도 안 생긴 채로 도중 해지할 때의 순손익.
 *
 * **방향**: 곡선이 위로 올라가면 손실 (낸 돈을 못 돌려받음), 아래로 내려가면
 * 이득 (환급이 낸 돈을 초과). ROI 와 같은 시각적 방향성 (↑ = 절댓값 큼).
 *
 * **라벨**: y축 위쪽 = 마이너스 값 (손실의 부호 의미), 아래쪽 = 플러스 값 (이득).
 * 내부 fixture 의 `loss` 는 `납입 − 환급` (양수=손실) 이지만, 라벨 표시는
 * 부호를 뒤집어 사용자가 보기에 "손실 = 마이너스 금액" 으로 자연스럽게 읽힘.
 */
export function SurrenderLossChart({
  proposals,
  activeId,
}: {
  proposals: ProposalData[];
  activeId: string;
}) {
  // 인터랙티브 cursor — 기본은 가입 나이 (33세). 호버/터치 시 x → 나이 환산.
  const [cursorAge, setCursorAge] = useState<number>(33);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (proposals.length === 0) return null;

  const allLosses = proposals.flatMap((p) =>
    p.surrenderLoss.map((pt) => pt.loss),
  );
  const yMaxRaw = Math.max(...allLosses, 0);
  const yMinRaw = Math.min(...allLosses, 0);

  // tick step 을 2,000만원 (= 20,000,000) 단위로 묶음 → 5개 내외 ticks
  const STEP = 20_000_000;
  const yMin = Math.floor(yMinRaw / STEP) * STEP;
  const yMax = Math.ceil(yMaxRaw / STEP) * STEP;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += STEP) yTicks.push(v);

  const ages = proposals[0].surrenderLoss.map((p) => p.age);
  const minAge = ages[0] ?? 0;
  const maxAge = ages[ages.length - 1] ?? 100;

  // svg 좌표계 — ROI 차트와 동일 톤
  const W = 320;
  const H = 220;
  const padding = { left: 52, right: 16, top: 16, bottom: 28 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  const xOf = (age: number) =>
    padding.left + ((age - minAge) / (maxAge - minAge)) * plotW;
  /** loss 가 클수록 위쪽으로 plot (ROI 와 같은 방향성). */
  const yOf = (loss: number) =>
    padding.top + (1 - (loss - yMin) / (yMax - yMin)) * plotH;

  const pathOf = (points: SurrenderLossPoint[]) =>
    points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xOf(p.age)},${yOf(p.loss)}`,
      )
      .join(" ");

  const xTicks = [
    minAge,
    Math.round(minAge + (maxAge - minAge) * 0.33),
    Math.round(minAge + (maxAge - minAge) * 0.66),
    maxAge,
  ];

  const active = proposals.find((p) => p.id === activeId) ?? proposals[0];
  const inactive = proposals.filter((p) => p.id !== active.id);

  const clampedCursorAge = Math.max(minAge, Math.min(maxAge, cursorAge));
  const cursorPoint =
    active.surrenderLoss.find((p) => p.age === clampedCursorAge) ??
    active.surrenderLoss[active.surrenderLoss.length - 1];

  function updateCursorFromPointer(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const xView = ratio * W;
    if (xView <= padding.left) return setCursorAge(minAge);
    if (xView >= W - padding.right) return setCursorAge(maxAge);
    const ageRaw =
      minAge + ((xView - padding.left) / plotW) * (maxAge - minAge);
    setCursorAge(Math.round(ageRaw));
  }

  // 풀이용 — loss > 0 은 손해, < 0 은 이득 (부호 뒤집어 보여줌)
  const cursorLossManwon = Math.round(cursorPoint.loss / 10_000);
  const isGain = cursorPoint.loss < 0;
  const cursorAbsManwon = Math.abs(cursorLossManwon);

  return (
    <div className="flex flex-col gap-4">
      {/* cursor 위치 풀이 — ROI 차트와 평행 구조 (조건 / 결과+금액).
       *
       *   loss > 0:  X세에 해지하면 / 그동안 건강한 대가로 Y만원을 지불해요
       *   loss < 0:  X세에 해지하면 / 그동안 건강하고도 오히려 Y만원이 남아요
       *   loss == 0: X세에 해지하면 / 그동안 손해 없이 보장만 받았어요
       */}
      <p className="text-base text-black leading-snug">
        {isGain ? (
          <>
            <span className="font-bold">{clampedCursorAge}세</span>에 해지하면
            <br />
            그동안 건강하고도 오히려{" "}
            <span className="font-bold">
              {cursorAbsManwon.toLocaleString("ko-KR")}만원
            </span>
            이 남아요
          </>
        ) : cursorAbsManwon === 0 ? (
          <>
            <span className="font-bold">{clampedCursorAge}세</span>에 해지하면
            <br />
            그동안 손해 없이 보장만 받았어요
          </>
        ) : (
          <>
            <span className="font-bold">{clampedCursorAge}세</span>에 해지하면
            <br />
            그동안 건강한 대가로{" "}
            <span className="font-bold">
              {cursorAbsManwon.toLocaleString("ko-KR")}만원
            </span>
            을 지불해요
          </>
        )}
      </p>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`해지 시 손실 — ${active.partner.name} 강조`}
        onPointerMove={(e) => updateCursorFromPointer(e.clientX)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateCursorFromPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
      >
        {/* y grid + 라벨 — 0 선 강조 */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={padding.left}
              x2={W - padding.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke={v === 0 ? "#afafaf" : "#efefef"}
              strokeWidth={v === 0 ? 1 : 1}
            />
            <text
              x={padding.left - 6}
              y={yOf(v) + 3}
              textAnchor="end"
              className="fill-[#4b4b4b] text-[10px]"
            >
              {formatLossLabel(v)}
            </text>
          </g>
        ))}

        {/* inactive 곡선 — whisper */}
        {inactive.map((p) => (
          <path
            key={p.id}
            d={pathOf(p.surrenderLoss)}
            stroke="#e2e2e2"
            strokeWidth={1.5}
            fill="none"
          />
        ))}

        {/* active 곡선 — 검정 굵게 */}
        <path
          d={pathOf(active.surrenderLoss)}
          stroke="#000"
          strokeWidth={2.5}
          strokeLinejoin="round"
          fill="none"
        />

        {/* cursor — 세로 점선 + active 곡선 위 dot */}
        <line
          x1={xOf(clampedCursorAge)}
          x2={xOf(clampedCursorAge)}
          y1={padding.top}
          y2={padding.top + plotH}
          stroke="#afafaf"
          strokeWidth={1}
          strokeDasharray="3 3"
          pointerEvents="none"
        />
        <circle
          cx={xOf(clampedCursorAge)}
          cy={yOf(cursorPoint.loss)}
          r={4}
          fill="#000"
          stroke="white"
          strokeWidth={2}
          pointerEvents="none"
        />

        {/* x tick 라벨 */}
        {xTicks.map((age) => (
          <text
            key={`x-${age}`}
            x={xOf(age)}
            y={H - 8}
            textAnchor="middle"
            className="fill-[#4b4b4b] text-[10px]"
          >
            {age}세
          </text>
        ))}
      </svg>

      {/* 강조 disclaimer — 그래프 수치 정의 설명 */}
      <p className="text-[11px] text-[#4b4b4b] leading-relaxed bg-[#fafafa] border border-[#efefef] rounded-lg px-3 py-2">
        보험을 도중에 해지하면{" "}
        <span className="font-medium text-black">해지환급금</span>
        이라는 일부 금액이 돌아와요. 그래프 수치는 그동안 낸 보험료에서 예상
        환급금을 뺀 금액이에요.
      </p>
    </div>
  );
}

/**
 * loss (원, 양수=손실) → 라벨 표시.
 *
 * **부호 뒤집기**: 손실은 사용자에게 "-N만" (마이너스) 로, 이득은 "+N만" 으로
 * 표시. 곡선 방향은 그대로지만 (위로 갈수록 손실), 라벨이 금융 직관을 반영.
 */
function formatLossLabel(v: number): string {
  if (v === 0) return "0";
  const inManwon = Math.round(v / 10_000);
  // v > 0 (손실) → 라벨은 "-N만"
  if (inManwon > 0) {
    return `-${inManwon.toLocaleString("ko-KR")}만`;
  }
  // v < 0 (이득) → 라벨은 "+N만"
  return `+${(-inManwon).toLocaleString("ko-KR")}만`;
}
