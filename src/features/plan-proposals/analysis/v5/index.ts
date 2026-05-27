import type { AnalysisVersionEntry } from "@/features/plan-proposals/analysis/types";

import { adaptV5, type V5AnalysisViewData } from "./adapt";
import { V5AnalysisBody } from "./analysis-body";
import { AnalysisReportV5Schema, type AnalysisReportV5 } from "./schema";

/* ============================================================
 * V5_ENTRY — analysis/registry.ts 의 ANALYSIS_VERSIONS[5] 등록 단위.
 *
 * 이 폴더 (`analysis/v5/`) 는 freeze — 진화는 새 폴더 (`analysis/v6/`) + registry
 * 한 줄 추가. 자세한 운영 모델은 [docs/analysis-versioning.md](../../../../../docs/analysis-versioning.md).
 *
 * Public surface 는 의도적으로 `V5_ENTRY` + `V5AnalysisViewData` 둘만 — V5 내부
 * zod schema (`AnalysisReportV5Schema`) 나 도메인 enum (`RefundType`) 은 외부로
 * 흘리지 않는다. "라우트가 버전 타입 import 금지" 안티패턴을 export 면에서도
 * 강제. `V5AnalysisViewData` 만 한 가지 예외 — 랜딩 데모가 V5 차트로 mock 을
 * 채우는 용도로 직접 import.
 * ============================================================ */

export const V5_ENTRY: AnalysisVersionEntry<
  AnalysisReportV5,
  V5AnalysisViewData
> = {
  version: 5,
  parseReport: (raw) => AnalysisReportV5Schema.parse(raw),
  adapt: adaptV5,
  ActiveBody: V5AnalysisBody,
};

export type { V5AnalysisViewData } from "./adapt";
