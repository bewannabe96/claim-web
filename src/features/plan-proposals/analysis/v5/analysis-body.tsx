import { ProposalMetricsCard } from "@/features/plan-proposals/ui/proposal-metrics-card";
import { SurrenderLossChart } from "@/features/plan-proposals/ui/surrender-loss-chart";

import type { V5AnalysisViewData } from "./adapt";
import { V5ScenarioPickerRoiChart } from "./scenario-picker-roi-chart";

/* ============================================================
 * V5 분석 본문 — registry V5_ENTRY.ActiveBody 가 export 하는 합성 루트.
 *
 * shell (`ProposalResultView`) 이 활성 카드가 analyzed=true 일 때만 renderAnalysisBody
 * 슬롯으로 dispatch. 미분석 카드의 placeholder / 한줄평 / attribution / CTA 는 shell
 * 책임.
 *
 * peers 는 같은 plan_request 안 **같은 schema 버전** 카드들의 ViewData (active 포함).
 * V5ScenarioPickerRoiChart 와 SurrenderLossChart 가 멀티라인 비교에 사용.
 * cross-version 카드는 peers 에 들어오지 않음 — chip 탭으로 다른 버전 카드를
 * 선택하면 그쪽 entry 의 ActiveBody 가 새로 mount.
 * ============================================================ */

export function V5AnalysisBody({
  active,
  peers,
  scenarioPriority,
}: {
  active: V5AnalysisViewData;
  peers: V5AnalysisViewData[];
  scenarioPriority: readonly string[];
}) {
  return (
    <>
      {/* 핵심 수치 — 보험사 / 매월 납입료 / 계약 구조. */}
      <ProposalMetricsCard metrics={active} />

      {/* ROI 그래프 — [recent₁, recent₂, recent₃, 🔍]. 검색 chip click 시 모달.
       *  peers 가 비면 V5ScenarioPickerRoiChart 내부에서 적절히 처리 (RoiChart 가 null). */}
      <V5ScenarioPickerRoiChart
        active={active}
        peers={peers}
        scenarioPriority={scenarioPriority}
      />

      {/* 해지 시 월부담 — 회수 배율의 flip side. */}
      <SurrenderLossChart proposals={peers} activeId={active.id} />
    </>
  );
}
