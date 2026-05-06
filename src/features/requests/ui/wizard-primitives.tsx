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

export function ChipGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2.5">{children}</div>;
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 rounded-full text-sm font-medium transition-colors",
        selected
          ? "bg-black text-white"
          : "bg-[#efefef] text-black hover:bg-[#e2e2e2]",
      )}
    >
      {children}
    </button>
  );
}
