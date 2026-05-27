# 분석 리포트 버저닝

> `plan_proposal_analysis_report.schema_version` 컬럼을 1급으로 끌어올려 분석 뷰
> (가입자 결과 페이지 + 어드민 미리보기) 가 버전마다 다르게 렌더되고, 차트·카드
> 컴포넌트는 버전 간 자유롭게 공유되도록 하는 구조.
>
> 이 문서는 설계 결정과 디렉토리 모양의 단일 진실 공급원입니다. 운영 가이드는
> 구현 PR 1 이 끝난 후 [src/features/plan-proposals/CLAUDE.md](../src/features/plan-proposals/CLAUDE.md)
> 에 반영됩니다.

---

## 0. 결정 사항

| 항목 | 결정 |
|---|---|
| 버저닝 범위 | 가입자 결과 페이지 + 어드민 미리보기 **양쪽**. row 교체 운영 패턴 폐기. |
| DB 다버전 공존 | **허용** — v5, v6 row 가 동시 존재 가능. queries 의 버전 필터 제거. |
| 뷰 진화 자유도 | **뷰 구성 자체가 다를 수 있음** (그래프 추가/제거, 섹션 재배치 등) — `adapt` 와 `AnalysisBody` 가 짝으로 버전화. |
| 합성 단위 | **카드 단위 dispatch** — 한 plan_request 안 v5/v6 가 섞이면 shell 은 같지만 활성 카드 본문이 카드의 버전 entry 가 만든 컴포넌트로 dispatch. CommonViewData / downgrade 매트릭스 안 만듦. |
| Cross-card 비교 (ROI 멀티라인 등) | **같은 버전 peers 끼리만**. v5 카드를 보고 있으면 같은 plan_request 의 v5 카드들만 비교 곡선에 등장. |
| 공유 컴포넌트 위치 | `features/plan-proposals/ui/` — 버전 비의존. 한 버전 전용 컴포넌트는 `analysis/v{N}/_components/` 에 두고 두 번째 버전이 쓰기 시작하면 `ui/` 로 승격. |
| Dispatch | `analysis/index.ts` 의 `buildAnalysisRenderer(...)` 한 군데에서 모든 cards × rawReports 를 버전별로 그룹핑·parse·adapt 후 `(active: CardMeta) => ReactNode` 클로저로 반환. 라우트는 cards / reports / age / priority 만 넘기면 끝. |
| 미지원 버전 폴백 | `UnsupportedAnalysisVersion` 컴포넌트 — registry miss 시 그 카드의 분석 본문 자리만 placeholder. shell (chip 탭 + 한줄평 + attribution + CTA) 은 정상. |
| 운영 모델 | 외부 분석 파이프라인이 v{N} 콜백 보내기 시작 → 우리 쪽은 `analysis/v{N}/` 폴더 추가 + registry 한 줄 등록. 기존 v{N-1} row 는 그대로 살아있음. 점진 마이그레이션 가능. |

---

## 1. 현재 상태와 한계

### 1.1 데이터 레이어 — 이미 부분 버저닝

[prisma/schema.prisma:600](../prisma/schema.prisma) `PlanProposalAnalysisReport.schemaVersion` 컬럼 + `@@index([schemaVersion])`.

[src/features/plan-proposals/queries.ts:172](../src/features/plan-proposals/queries.ts) `getAnalysisReport`:

```ts
if (!row || row.schemaVersion !== CURRENT_REPORT_VERSION) return null;
return AnalysisReportV5Schema.parse(row.report);
```

호출자는 항상 단일 버전만 봄. 운영 패턴은 **"매 schema 진화 시 row 교체"** — 한 시점에 DB 에 한 버전만 존재.

### 1.2 뷰 레이어 — 단일 버전 강결합

[src/features/plan-proposals/adapt-proposal.ts](../src/features/plan-proposals/adapt-proposal.ts) 가
`PlanProposalCard + AnalysisReportV5 → PlanProposalData` (단일 UI shape) 로 변환.

[src/features/plan-proposals/ui/chart-types.ts](../src/features/plan-proposals/ui/chart-types.ts) 의
`PlanProposalData` 가 모든 차트/카드 컴포넌트의 prop 시그니처와 강결합:

- `RoiChart`, `CoveragePanel`, `ProposalMetricsCard`, `ProposalResultView`, `PreviewResultView` 등이 전부 이 단일 shape 기준.
- "카드 메타" (partner.name, analyzed, contactRequested) 와 "분석 결과" (insurer, monthlyPremium, roi, ...) 가 한 타입에 평탄화 → 진짜 버전 의존 부분과 그렇지 않은 부분이 섞임.

### 1.3 한계

| 현 모델 | 한계 |
|---|---|
| Row 교체 운영 | v6 마이그레이션 도중 v5 row 가 잠시 사라짐 → 그 사이 들어온 가입자는 결과 못 봄. |
| 단일 ViewData | v6 가 새 필드 / 새 섹션을 도입하면 `PlanProposalData` 가 폭발 (옵셔널 떡칠). |
| 단일 adapt | v5/v6 가 같은 함수 안에서 if 분기 → 시간 지나면 분기 폭발. |
| 라우트가 직접 schema 타입 import | v6 추가 시 모든 호출자 변경. |
| 카드 메타와 분석 결과 평탄화 | 버전 비의존 부분 (chip / CTA / 한줄평) 까지 V5 타입에 묶여 shell 도 V5 강결합. |

---

## 2. 새 구조

### 2.1 핵심 분해

데이터 모양을 두 층으로 나눕니다:

| 층 | 타입 | 위치 | 책임 |
|---|---|---|---|
| **카드 메타** | `CardMeta` | `features/plan-proposals/card-meta.ts` | partner, analyzed/skipped, contactRequested, note, **schemaVersion**. 분석 리포트 무관. `PlanProposalCard` + raw row 의 schemaVersion 만으로 derive. |
| **분석 ViewData** | `AnalysisViewDataV5` (등 버전별) | `analysis/v{N}/adapt.ts` | metrics / ROI / surrender / coverage 등 리포트 derived. 버전마다 자유 진화. |

이로부터 UI 분해:

| UI 단위 | 책임 | 위치 |
|---|---|---|
| **Shell** | chip 탭 + sticky nav + 한줄평 + 분석 미완료 placeholder + attribution + footer/CTA slot. 카드 메타만 본다. | `ui/` (version-agnostic) |
| **AnalysisBody** | 분석된 카드의 본문 (metrics + ROI + surrender 등). 버전마다 다르게 합성. | `analysis/v{N}/analysis-body.tsx` |
| **공유 차트** | RoiChart / CoveragePanel / SurrenderLossChart 등. 자기 props (RoiPoint[], CoverageItem[]) 만 받음. 어느 버전 AnalysisBody 가 합성하든 무관. | `ui/` |

### 2.2 디렉토리

```
src/features/plan-proposals/
├─ schema.ts                # 변경 없음 (PlanProposal 도메인 타입)
├─ queries.ts               # getAnalysisReport → getRawAnalysisReport (§3.1)
├─ actions.ts               # 변경 없음
├─ category-labels.ts       # 변경 없음 (버전 간 공유)
├─ card-meta.ts             # NEW — CardMeta 타입 + cardMetaFromProposal(card, version?)
│
├─ analysis/                # NEW — 분석 리포트 버저닝 루트
│  ├─ types.ts              #   AnalysisVersionEntry<TReport, TViewData> 계약
│  ├─ index.ts              #   ANALYSIS_VERSIONS registry + buildAnalysisRenderer + UnsupportedAnalysisVersion
│  └─ v5/
│     ├─ schema.ts          #   (분리) v5 전용 zod + AnalysisReportV5 타입
│     ├─ adapt.ts           #   PlanProposalCard + ReportV5 → AnalysisViewDataV5
│     ├─ select-scenarios.ts#   ROI 시계열 + union/intersection (v5 report 강결합 → v5 폴더로 이주)
│     ├─ analysis-body.tsx  #   <V5AnalysisBody active peers scenarioPriority> 합성
│     ├─ index.ts           #   V5_ENTRY export
│     └─ _components/       #   (있다면) v5 전용 UI. 두 번째 버전이 쓰면 ui/ 로 승격.
│
└─ ui/                      # version-agnostic shell + atomic chart components
   ├─ chart-types.ts        # SLIM — RoiPoint, SurrenderLossPoint, CoverageItem, ScenarioMeta (PlanProposalData 제거)
   ├─ format-krw.ts
   ├─ roi-chart.tsx         # 자기 props 만 받음 — RoiSeries[] (per-proposal id+name+points)
   ├─ coverage-panel.tsx
   ├─ surrender-loss-chart.tsx
   ├─ partner-note-bubble.tsx
   ├─ proposal-tab-chip.tsx # takes CardMeta
   ├─ scenario-modal.tsx
   ├─ proposal-result-view.tsx  # shell — chip 탭 + 한줄평 + placeholder|renderAnalysisBody + attribution + slots
   ├─ result-page-shell.tsx     # BrandMark + "제안서 N건 도착" + AnalysisStatusBadge (CardMeta 기반)
   ├─ result-footer.tsx
   ├─ contact-cta-button.tsx    # takes CardMeta (partner.name) + flags
   ├─ contact-channel-sheet.tsx
   ├─ result-view.tsx           # 가입자 wrapper — CardMeta[] + renderAnalysisBody slot + 인터랙티브 CTA
   └─ preview-result-view.tsx   # 어드민 preview wrapper — read-only 모드
```

### 2.3 Registry 계약

[src/features/plan-proposals/analysis/types.ts](../src/features/plan-proposals/analysis/types.ts):

```ts
export type RawAnalysisReport = {
  schemaVersion: number;
  report: unknown;
};

export type AnalysisVersionEntry<TReport, TViewData> = {
  version: number;
  /** zod parse. 실패 시 throw. */
  parseReport: (raw: unknown) => TReport;
  /** card + parsed report + age → ViewData. */
  adapt: (
    card: PlanProposalCard,
    report: TReport,
    customerAge: number,
  ) => TViewData;
  /** 활성 카드 분석 본문 컴포넌트. peers 는 같은 버전 카드들의 ViewData. */
  ActiveBody: ComponentType<{
    active: TViewData;
    peers: TViewData[];
    scenarioPriority: readonly string[];
  }>;
};
```

[src/features/plan-proposals/analysis/index.ts](../src/features/plan-proposals/analysis/index.ts):

```ts
export const ANALYSIS_VERSIONS = {
  5: V5_ENTRY,
  // 6: V6_ENTRY,  // 미래
} as const;

export function getAnalysisEntry(version: number): AnalysisVersionEntry<any, any> | null;

/**
 * 라우트가 한 번 호출하면 끝나는 합성 진입점. 카드별로 버전 entry lookup → parse →
 * adapt 후, `(active) => ReactNode` 클로저로 렌더 함수 반환. 페이지는 결과의
 * `cardMetas` 와 `renderAnalysisBody` 만 shell 에 넘기면 됨.
 */
export function buildAnalysisRenderer(params: {
  cards: PlanProposalCard[];
  rawReports: (RawAnalysisReport | null)[]; // parallel to cards
  customerAge: number;
  scenarioPriority: readonly string[];
}): {
  cardMetas: CardMeta[];
  renderAnalysisBody: (active: CardMeta) => ReactNode;
};
```

### 2.4 호출 시퀀스 (어드민 미리보기 예시)

```tsx
const cards = await listPlanProposalCardsForRequest(requestId);
const rawReports = await Promise.all(
  cards.map(c => getRawAnalysisReport(c.proposal.id)),
);

const { cardMetas, renderAnalysisBody } = buildAnalysisRenderer({
  cards,
  rawReports,
  customerAge,
  scenarioPriority: settings.scenarioPriority,
});

<PreviewResultView
  cards={cardMetas}
  renderAnalysisBody={renderAnalysisBody}
  resultRetentionDays={settings.resultRetentionDays}
  disabledNotice={PREVIEW_DISABLED_NOTICE}
/>
```

shell 은 chip 탭 + 한줄평 + (분석 미완료 placeholder | `renderAnalysisBody(active)`) + attribution + CTA/footer 슬롯을 합성. 라우트는 버전 타입을 직접 import 하지 않음.

---

## 3. queries 변경

### 3.1 `getAnalysisReport` → `getRawAnalysisReport`

버전 필터 제거. raw row + schemaVersion 반환.

```ts
export type RawAnalysisReport = {
  schemaVersion: number;
  report: unknown; // 호출자가 registry 통해 parse
};

export async function getRawAnalysisReport(
  proposalId: string,
): Promise<RawAnalysisReport | null> {
  const row = await prisma.planProposalAnalysisReport.findUnique({
    where: { proposalId },
    select: { report: true, schemaVersion: true },
  });
  return row ? { schemaVersion: row.schemaVersion, report: row.report } : null;
}
```

호출자는 registry 의 `parseReport` 로 안전 통과. 잘못된 버전은 `getAnalysisEntry(version) === null` 분기. parse 실패는 entry 의 zod 가 throw → `buildAnalysisRenderer` 가 catch + log + UnsupportedFallback 으로 격리.

### 3.2 호환 wrapper 없음

옛 `getAnalysisReport` 는 PR1 안에서 즉시 제거. 모든 호출자 (가입자/어드민/없음) 가 한 PR 에 동시 전환.

### 3.3 웹훅 (`/api/webhooks/eightytwo-judge-analysis`)

현재 `z.literal(CURRENT_REPORT_VERSION)` 로 단일 버전만 수신. 새 모델:

```ts
// 등록된 모든 버전 수신 (외부가 우리보다 먼저 v{N+1} 보내도 ignored 안 됨)
schema_version: z.union(
  Object.keys(ANALYSIS_VERSIONS).map(v => z.literal(Number(v)))
),
```

각 버전 entry 의 `parseReport` 가 본문 형태도 같이 검증. registry 에 미등록된 버전이 들어오면 zod 가 reject — 콜백 로그에 명시.

---

## 4. 다버전 합성 — 카드 단위 dispatch (CommonViewData 폐기)

### 4.1 정책

한 plan_request 안에 v5 카드 2개 + v6 카드 1개가 있을 때:

- **Shell** (chip 탭, sticky nav, 한줄평, attribution, CTA) 은 한 트리 — `CardMeta` 만으로 그려져 버전 무관.
- chip 클릭 시 활성 카드가 바뀜. shell 이 `renderAnalysisBody(active)` 를 호출.
- `renderAnalysisBody` 는 `active.schemaVersion` 으로 entry 를 찾아 그 entry 의 `ActiveBody` 를 렌더. `peers` 는 **같은 버전의 카드들만**.
- 따라서: v5 카드를 보고 있으면 V5 본문이 v5 peers (2개) 만으로 ROI 비교 차트를 그림. v6 카드를 보고 있으면 V6 본문이 v6 peers (1개) 만으로 그림.

### 4.2 다운그레이드/업그레이드 매트릭스 없음

이 정책의 큰 이점:

- v5 → v6 다운그레이드 함수 / common subset 정의 / "v6 에서 옛 카드를 어떻게 보일지" 같은 결정사항 0.
- 새 버전 추가가 진짜 "폴더 추가 + registry 한 줄" 로 끝남. 옛 코드 한 줄도 수정 안 함.
- Audit 정직성: v5 row 는 v5 본문으로 렌더 — "이 카드는 그 시점에 v5 였다" 가 그대로 보존.

### 4.3 트레이드오프

- chip 탭 화면이 카드마다 본문 골격이 다를 수 있음 — UX 일관성 측면에서 작은 비용. 실제 운영에선 한 plan_request 의 모든 카드가 거의 같은 시점에 분석돼 같은 버전이라 거의 드러나지 않음.
- Cross-version ROI 직접 비교는 불가능 — "v5 카드와 v6 카드 차트를 한 화면에 겹쳐 보기" 같은 기능은 별도로 구현해야 함 (현재 요구사항 아님).

위 둘이 문제가 되는 시점이 오면 그때 `CommonViewData` / 다운그레이드 정책을 추가하는 게 가능 — 지금은 over-engineering.

---

## 5. Migration 단계

### 5.1 PR 1 — 구조 전환 (완료)

목표: 카드 단위 dispatch 구조로 일괄 전환. 동작 변화 0 (v5 한 버전만 운영 중).

- [x] `analysis/types.ts`, `analysis/registry.ts`, `analysis/index.tsx`, `analysis/unsupported.tsx`, `card-meta.ts` 신설.
- [x] `analysis-schema.ts` → `analysis/v5/schema.ts` 이주.
- [x] `adapt-proposal.ts` → `analysis/v5/adapt.ts` 이주 (return `V5AnalysisViewData` — 카드 메타 제외, `categoryPayouts` 추가).
- [x] `select-scenarios.ts` → `analysis/v5/select-scenarios.ts` 이주, `union/intersection` 이 `V5AnalysisViewData[]` 받도록 (raw report 의존성 제거).
- [x] `ui/scenario-picker-roi-chart.tsx` → `analysis/v5/scenario-picker-roi-chart.tsx` 이주 (V5 시나리오 풀 의존).
- [x] `analysis/v5/analysis-body.tsx` 신설 — `ProposalMetricsCard` + `V5ScenarioPickerRoiChart` + `SurrenderLossChart` 합성.
- [x] `V5_ENTRY` 정의 + registry 등록.
- [x] shell (`ui/proposal-result-view.tsx`, `ui/result-page-shell.tsx`, `ui/proposal-tab-chip.tsx`, `ui/contact-cta-button.tsx`) 가 `CardMeta` + 슬롯 받도록 리팩토링.
- [x] 차트 atomic (`ui/roi-chart.tsx`, `ui/surrender-loss-chart.tsx`, `ui/proposal-metrics-card.tsx`, `ui/scenario-modal.tsx`) prop 슬림화 — 구조적 타입 (`ChartProposalView`, `ProposalMetrics`, `ScenarioPickerEntry`) 으로.
- [x] `ui/result-view.tsx`, `ui/preview-result-view.tsx` 가 `renderAnalysisBody` 슬롯을 받아 wiring.
- [x] `queries.ts` 의 `getAnalysisReport` → `getRawAnalysisReport`.
- [x] 가입자 / 어드민 / 데모 / 웹훅 호출자 전환.
- [x] 웹훅 — `schema_version` literal → registry lookup + entry.parseReport.
- [x] 옛 파일 (`analysis-schema.ts`, `adapt-proposal.ts`, `select-scenarios.ts`, `ui/scenario-picker-roi-chart.tsx`) 삭제.
- [x] CLAUDE.md (`features/plan-proposals/`, `server/`) 갱신.
- [x] `pnpm build` + `pnpm lint` 통과.

### 5.2 PR N — 실제 v6 추가 (외부 파이프라인 v6 콜백 시작 시점)

- [ ] `analysis/v6/` 폴더 (schema / adapt / select-scenarios / analysis-body / index).
- [ ] registry 한 줄 등록.
- [ ] v6 가 새 카테고리 도입했으면 `category-labels.ts` 에 union 으로 추가.
- [ ] 옛 v5 row 는 그대로 v5 본문으로 렌더 — 코드 수정 0.

---

## 6. 안티패턴

- **라우트가 버전별 타입 (`AnalysisReportV5`, `AnalysisViewDataV5`) 을 직접 import** — 라우트는 `buildAnalysisRenderer` 와 `CardMeta` 만 알면 됨.
- **`ui/` 컴포넌트가 버전 전용 타입을 받음** — `RoiChart` 가 `PlanProposalDataV5` 같은 통째 shape 받는 형태. 작은 단위 (`RoiSeries[]`, `CoverageItem[]`) 만 받게 슬림화.
- **`adapt` 안에서 `if (version === 5) ... else if (version === 6)`** — 분기는 registry dispatch 가 책임. adapt 함수 자체는 자기 버전만 알면 됨.
- **공유 컴포넌트에 카드 메타 + 분석 결과를 한 prop 으로** — `ProposalMetricsCard({ proposal: PlanProposalData })` 같은 형태. 메타는 shell 이 처리, 분석 결과만 받게 분리.
- **Row 교체 운영으로 회귀** — 어떤 이유든 v5 row 를 일괄 삭제하지 말 것. registry 가 살아있는 한 옛 row 는 그대로 audit + 옛 가입자 결과 페이지가 작동.
- **`getRawAnalysisReport` 가 zod parse 한 결과 반환** — raw 만 반환. parse 는 registry 경유. 그래야 미지원 버전을 라우트 레이어가 분기 가능.
- **새 버전 도입 시 옛 폴더 (`analysis/v5/`) 수정** — registry 추가 외엔 옛 폴더는 freeze. 진화는 always-additive.

---

## 7. 미해결 / 추후 검토

- **시나리오 카테고리 라벨 정책**: `category-labels.ts` 는 모든 버전 union 으로 라벨 매핑. 옛 버전이 모르는 카테고리는 chip 풀에 안 등장 — 자연스러운 격리.
- **카테고리 schema 자체의 진화**: 카테고리 id 가 v5 → v6 에서 rename 되는 경우 (예: `lung_cancer` → `cancer.lung`). 현재 가정: id 안정. 깨지면 `category-labels.ts` 에 alias 매핑 추가.
- **버전 간 cross-comparison 요구**: 향후 "v5 카드와 v6 카드 ROI 를 한 차트에 겹치기" 가 필요해지면 `CommonViewData` + downgrade 정책을 그때 추가 (선택지를 열어둠).
- **registry 에 미등록 버전 row** (예: 외부가 v7 콜백을 우리보다 먼저 보냄): `UnsupportedAnalysisVersion` 으로 graceful — 분석 실패와 다른 톤 ("최신 버전 지원 준비중") 으로 표시. 어드민 모니터링용 별도 알림 검토.
