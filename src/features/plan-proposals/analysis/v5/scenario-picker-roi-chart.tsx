"use client";

import { useMemo, useState } from "react";

import { labelForCategory } from "@/features/plan-proposals/category-labels";
import {
  RoiChart,
  type RoiChartChip,
} from "@/features/plan-proposals/ui/roi-chart";
import { ScenarioModal } from "@/features/plan-proposals/ui/scenario-modal";

import type { V5AnalysisViewData } from "./adapt";
import {
  intersectionTopCategories,
  unionCategoryScenarios,
} from "./select-scenarios";

/** 검색 (더보기) chip 의 special id — RoiChart 의 isMore flag 와 함께 사용. */
const MORE_CHIP_ID = "__more__";
/** recent chip 최대 개수 (검색 chip 제외). */
const MAX_RECENT = 3;

/* ============================================================
 * V5 전용 — RoiChart + recent chip + 검색 모달 결합.
 *
 * V5 시나리오 풀 계산 (intersectionTopCategories / unionCategoryScenarios) 에 의존
 * 하므로 `analysis/v5/` 폴더에 위치. v6 가 시나리오 schema 를 다르게 가져가면
 * 그 폴더에 자기 picker 를 둔다.
 *
 * 흐름:
 *   1. 초기 recent = 모든 peers 가 공통 보장하는 카테고리(intersection) ×
 *      admin scenarioPriority → 상위 3.
 *   2. chip = [recent₁, recent₂, recent₃, 🔍] (검색 chip 이 맨 오른쪽).
 *   3. 검색 chip click → ScenarioModal open. 모달 풀 = 모든 peers 의 카테고리
 *      union 가나다순.
 *   4. 모달에서 카테고리 선택 → recent 에 push (이미 있으면 끝으로 이동, dedup).
 *      길이 > 3 이면 맨 왼쪽 빠짐 (FIFO). active = 새로 선택된 카테고리.
 *
 * 제안서 chip 탭 (활성 카드) 전환에도 state 는 유지 — React 의 same-type-same-position
 * reuse 규칙에 따라 remount 되지 않기 때문.
 * ============================================================ */

export function V5ScenarioPickerRoiChart({
  active,
  peers,
  scenarioPriority,
}: {
  active: V5AnalysisViewData;
  peers: V5AnalysisViewData[];
  scenarioPriority: readonly string[];
}) {
  // 최근 선택 chip (max 3, LRU FIFO). 초기값 = intersection × priority.
  const [recent, setRecent] = useState<string[]>(() =>
    intersectionTopCategories(peers, scenarioPriority, MAX_RECENT),
  );
  const [activeScenarioId, setActiveScenarioId] = useState<string>(
    () => recent[0] ?? MORE_CHIP_ID,
  );
  const [moreOpen, setMoreOpen] = useState(false);

  // 모달 풀 — 모든 peers 의 카테고리 union (가나다순).
  const modalCards = useMemo(() => unionCategoryScenarios(peers), [peers]);

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
        proposals={peers}
        scenarios={chipScenarios}
        scenarioId={activeScenarioId}
        onScenarioChange={handleScenarioChange}
        activeId={active.id}
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
