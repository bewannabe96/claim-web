import type { ComponentType } from "react";

import type { CardMeta } from "@/features/plan-proposals/card-meta";
import type { PlanProposalCard } from "@/features/plan-proposals/queries";

/* ============================================================
 * 분석 리포트 버저닝 — registry 계약.
 *
 * 각 버전 entry 가 `parseReport` + `adapt` + `ActiveBody` 세 가지를 export.
 * 라우트는 entry 를 직접 다루지 않고 `buildAnalysisRenderer` (analysis/index.ts)
 * 를 거친다. 따라서 라우트는 버전별 타입을 import 할 일이 없다.
 *
 * 신규 버전 추가 절차:
 *   1. analysis/v{N}/ 폴더 생성 — schema.ts, adapt.ts, analysis-body.tsx, index.ts
 *   2. AnalysisVersionEntry<TReport, TViewData> 구현
 *   3. analysis/index.ts 의 ANALYSIS_VERSIONS 에 한 줄 등록
 *
 * 옛 버전 폴더는 freeze — 진화는 항상 additive.
 * ============================================================ */

/**
 * DB row 그대로 — `queries.ts:getRawAnalysisReport` 의 반환. 버전 필터 없이
 * `schemaVersion` 컬럼과 body jsonb 를 함께 반환해 호출자가 registry 로 dispatch.
 */
export type RawAnalysisReport = {
  schemaVersion: number;
  /** jsonb 본문. registry entry 의 `parseReport` 가 zod 로 검증. */
  report: unknown;
};

export type AnalysisVersionEntry<TReport, TViewData> = {
  /** schemaVersion 컬럼 값과 매칭. registry 키. */
  version: number;

  /**
   * raw jsonb → 타입화된 report. 이 버전 zod 의 `.parse()` 가 일반적.
   * 실패 시 throw — `buildAnalysisRenderer` 가 catch 해서 그 카드만 UnsupportedFallback.
   */
  parseReport: (raw: unknown) => TReport;

  /**
   * card + parsed report + 가입자 나이 → 분석 본문 합성에 필요한 ViewData.
   * 카드 메타 (partner / analyzed / note 등) 는 별도 CardMeta 로 빠지므로 ViewData
   * 는 순수 분석 결과 (insurer, monthlyPremium, roi[], surrender[] 등) 만 담는다.
   */
  adapt: (
    card: PlanProposalCard,
    report: TReport,
    customerAge: number,
  ) => TViewData;

  /**
   * 활성 카드의 분석 본문 컴포넌트. shell 이 `renderAnalysisBody(active)` 슬롯
   * 으로 dispatch.
   *
   * - `active` — 현재 chip 으로 선택된 카드의 ViewData
   * - `peers` — 같은 plan_request 안 **같은 버전** 카드들의 ViewData 전체 (active 포함).
   *             cross-card 비교 차트 (ROI 멀티라인 등) 가 사용.
   * - `scenarioPriority` — admin 이 설정한 시나리오 우선순위 (chip 초기값).
   *
   * 분석 미완료 카드는 shell 이 placeholder 로 처리 — 이 컴포넌트는 항상
   * 분석 완료 카드에서만 호출된다.
   */
  ActiveBody: ComponentType<{
    active: TViewData;
    peers: TViewData[];
    scenarioPriority: readonly string[];
  }>;
};

/** active 가 어떤 버전이든 dispatch 받는 ReactNode 슬롯 — shell prop. */
export type RenderAnalysisBody = (active: CardMeta) => React.ReactNode;
