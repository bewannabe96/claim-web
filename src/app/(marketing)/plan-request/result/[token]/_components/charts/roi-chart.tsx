"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  type PlanProposalData,
  type RoiPoint,
  type ScenarioMeta,
} from "../../_lib/result-types";
import { CoveragePanel } from "./coverage-panel";

/**
 * ROI 라인 차트 — 모든 제안서를 한 화면에 비교 + 시나리오 토글.
 *
 * x: 나이 (가입~만기), y: 누적 회수 배율.
 * - 시나리오 pill: scenarios prop 으로 받은 항목들. 차트 컴포넌트는 갯수 / 종류
 *   에 무관 (가변)
 * - 선택된 제안서 → 검정 굵은 line + 정점 dot
 * - 나머지 → 옅은 회색 line (whisper)
 *
 * 발병률 시각화: plot area 하단 background layer — "이 나이대에 위험" 직관 전달.
 */
/**
 * chip 영역의 각 항목. ScenarioMeta + `isMore` 플래그.
 * `isMore: true` 인 chip 은 click 시 onScenarioChange(id, true) 로 부모가 모달
 * 등을 열도록 시그널. active 표시는 일반 chip 과 동일 (id === scenarioId).
 */
export type RoiChartChip = ScenarioMeta & { isMore?: boolean };

export function RoiChart({
  proposals,
  scenarios,
  scenarioId,
  onScenarioChange,
  activeId,
}: {
  proposals: PlanProposalData[];
  /** chip 렌더 순서 그대로 노출. trailing 자리에 `isMore: true` 끼우면 모달 트리거. */
  scenarios: RoiChartChip[];
  /** controlled — 부모가 현재 활성 시나리오 id 관리. */
  scenarioId: string;
  /** chip 클릭 시 호출. isMore 면 부모가 모달 열기 / 그 외엔 active 변경. */
  onScenarioChange: (id: string, isMore: boolean) => void;
  activeId: string;
}) {
  // 인터랙티브 cursor — 기본은 가입 나이 (33세). 사용자가 그래프 위를 호버/
  // 터치하면 x 위치를 나이로 환산. 그래프 위 풀이 phrase 가 함께 갱신.
  const [cursorAge, setCursorAge] = useState<number>(33);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (proposals.length === 0 || scenarios.length === 0) return null;

  const scenario =
    scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  // 모든 곡선의 ROI 최대값으로 y 스케일 결정 (현 시나리오 기준)
  const allValues = proposals.flatMap((p) =>
    (p.roi[scenario.id] ?? []).map((pt) => pt.roi),
  );
  // 분석 리포트 + 시나리오 시뮬레이션 가정이 없어 ROI 시리즈가 빈 케이스 — 차트
  // 좌표가 NaN 으로 깨지는 걸 방지. 시뮬레이션 가정 도입 후엔 자연스럽게 채워짐.
  if (allValues.length === 0) return null;

  // y 축 = log10 scale. ROI 의 동적 범위가 매우 넓음 (예: 가입 직후 100x+ →
  // 만기 직전 6x 평탄). linear 면 후반 데이터가 baseline 에 깔려 정보 손실 큼.
  // log 면 "x10 배 차이" 가 일정 시각 간격이 되어 비교 직관 ↑.
  const EPSILON = 0.01; // log(0) 방지 — 0 ROI 시리즈는 baseline 으로 clamp.
  const yMaxRaw = Math.max(...allValues, EPSILON);
  const yMinLog = 0; // log10(1) = 0. 1배가 baseline. 1 미만은 plot 밖으로 clamp.
  const yMaxLog = Math.log10(yMaxRaw * 1.1);

  const ages = (proposals[0].roi[scenario.id] ?? []).map((p) => p.age);
  const minAge = ages[0] ?? 0;
  const maxAge = ages[ages.length - 1] ?? 100;

  // svg 좌표계
  // 좌 padding: ROI(x배) 라벨 / 우 padding: 누적 발병률(%) 라벨
  const W = 320;
  const H = 220;
  const padding = { left: 36, right: 36, top: 16, bottom: 28 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  const xOf = (age: number) =>
    padding.left + ((age - minAge) / (maxAge - minAge)) * plotW;
  // log scale + plot 도메인 클램프 (1 미만 또는 yMax 초과는 plot 안에 가둠).
  const yOf = (roi: number) => {
    const logVal = Math.log10(Math.max(EPSILON, roi));
    const ratio = Math.max(
      0,
      Math.min(1, (logVal - yMinLog) / (yMaxLog - yMinLog)),
    );
    return padding.top + (1 - ratio) * plotH;
  };

  const pathOf = (points: RoiPoint[]) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.age)},${yOf(p.roi)}`)
      .join(" ");

  // 누적 발병률 — 오른쪽 y축 (0~100%), plot 전체 높이 사용.
  // 누적이므로 monotonic non-decreasing — 시간이 지나며 면적이 좌→우로 차오름.
  // 분석 리포트가 incidence 를 안 주는 경우 (현재 모든 시나리오) 관련 UI 통째 숨김:
  //   - cursor 풀이 두 번째 줄 ("한국 남성 기준 …%")
  //   - legend (회수 배율만 남으면 y 축 라벨로 충분 → legend 통째 hide)
  //   - svg 의 incidence area path + 우측 y축 tick
  const incidenceRates = scenario.incidence;
  const hasIncidence = incidenceRates.length > 0;

  const incidenceYOf = (rate: number) =>
    padding.top + plotH - rate * plotH;
  const incidencePath = hasIncidence
    ? (() => {
        const top = ages
          .map((age, i) => {
            const rate = incidenceRates[i] ?? 0;
            return `${i === 0 ? "M" : "L"}${xOf(age)},${incidenceYOf(rate)}`;
          })
          .join(" ");
        const bottomY = padding.top + plotH;
        return `${top} L${xOf(maxAge)},${bottomY} L${xOf(minAge)},${bottomY} Z`;
      })()
    : "";

  // 오른쪽 y축 tick — 0% / 50% / 100% (incidence 있을 때만)
  const rightYTicks = [0, 0.5, 1];

  // x 축 tick — 시작/끝 + 중간 2개
  const ticks = [
    minAge,
    Math.round(minAge + (maxAge - minAge) * 0.33),
    Math.round(minAge + (maxAge - minAge) * 0.66),
    maxAge,
  ];

  // y 축 tick — log10 power 만 (1, 10, 100...). yMaxRaw 보다 ≤ 한 cycle 까지.
  // yMaxRaw < 10 의 좁은 범위는 5 minor 도 같이 추가해 sparse 회피.
  const yTicks: number[] = [];
  for (let exp = 0; Math.pow(10, exp) <= yMaxRaw; exp++) {
    yTicks.push(Math.pow(10, exp));
  }
  if (yMaxRaw < 10 && yMaxRaw >= 5) yTicks.push(5);

  const active = proposals.find((p) => p.id === activeId) ?? proposals[0];
  const inactive = proposals.filter((p) => p.id !== active.id);

  // cursor 의 도메인 보정 — minAge/maxAge 안으로 클램프
  const clampedCursorAge = Math.max(minAge, Math.min(maxAge, cursorAge));

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

  const activeRoi = active.roi[scenario.id] ?? [];
  const cursorPoint =
    activeRoi.find((p) => p.age === clampedCursorAge) ??
    activeRoi[activeRoi.length - 1];

  // 누적 발병률 — age 가 minAge 부터 1살 단위로 정렬돼 있으므로 index = age - minAge
  const cursorIncidencePct = (
    (incidenceRates[clampedCursorAge - minAge] ?? 0) * 100
  ).toFixed(1);

  return (
    <div className="flex flex-col gap-4">
      {/* 시나리오 토글 pill — scenarios prop 기준 동적 렌더. isMore chip 은 라벨
        * 대신 + 아이콘 + 모달 트리거. DESIGN: chip = Chip Gray + 999px pill. */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onScenarioChange(s.id, Boolean(s.isMore))}
            aria-label={s.isMore ? "질병 추가" : undefined}
            className={cn(
              "shrink-0 rounded-full text-xs font-medium transition-colors inline-flex items-center justify-center",
              s.isMore ? "w-8 h-8 p-0" : "px-3.5 py-1.5",
              s.id === scenario.id
                ? "bg-black text-white"
                : "bg-[#efefef] text-[#4b4b4b] hover:bg-[#e2e2e2]",
            )}
          >
            {s.isMore ? <PlusIcon /> : s.label}
          </button>
        ))}
      </div>

      {/*
       * cursor 위치 풀이 — 메인 phrase / 누적 발병률 / 시나리오 보장 카드.
       * 흐름: 회수 배율 → 확률 컨텍스트 → 구체 보장 금액.
       */}
      <div className="flex flex-col gap-2">
        <p className="text-base text-black leading-snug">
          <span className="font-bold">{clampedCursorAge}세</span>에{" "}
          {scenario.sentenceLabel}에 걸리면
          <br />
          그동안 낸 보험료의{" "}
          <span className="font-bold">{cursorPoint?.roi ?? 0}배</span>를
          돌려받아요
        </p>
        {hasIncidence && (
          <p className="text-xs text-[#4b4b4b]">
            한국 남성 기준{" "}
            <span className="font-medium text-black">{clampedCursorAge}세</span>
            까지 {scenario.sentenceLabel}에 걸릴 확률{" "}
            <span className="font-medium text-black">
              {cursorIncidencePct}%
            </span>
          </p>
        )}
      </div>

      {/* legend — incidence 가 있을 때만. 회수 배율 단일 시리즈면 y 축 라벨로 충분. */}
      {hasIncidence && (
        <div className="flex justify-end gap-3 text-[10px] text-[#4b4b4b]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-black" />
            회수 배율 <span className="text-[#afafaf]">(좌)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-[rgba(0,0,0,0.08)]" />
            누적 발병률 <span className="text-[#afafaf]">(우)</span>
          </span>
        </div>
      )}

      {/* SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`회수 배율 — ${scenario.label} 시나리오, ${active.partner.name} 강조`}
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
        {/* 누적 발병률 area — incidence 데이터가 있을 때만 (현재는 모든 시나리오 fallback). */}
        {hasIncidence && (
          <path d={incidencePath} fill="rgba(0, 0, 0, 0.07)" stroke="none" />
        )}

        {/* 오른쪽 y축 (누적 발병률 %) tick — incidence 있을 때만 */}
        {hasIncidence && rightYTicks.map((rate) => (
          <g key={`ry-${rate}`}>
            <line
              x1={W - padding.right}
              x2={W - padding.right + 3}
              y1={incidenceYOf(rate)}
              y2={incidenceYOf(rate)}
              stroke="#afafaf"
            />
            <text
              x={W - padding.right + 5}
              y={incidenceYOf(rate) + 3}
              textAnchor="start"
              className="fill-[#afafaf] text-[10px]"
            >
              {Math.round(rate * 100)}%
            </text>
          </g>
        ))}

        {/* y grid */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={padding.left}
              x2={W - padding.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="#efefef"
            />
            <text
              x={padding.left - 6}
              y={yOf(v) + 3}
              textAnchor="end"
              className="fill-[#4b4b4b] text-[10px]"
            >
              {v}x
            </text>
          </g>
        ))}

        {/* inactive 곡선들 — whisper */}
        {inactive.map((p) => (
          <path
            key={p.id}
            d={pathOf(p.roi[scenario.id] ?? [])}
            stroke="#e2e2e2"
            strokeWidth={1.5}
            fill="none"
          />
        ))}

        {/* active 곡선 — 검정 굵게 */}
        <path
          d={pathOf(activeRoi)}
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
          cy={yOf(cursorPoint?.roi ?? 0)}
          r={4}
          fill="#000"
          stroke="white"
          strokeWidth={2}
          pointerEvents="none"
        />

        {/* x tick labels */}
        {ticks.map((age) => (
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

      {/*
       * 시나리오 보장 카드 — 그래프 아래.
       * 큰 수치 + "계산에 포함된 담보" breakdown 으로 근거 투명성 제공.
       */}
      <CoveragePanel
        scenarioLabel={scenario.label}
        items={active.coverage[scenario.id] ?? []}
      />

      {/* 강조 disclaimer */}
      <p
        className={cn(
          "text-[11px] text-[#4b4b4b] leading-relaxed",
          "bg-[#fafafa] border border-[#efefef] rounded-lg px-3 py-2",
        )}
      >
        보장 금액은{" "}
        <span className="font-medium text-black">
          일반적인 질병 시나리오
        </span>
        를 기준으로 계산했어요. 실제 진단·치료 양상에 따라 받는 금액은 달라질
        수 있어요.
      </p>
    </div>
  );
}

/** + 아이콘 — chip 의 isMore entry 에서 라벨 대신 사용 (질병 추가 트리거). */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

