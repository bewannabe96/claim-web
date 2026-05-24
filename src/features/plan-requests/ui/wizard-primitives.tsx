/**
 * 요청서 작성 흐름(Step1 / Step3 wizard) 공유 primitive.
 *
 * DESIGN.md 기반 — 모노크롬, 999px pill, chip-gray 기본 + 검정 인버전.
 */
import { cn } from "@/lib/utils";

export function ProgressSegment({ fill }: { fill: number }) {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <div className="flex-1 h-1 rounded-full bg-[#efefef] overflow-hidden">
      <div
        className="h-full bg-black transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Chip / ChipGroup density.
 *
 * - "comfortable" (default): 가입자 wizard 용. 큰 패딩 (text-sm h-* 자동) + 회색 fill.
 *   터치 친화적, white 본문 위 충분한 visual weight.
 * - "compact": admin 폼 용. 작은 패딩 (text-xs h-8) + white bg + border outline.
 *   Card 안 dense 레이아웃에서 시각 noise 최소화.
 *
 * 같은 도메인 의미(선택 가능한 옵션)이고 토글 UX 도 동일하므로 한 컴포넌트로 통일,
 * 표면 톤만 prop 분기. 새 density 추가 시 두 함수 모두 갱신.
 */
export type ChipDensity = "comfortable" | "compact";

export function ChipGroup({
  children,
  density = "comfortable",
}: {
  children: React.ReactNode;
  density?: ChipDensity;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap",
        density === "compact" ? "gap-2" : "gap-2.5",
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  density = "comfortable",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  density?: ChipDensity;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full font-medium transition-colors",
        density === "compact"
          ? cn(
              "h-8 px-3 text-xs border",
              selected
                ? "bg-black text-white border-black"
                : "bg-white text-[#4b4b4b] border-[#e2e2e2] hover:border-black",
            )
          : cn(
              "px-4 py-2.5 text-sm",
              selected
                ? "bg-black text-white"
                : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
            ),
      )}
    >
      {children}
    </button>
  );
}
