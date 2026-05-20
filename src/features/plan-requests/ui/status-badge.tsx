import { cn } from "@/lib/utils";

import type { PlanRequestStatus } from "../schema";

/**
 * 요청 상태 라벨 + 톤 매핑.
 * 모노크롬 — 검정 인버전(긴급/주의), 화이트 라이트(완료/평온), 그레이(대기/진행).
 */
export const REQUEST_STATUS_LABEL: Record<PlanRequestStatus, string> = {
  draft: "후보 보는 중",
  selecting: "선택 중",
  confirming: "본인 인증 중",
  dispatched: "제출 대기",
  analyzing: "AI 분석 중",
  completed: "완료",
  rematching: "재매칭",
  failed: "매칭 실패",
};

type Tone = "neutral" | "active" | "alert" | "done";

const STATUS_TONE: Record<PlanRequestStatus, Tone> = {
  draft: "neutral",
  selecting: "active",
  confirming: "active",
  dispatched: "active",
  analyzing: "active",
  completed: "done",
  rematching: "alert",
  failed: "alert",
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-[#efefef] text-[#4b4b4b]",
  active: "bg-[#efefef] text-black",
  alert: "bg-black text-white",
  done: "border border-[#e2e2e2] bg-white text-[#4b4b4b]",
};

export function RequestStatusBadge({
  status,
  className,
}: {
  status: PlanRequestStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap",
        TONE_CLASS[STATUS_TONE[status]],
        className,
      )}
    >
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}
