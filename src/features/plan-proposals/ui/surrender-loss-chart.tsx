"use client";

import { useRef, useState } from "react";

import { type PlanProposalData } from "./chart-types";

/**
 * 해지 시 월평균 부담 곡선 — "그 시점까지 월 얼마꼴로 부담한 셈인가".
 *
 * y = (그때까지 낸 보험료 − 해지환급금) ÷ 가입 후 경과 개월.
 * 가입 직후엔 환급률이 낮아 월평균이 높다가, 시간이 지나며 안정화되고
 * 납입 종료 + 만기 환급에 가까워지면 내려감.
 *
 * 가입 나이 점(elapsed=0)은 0 나누기라 곡선에서 제외. cursor 도 +1세부터.
 */
export function SurrenderLossChart({
  proposals,
  activeId,
}: {
  proposals: PlanProposalData[];
  activeId: string;
}) {
  // 가입 나이 = surrenderLoss 첫 점의 age (adapter: customerAge + elapsed_year 0).
  // 모든 제안서가 동일 가입자라 가입 나이는 같음 — 단, proposals[0] 이 아직 분석
  // 전(빈 카드)이면 surrenderLoss 가 [] 라 entryAge 가 0 으로 잘못 잡힌다. 그러면
  // x축이 1세부터 시작하고, 아래 monthly 가 loss/(경과개월) 대신 loss/(나이×12) 로
  // 계산돼 앞 구간이 0에서 솟아오르는 곡선이 된다. 데이터가 있는 첫 제안서에서 derive.
  const entryAge =
    proposals.find((p) => p.surrenderLoss.length > 0)?.surrenderLoss[0]?.age ??
    0;
  const [cursorAge, setCursorAge] = useState<number>(() => entryAge + 1);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (proposals.length === 0) return null;
  if (proposals.every((p) => p.surrenderLoss.length === 0)) return null;

  // 각 proposal 별 월평균 시계열 (가입 직후 점 제외).
  type MonthlyPoint = { age: number; monthly: number };
  const series = proposals.map((p) => ({
    id: p.id,
    partner: p.partner,
    points: p.surrenderLoss
      .filter((pt) => pt.age > entryAge)
      .map<MonthlyPoint>((pt) => ({
        age: pt.age,
        monthly: pt.loss / ((pt.age - entryAge) * 12),
      })),
  }));

  const allMonthly = series.flatMap((p) => p.points.map((pt) => pt.monthly));
  const yMaxRaw = Math.max(...allMonthly, 0);
  const yMinRaw = Math.min(...allMonthly, 0);

  // tick step 5만원 — 월 부담 보통 5~30만원 범위라 5~7개 ticks.
  const STEP = 50_000;
  const yMin = Math.floor(yMinRaw / STEP) * STEP;
  const yMax = Math.ceil(yMaxRaw / STEP) * STEP;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += STEP) yTicks.push(v);

  // x축 도메인 — 제안서마다 만기(maturity_age)가 달라 곡선 길이가 제각각이다.
  // 한 시리즈만 보고 도메인을 잡으면 더 긴 제안서의 곡선이 x축을 넘어 그려진다.
  // maxAge 는 모든 제안서의 maturityAge 중 최댓값으로 잡아 가장 긴 만기까지 축을
  // 늘린다. 분석 전 빈 카드는 fallback maturityAge=100 이라 축이 부풀어 보이니
  // surrenderLoss 가 있는(= 실제 분석된) 제안서만 본다.
  // minAge 는 실제 그려지는 데이터 점 중 가장 작은 나이 (보통 entryAge + 1).
  const analyzedMaturityAges = proposals
    .filter((p) => p.surrenderLoss.length > 0)
    .map((p) => p.maturityAge);
  const domainAges = series.flatMap((s) => s.points).map((p) => p.age);
  const minAge = domainAges.length > 0 ? Math.min(...domainAges) : entryAge + 1;
  const maxAge =
    analyzedMaturityAges.length > 0 ? Math.max(...analyzedMaturityAges) : 100;

  const W = 320;
  const H = 220;
  const padding = { left: 52, right: 16, top: 16, bottom: 28 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  const xOf = (age: number) =>
    padding.left + ((age - minAge) / (maxAge - minAge)) * plotW;
  /** 월평균이 클수록 위쪽 — 부담 큰 쪽. */
  const yOf = (m: number) =>
    padding.top + (1 - (m - yMin) / (yMax - yMin)) * plotH;

  const pathOf = (points: MonthlyPoint[]) =>
    points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${xOf(p.age)},${yOf(p.monthly)}`,
      )
      .join(" ");

  const xTicks = [
    minAge,
    Math.round(minAge + (maxAge - minAge) * 0.33),
    Math.round(minAge + (maxAge - minAge) * 0.66),
    maxAge,
  ];

  const active = series.find((p) => p.id === activeId) ?? series[0];
  const inactive = series.filter((p) => p.id !== active.id);

  // cursor 는 강조(검정 굵은) 제안서 곡선의 실제 범위로 제한한다. 제안서마다
  // 만기가 달라 활성 곡선이 x축 전체보다 짧게 끝날 수 있는데, 그 빈 공간으로
  // 커서가 넘어가면 점이 곡선에서 떨어져 허공에 뜬다.
  const activeMinAge =
    active.points.length > 0 ? active.points[0].age : minAge;
  const activeMaxAge =
    active.points.length > 0
      ? active.points[active.points.length - 1].age
      : maxAge;
  const clampedCursorAge = Math.max(
    activeMinAge,
    Math.min(activeMaxAge, cursorAge),
  );
  const cursorPoint =
    active.points.find((p) => p.age === clampedCursorAge) ??
    active.points[active.points.length - 1];

  function updateCursorFromPointer(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const xView = ratio * W;
    // 포인터 x → 나이(x축 전체 도메인 기준) → 강조 곡선 범위로 클램프.
    const ageRaw =
      minAge + ((xView - padding.left) / plotW) * (maxAge - minAge);
    setCursorAge(
      Math.max(activeMinAge, Math.min(activeMaxAge, Math.round(ageRaw))),
    );
  }

  // 실제 월 부담 (원). Math.max(0, …): 도메인상 음수 없지만 데이터 이상 안전망.
  // cursorPoint?. — 강조 제안서가 surrenderLoss 빈 카드(분석 리포트 null)면
  // active.points 가 [] 라 cursorPoint 가 undefined. roi-chart 와 동일한 가드.
  const monthlyWon = Math.max(0, Math.round(cursorPoint?.monthly ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-black leading-snug">
        <span className="font-bold">{clampedCursorAge}세</span>에 해지한다면
        <br />월{" "}
        <span className="font-bold">
          {monthlyWon.toLocaleString("ko-KR")}원
        </span>
        으로 건강을 챙기는 거에요
      </p>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`해지 시 월평균 부담 — ${active.partner.name} 강조`}
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
        {/* y grid + 라벨 */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={padding.left}
              x2={W - padding.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke={v === 0 ? "#afafaf" : "#efefef"}
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={yOf(v) + 3}
              textAnchor="end"
              className="fill-[#4b4b4b] text-[10px]"
            >
              {formatMonthlyLabel(v)}
            </text>
          </g>
        ))}

        {/* inactive 곡선 — whisper */}
        {inactive.map((p) => (
          <path
            key={p.id}
            d={pathOf(p.points)}
            stroke="#e2e2e2"
            strokeWidth={1.5}
            fill="none"
          />
        ))}

        {/* active 곡선 — 검정 굵게 */}
        <path
          d={pathOf(active.points)}
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
          cy={yOf(cursorPoint?.monthly ?? 0)}
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
        이라는 일부 금액이 돌아와요. 그래프는 (그동안 낸 보험료 − 예상
        환급금) ÷ 가입 후 경과 개월로 환산한 월평균이에요.
      </p>
    </div>
  );
}

/** monthly (원) → 라벨. "{N}만" 형식 — 차트 압축 표시용. */
function formatMonthlyLabel(v: number): string {
  if (v === 0) return "0";
  const manwon = Math.round(v / 10_000);
  return `${manwon.toLocaleString("ko-KR")}만`;
}
