"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import {
  type CoverageItem,
  type ProposalData,
  type RoiPoint,
  type ScenarioMeta,
} from "../../_mock/data";

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
export function RoiChart({
  proposals,
  scenarios,
  activeId,
}: {
  proposals: ProposalData[];
  scenarios: ScenarioMeta[];
  activeId: string;
}) {
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0]?.id ?? "");
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
  const yMax = Math.max(1.2, Math.ceil(Math.max(...allValues) * 1.1 * 10) / 10);
  const yMin = 0;

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
  const yOf = (roi: number) =>
    padding.top + (1 - (roi - yMin) / (yMax - yMin)) * plotH;

  const pathOf = (points: RoiPoint[]) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.age)},${yOf(p.roi)}`)
      .join(" ");

  // 누적 발병률 — 오른쪽 y축 (0~100%), plot 전체 높이 사용.
  // 누적이므로 monotonic non-decreasing — 시간이 지나며 면적이 좌→우로 차오름.
  const incidenceRates = scenario.incidence;
  const incidenceYOf = (rate: number) =>
    padding.top + plotH - rate * plotH;
  const incidencePath = (() => {
    const top = ages
      .map((age, i) => {
        const rate = incidenceRates[i] ?? 0;
        return `${i === 0 ? "M" : "L"}${xOf(age)},${incidenceYOf(rate)}`;
      })
      .join(" ");
    const bottomY = padding.top + plotH;
    return `${top} L${xOf(maxAge)},${bottomY} L${xOf(minAge)},${bottomY} Z`;
  })();

  // 오른쪽 y축 tick — 0% / 50% / 100%
  const rightYTicks = [0, 0.5, 1];

  // x 축 tick — 시작/끝 + 중간 2개
  const ticks = [
    minAge,
    Math.round(minAge + (maxAge - minAge) * 0.33),
    Math.round(minAge + (maxAge - minAge) * 0.66),
    maxAge,
  ];

  // y 축 tick — 0 + yMax (1x reference 제거)
  const yTicks =
    yMax >= 2 ? [0, Math.floor(yMax / 2), Math.floor(yMax)] : [0, 1];

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
      {/* 시나리오 토글 pill — scenarios prop 기준 동적 렌더 */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScenarioId(s.id)}
            className={cn(
              "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors",
              s.id === scenario.id
                ? "bg-black text-white"
                : "bg-[#efefef] text-[#4b4b4b] hover:bg-[#e2e2e2]",
            )}
          >
            {s.label}
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
        <p className="text-xs text-[#4b4b4b]">
          한국 남성 기준{" "}
          <span className="font-medium text-black">{clampedCursorAge}세</span>
          까지 {scenario.sentenceLabel}에 걸릴 확률{" "}
          <span className="font-medium text-black">
            {cursorIncidencePct}%
          </span>
        </p>
      </div>

      {/* legend — 그래프 위쪽 행, 우측 정렬 */}
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

      {/* SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`회수 배율 — ${scenario.label} 시나리오, ${active.agent.name} 강조`}
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
        {/* 누적 발병률 area — plot 영역의 가장 뒤 배경 layer */}
        <path d={incidencePath} fill="rgba(0, 0, 0, 0.07)" stroke="none" />

        {/* 오른쪽 y축 (누적 발병률 %) tick */}
        {rightYTicks.map((rate) => (
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

/**
 * 시나리오 보장 상세 — "이 시나리오에서 받는 진단금 총액" + 담보 breakdown.
 *
 * 큰 숫자 + "계산에 포함된 담보" 리스트로 근거 투명성 제공.
 * 진단금 항목이 없는 시나리오 (호흡기·만성 등) 는 fallback 메시지로 안내.
 */
function CoveragePanel({
  scenarioLabel,
  items,
}: {
  scenarioLabel: string;
  items: CoverageItem[];
}) {
  const lumpItems = items.filter((item) => item.label.includes("진단금"));
  const total = lumpItems.reduce(
    (sum, item) => sum + parseLumpSum(item.amount),
    0,
  );

  return (
    <div className="rounded-xl border border-[#efefef] bg-white px-4 py-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-[#4b4b4b]">
          <span className="text-black font-medium">{scenarioLabel}</span>{" "}
          상황에서 받는 보장
        </p>
        {total > 0 ? (
          <p className="text-[1.75rem] font-bold text-black leading-none tracking-tight">
            {formatLumpSum(total)}
          </p>
        ) : (
          <p className="text-sm text-[#4b4b4b]">
            진단금 없이 입원·수술비 위주의 보장이에요
          </p>
        )}
      </div>

      {lumpItems.length > 0 && (
        <div className="flex flex-col gap-2 pt-3 border-t border-[#efefef]">
          <p className="text-[11px] text-[#afafaf]">계산에 포함된 담보</p>
          <ul className="flex flex-col gap-1.5">
            {lumpItems.map((item, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="text-[#4b4b4b] truncate">{item.label}</span>
                <span className="font-medium text-black tabular-nums">
                  {item.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 진단금 amount 문자열에서 원 단위 숫자 추출.
 * "5,000만원" → 50,000,000 / "1억원" → 100,000,000 / "1억 5,000만원" → 150,000,000.
 * "1일", "월", "회당" 으로 시작하는 정기성 amount 는 0 반환.
 */
function parseLumpSum(text: string): number {
  if (/^(1일|월|회당|연)/.test(text)) return 0;
  const cleaned = text.replace(/[,원\s]/g, "");
  let total = 0;
  const eok = cleaned.match(/(\d+)억/);
  const man = cleaned.match(/(\d+)만/);
  if (eok) total += parseInt(eok[1], 10) * 100_000_000;
  if (man) total += parseInt(man[1], 10) * 10_000;
  return total;
}

/** 원 → "1억 5,000만원" 형태로 표시. */
function formatLumpSum(n: number): string {
  if (n === 0) return "—";
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000);
    const remainder = n % 100_000_000;
    if (remainder === 0) return `${eok}억원`;
    const man = Math.round(remainder / 10_000);
    return `${eok}억 ${man.toLocaleString("ko-KR")}만원`;
  }
  const man = Math.round(n / 10_000);
  return `${man.toLocaleString("ko-KR")}만원`;
}
