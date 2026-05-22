import { formatKRW } from "./format-krw";
import type { CoverageItem } from "./chart-types";

/**
 * 시나리오 보장 상세 — "이 시나리오에서 받는 총 보장액" + 담보 breakdown.
 *
 * total = items 의 insuredAmount 합. ROI 차트의 분자 (category_payouts[].
 * total_insured_amount) 와 동일 값 — 차트 풀이 "X배" 와 패널 큰 숫자가 일치.
 *
 * 항목 리스트는 진단비 / 수술비 / 입원일당 등 모든 담보. 일부 amount 가 정기성
 * ("월 200만원", "1일 5만원") 이라도 raw insuredAmount 가 합산에 동일 weight.
 * 분석 리포트의 total_insured_amount 정의를 그대로 따름.
 *
 * items.length === 0 → 미보장 시나리오. 별도 분기로 안내 문구.
 */
export function CoveragePanel({
  scenarioLabel,
  items,
}: {
  scenarioLabel: string;
  items: CoverageItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[#efefef] bg-white px-4 py-4">
        <p className="text-[11px] text-[#4b4b4b]">
          <span className="text-black font-medium">{scenarioLabel}</span>{" "}
          상황에서 받는 보장
        </p>
        <p className="mt-2 text-sm text-[#4b4b4b]">
          이 제안서는 보장하지 않아요
        </p>
      </div>
    );
  }

  const total = items.reduce(
    (sum, item) => sum + (item.insuredAmount ?? 0),
    0,
  );

  return (
    <div className="rounded-xl border border-[#efefef] bg-white px-4 py-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-[#4b4b4b]">
          <span className="text-black font-medium">{scenarioLabel}</span>{" "}
          상황에서 받는 보장
        </p>
        <p className="text-[1.75rem] font-bold text-black leading-none tracking-tight">
          {formatKRW(total)}
        </p>
      </div>

      <div className="flex flex-col gap-2 pt-3 border-t border-[#efefef]">
        <p className="text-[11px] text-[#afafaf]">계산에 포함된 담보</p>
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-12 text-xs"
            >
              {/* label 은 한 줄 + 말줄임. flex 자식이 truncate 작동하려면 min-w-0 필수.
                * 전체 텍스트는 title 로 hover 시 노출. gap-12 (48px) 로 가격과
                * 시각적 분리 강조 — label 영역은 그만큼 좁아져 truncate 더 자주 발생. */}
              <span
                className="flex-1 min-w-0 truncate text-[#4b4b4b]"
                title={item.label}
              >
                {item.label}
              </span>
              {/* 가격은 절대 줄바꿈 X — shrink-0 + whitespace-nowrap. */}
              <span className="shrink-0 whitespace-nowrap font-medium text-black tabular-nums">
                {item.amount}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
