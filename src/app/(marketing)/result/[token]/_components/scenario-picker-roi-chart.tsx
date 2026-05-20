"use client";

import { useMemo, useState } from "react";

import type { AnalysisReportV5 } from "@/features/plan-proposals/analysis-schema";
import { labelForCategory } from "@/features/plan-proposals/category-labels";
import {
  intersectionTopCategories,
  unionCategoryScenarios,
} from "@/features/plan-proposals/select-scenarios";

import type { PlanProposalData } from "../_lib/result-types";
import { RoiChart, type RoiChartChip } from "./charts/roi-chart";
import { ScenarioModal } from "./scenario-modal";

/** 검색 (더보기) chip 의 special id — RoiChart 의 isMore flag 와 함께 사용. */
const MORE_CHIP_ID = "__more__";
/** recent chip 최대 개수 (검색 chip 제외). */
const MAX_RECENT = 3;

/* ============================================================
 * ScenarioPickerRoiChart — RoiChart + recent chip + 검색 모달 결합
 * ============================================================
 *
 * 흐름:
 *   1. 초기 recent = 모든 proposals 가 공통 보장하는 카테고리(intersection) ×
 *      admin scenarioPriority → 상위 3.
 *   2. chip = [recent₁, recent₂, recent₃, 🔍] (검색 chip 이 맨 오른쪽).
 *   3. 검색 chip click → ScenarioModal open. 모달 풀 = 모든 proposals 의 카테고리
 *      union 가나다순.
 *   4. 모달에서 카테고리 선택 → recent 에 push (이미 있으면 끝으로 이동, dedup).
 *      길이 > 3 이면 맨 왼쪽 빠짐 (FIFO). active = 새로 선택된 카테고리.
 *
 * ROI 시계열은 adapter 가 모든 category_payouts 카테고리에 대해 미리 채워둠
 * (proposal.roi[category]). 차트는 active category 로 lookup.
 *
 * 제안서 chip 탭 (활성 proposal) 전환에도 state 는 유지 — PlanProposalBody 가 React
 * 의 same-type-same-position reuse 규칙에 따라 remount 되지 않기 때문.
 */

export function ScenarioPickerRoiChart({
  proposal,
  proposals,
  reports,
  scenarioPriority,
}: {
  proposal: PlanProposalData;
  proposals: PlanProposalData[];
  reports: AnalysisReportV5[];
  scenarioPriority: readonly string[];
}) {
  // 최근 선택 chip (max 3, LRU FIFO). 초기값 = intersection × priority.
  // useState lazy init — proposals 가 결과 페이지 load 후 변경 안 됨이 일반.
  const [recent, setRecent] = useState<string[]>(() =>
    intersectionTopCategories(reports, scenarioPriority, MAX_RECENT),
  );
  const [activeScenarioId, setActiveScenarioId] = useState<string>(
    () => recent[0] ?? MORE_CHIP_ID,
  );
  const [moreOpen, setMoreOpen] = useState(false);

  // 모달 풀 — 모든 proposals 의 카테고리 union (가나다순).
  const modalCards = useMemo(
    () => unionCategoryScenarios(reports),
    [reports],
  );

  // ScenarioMeta.incidence 는 분석 리포트가 안 줘서 빈 배열. RoiChart 가 length===0
  // 이면 발병률 UI 통째 hide.
  const ZERO_INCIDENCE: number[] = [];

  const recentChips: RoiChartChip[] = recent.map((category) => ({
    id: category,
    label: labelForCategory(category),
    sentenceLabel: labelForCategory(category),
    incidence: ZERO_INCIDENCE,
  }));

  const searchChip: RoiChartChip = {
    id: MORE_CHIP_ID,
    label: "",
    sentenceLabel: "",
    incidence: ZERO_INCIDENCE,
    isMore: true,
  };

  const chipScenarios = [...recentChips, searchChip];

  function handleScenarioChange(id: string, isMore: boolean) {
    if (isMore) {
      setMoreOpen(true);
    } else {
      setActiveScenarioId(id);
    }
  }

  function handleModalSelect(category: string) {
    // LRU FIFO: 중복 dedup 후 맨 오른쪽 push, 길이 > MAX_RECENT 이면 맨 왼쪽 빠짐.
    setRecent((prev) =>
      [...prev.filter((c) => c !== category), category].slice(-MAX_RECENT),
    );
    setActiveScenarioId(category);
    setMoreOpen(false);
  }

  return (
    <>
      <RoiChart
        proposals={proposals}
        scenarios={chipScenarios}
        scenarioId={activeScenarioId}
        onScenarioChange={handleScenarioChange}
        activeId={proposal.id}
      />
      <ScenarioModal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        cards={modalCards}
        onSelect={handleModalSelect}
      />
    </>
  );
}
