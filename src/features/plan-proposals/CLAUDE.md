# features/plan-proposals/ — 제안서 도메인

## 파일 구성

```
plan-proposals/
├─ schema.ts            # zod 입력 검증 + 도메인 PlanProposal/PlanRequestAssignment 타입
├─ queries.ts           # 'server-only' — PlanProposal/Assignment 조회 + 분석 리포트 raw read
├─ actions.ts           # 'use server' — presigned PUT 발급, 제출 (HEAD + SHA-256 + TX), retry/skip
├─ card-meta.ts         # CardMeta + cardMetaFromProposal — shell 단독 의존 (분석 리포트 버전 무관)
├─ category-labels.ts   # 카테고리 id → 한글 라벨 + 가나다 비교 (버전 간 공유)
├─ analysis/            # 분석 리포트 버저닝 — registry + 버전별 schema/adapt/view
│  ├─ types.ts          #   AnalysisVersionEntry / RawAnalysisReport / RenderAnalysisBody 계약
│  ├─ registry.ts       #   ANALYSIS_VERSIONS map + getAnalysisEntry + SUPPORTED/LATEST 상수
│  ├─ index.tsx         #   buildAnalysisRenderer (라우트 단일 진입점) + re-exports
│  ├─ unsupported.tsx   #   UnsupportedAnalysisVersion placeholder
│  └─ v5/               #   v5 — freeze. 새 버전은 v6/ 신설 + registry 한 줄.
│     ├─ schema.ts          #     v5 전용 zod + AnalysisReportV5
│     ├─ adapt.ts           #     PlanProposalCard + ReportV5 → V5AnalysisViewData
│     ├─ select-scenarios.ts#     computeRoiSeries + union/intersection (ViewData 받음)
│     ├─ scenario-picker-roi-chart.tsx  # V5ScenarioPickerRoiChart (chip + RoiChart + 모달)
│     ├─ analysis-body.tsx  #     V5AnalysisBody — metrics + ROI + surrender 합성
│     └─ index.ts           #     V5_ENTRY export
└─ ui/                  # version-agnostic shell + atomic chart components
   ├─ chart-types.ts                 # 구조적 prop 타입 (ChartProposalView / ProposalMetrics / ScenarioPickerEntry / ...)
   ├─ format-krw.ts                  # 원 → "5,000만원" 표기 유틸
   ├─ roi-chart.tsx                  # 회수 배율 라인 차트 — ChartProposalView[] 받음
   ├─ surrender-loss-chart.tsx       # 해지 시 월평균 부담 곡선 — ChartProposalView[] 받음
   ├─ coverage-panel.tsx             # 시나리오 보장 상세
   ├─ partner-note-bubble.tsx        # 설계사 한줄평 말풍선
   ├─ proposal-metrics-card.tsx      # 보험사 / 월 납입료 / 계약 구조 — ProposalMetrics 받음
   ├─ proposal-tab-chip.tsx          # chip — CardMeta 받음
   ├─ scenario-modal.tsx             # 카테고리 검색 모달 — ScenarioPickerEntry[] 받음
   ├─ proposal-result-view.tsx       # shell — chip 탭 + 한줄평 + placeholder|renderAnalysisBody + attribution + slots
   ├─ result-page-shell.tsx          # BrandMark + "제안서 N건 도착" 헤더 + AnalysisStatusBadge — CardMeta[] 받음
   ├─ result-footer.tsx              # disclaimer + "결과는 N일간 유지돼요"
   ├─ contact-cta-button.tsx         # 상담 진행하기 — partnerName 받음
   ├─ contact-channel-sheet.tsx      # 상담 채널 선택 바텀 시트
   ├─ result-view.tsx                # 가입자 wrapper — CardMeta[] + renderAnalysisBody slot + 인터랙티브 CTA
   └─ preview-result-view.tsx        # read-only wrapper — disabled CTA
```

## 분석 리포트 버저닝

자세한 설계 + 운영 모델은 **[docs/analysis-versioning.md](../../../docs/analysis-versioning.md)** 단일 진실 공급원.

핵심 요약:

- **카드 메타** (partner / analyzed / note / contactRequested / schemaVersion) 는 `card-meta.ts` 의 `CardMeta` — shell 단독 의존, 분석 리포트 버전 무관.
- **분석 ViewData** (insurer / monthlyPremium / roi / surrender / coverage / categoryPayouts) 는 버전별 — `analysis/v5/adapt.ts` 의 `V5AnalysisViewData`. v6 진화 시 자기 폴더에 자기 ViewData.
- **Shell** (`ui/proposal-result-view.tsx`) 은 `CardMeta[]` + `renderAnalysisBody` 슬롯 받음. 활성 카드가 analyzed=true 면 슬롯 호출, 아니면 placeholder.
- **분석 본문** (`analysis/v5/analysis-body.tsx`) 은 V5AnalysisViewData (active) + peers (같은 버전 카드들) 받음. cross-version 카드는 peers 에 들어오지 않음 — chip 탭으로 전환하면 그쪽 entry 의 ActiveBody 가 새로 mount.
- **라우트** 는 `buildAnalysisRenderer({ cards, rawReports, customerAge, scenarioPriority })` 한 번 호출 → `{ cardMetas, renderAnalysisBody }` 받아 shell 에 wiring. 버전 타입 직접 import 안 함.

### 새 버전 추가 절차 (예: v6)

1. `analysis/v6/` 폴더 생성 — `schema.ts` (zod), `adapt.ts` (V6AnalysisViewData), `analysis-body.tsx` (V6AnalysisBody), `index.ts` (V6_ENTRY).
2. `analysis/registry.ts` 의 `ANALYSIS_VERSIONS` 에 `6: V6_ENTRY as AnalysisVersionEntry<unknown, unknown>` 한 줄 추가.
3. v6 가 새 카테고리 도입했으면 `category-labels.ts` 에 union 으로 추가.
4. 기존 v5 코드는 한 줄도 수정 X — 옛 row 는 그대로 V5_ENTRY 가 렌더.

## 도메인 핵심

### PlanProposal
- 설계사가 제출하는 진설계 PDF + 100자 한줄 평. 정형 필드는 일부러 받지 않음 — AI 가 PDF 에서 추출.
- `PlanProposal.pdfHash` (SHA-256 hex) — 업로드 직후 항상 채워짐 (S3 GET + `fetchObjectSha256`). SQS 잡 입력 + audit 용도. 분석 리포트 join 키로는 더이상 사용 안 함 (`proposal_id` 기반으로 전환).

### 분석 리포트 (`claim.plan_proposal_analysis_report`)
- 우리 schema 의 1급 테이블 (Prisma 모델). plan_proposal 과 1:1 (`proposal_id` PK + FK).
- 저장 책임: 웹훅 `/api/webhooks/eightytwo-judge-analysis` 가 외부 분석 파이프라인 (eightytwo_judge) 콜백 수신 시 INSERT. `schema_version` 컬럼 + registry `parseReport` 검증 통과한 본문만.
- 읽기 진입점: `queries.ts:getRawAnalysisReport(proposalId)` — 버전 필터 없이 raw 반환. `buildAnalysisRenderer` 가 카드별로 registry dispatch.
- 운영 패턴: **다버전 공존 허용** — v5/v6 row 가 동시에 살 수 있음. 옛 row 는 그대로 옛 버전 본문으로 렌더.
- registry 미등록 버전 row → `UnsupportedAnalysisVersion` placeholder. 분석 실패와 톤 다름 ("최신 버전 지원 준비중").

### 분석 실패 (`PlanProposal.analysisError` + `analysisErrorAt`)
- 외부 파이프라인이 `status=failed` 콜백 보내면 웹훅이 두 컬럼에 마킹. `analyzedAt` 은 건드리지 않음 → plan_request 전이 안 일어남.
- 페이로드: `AnalysisError = { group, type, message, detail? }` (zod 는 `schema.ts:AnalysisErrorSchema`).
  - `group` 은 `input_error | product_id_match | internal_error` 고정 enum.
  - `type` 은 그룹별 세부 사유 (open string, 외부 확장 가능).
  - 라벨 매핑은 `ANALYSIS_ERROR_GROUP_LABEL`, 어드민 pill 은 `app/admin/(dashboard)/_components/analysis-error-pill.tsx` 한 곳에서 색상 정책 단일화.
- 읽기 진입점:
  - `queries.ts:mapPlanProposal` — 모든 PlanProposal read 가 자동으로 `parseAnalysisError` (zod safeParse) 통과시켜 도메인 타입 노출. parse 실패 row 는 undefined + 로그.
  - `queries.ts:listFailedAnalysisPlanProposals()` — `analyzedAt IS NULL AND analysisErrorAt IS NOT NULL`. 어드민 `/admin/analysis-failures` 페이지 단일 사용처.
- 재시도: `actions.ts:retryPlanProposalAnalysis(proposalId)` — 어드민 전용 (`requireAdminSession`). 단일 entry point 가 세 케이스를 모두 처리: (a) 실패 콜백 수신 (`analysisErrorAt` set) (b) 응답조차 없는 정체 (`analyzedAt IS NULL AND analysisError IS NULL`) (c) **이미 분석 완료** (`analyzedAt IS NOT NULL`). 단일 트랜잭션으로 `analyzedAt/analysisError/analysisErrorAt` 리셋 (race-safe `WHERE analysisSkippedAt IS NULL`) + 리셋이 성공하면 기존 `PlanProposalAnalysisReport` row 삭제 (PK 충돌 방지) → `publishAnalysisJob` 재발행. webhook 이 첫 콜백처럼 멱등 처리. 가드는 `analysisSkippedAt IS NOT NULL` 한 가지 (skip 은 어드민의 명시적 terminal 결정).
- **건너뛰기**: `actions.ts:skipPlanProposalAnalysis(proposalId)` — 어드민 전용. 재시도로도 회복 안 되는 제안서를 결과 마감으로 진행시키는 escape hatch. 가드: `analyzedAt IS NULL AND analysisErrorAt IS NOT NULL`. `proposal.analysisSkippedAt` 마킹 → `closePlanRequest` 호출. state-transition 의 analyzed count 가 `analyzedAt OR analysisSkippedAt` 둘을 동급 취급해 조기 마감 트리거. 가입자 결과 페이지는 해당 카드만 "분석 불가" placeholder 로 분기 (note + 상담 CTA 는 유지).
- 정체 (실패 콜백조차 없음) 재시도: `/admin/requests/[id]` 상세의 assignment 인라인 박스 (`AnalysisPendingBlock`) — `analyzedAt IS NULL AND analysisErrorAt IS NULL` 케이스용. 같은 `retryPlanProposalAnalysis` 액션 재사용.
- **분석 완료된 제안서 재분석**: `/admin/requests/[id]` 상세의 `AnalysisCompletedBlock` — 외부 파이프라인 업그레이드 / 결과 이상 발견 시 어드민이 다시 분석을 트리거. `RetryAnalysisButton` 의 `requireConfirm` 모드 (두 단계 confirm) 로 비가역 가드 — 기존 row 삭제 + 새 콜백이 INSERT 해 교체.

## 라우트 공유

| 호출자 | 데이터 source | UI 엔트리 |
|---|---|---|
| 가입자 결과 페이지 `/plan-request/result/[token]` | `buildAnalysisRenderer({ cards, rawReports, ... })` | `ResultPageShell` + `ResultView` |
| 어드민 preview `/admin/requests/[id]/result` | 동일 | `ResultPageShell` + `PreviewResultView` (480px 프레임 안) |
| 랜딩 데모 `(marketing)/_components/proposal-comparison-demo` | `_lib/demo-proposals.ts:DEMO_CARDS` (V5 mock 직접) | 차트 컴포넌트 개별 사용 |

가입자/어드민은 같은 shell + 같은 registry — flag 분기 없음, wrapper 만 다름 (interactive vs read-only). 데모는 V5 차트만 atomic 사용 (shell 미사용).

사이드이펙트 (`ResultViewedMarker` / `requestPlanProposalContact`) 는 모두 가입자 wrapper 와 그 호출자에 격리. `PreviewResultView` 트리에는 두 컴포넌트 모두 미포함이라 read-only 진입이 가입자측 카운터 / `resultViewedAt` / `contactRequestedAt` 을 절대 오염하지 않음.

이 `ui/` 모듈은 **어느 라우트에도 의존하면 안 된다** — import 는 `@/lib`, `@/features/*`, 그리고 `ui/` 내부 형제만. `analysis/v{N}/` 도 마찬가지. 방향: `랜딩 / 가입자 / 어드민 → ui ← analysis/v{N}/`.

## 안티패턴

- **라우트가 버전별 타입 import** — `AnalysisReportV5` / `V5AnalysisViewData` 를 페이지에 import 하지 말 것. 라우트는 `buildAnalysisRenderer` + `CardMeta` 만 보면 됨.
- **`ui/` 컴포넌트가 버전 전용 타입 받음** — `RoiChart` 가 `V5AnalysisViewData[]` 받는 형태. 구조적 타입 (`ChartProposalView[]`) 으로 받아 어느 버전이든 satisfy 가능하게.
- **`analysis/v{N}/` 폴더가 다른 버전 import** — v5 가 v6 를 import 하지 말 것. 진화는 항상 additive, 옛 폴더 freeze.
- **`adapt` 안에서 `if (version === 5) ...`** — 분기는 registry dispatch 가 책임. adapt 함수 자체는 자기 버전만 알면 됨.
- **`queries.ts` 안에서 분석 리포트를 parse 한 결과 반환** — raw 만 반환. parse 는 registry 의 entry.parseReport 가 담당. 그래야 미지원 버전을 라우트 레이어가 graceful 분기.
- **Row 교체 운영으로 회귀** — 어떤 이유든 v5 row 를 일괄 삭제하지 말 것. registry 가 살아있는 한 옛 row 는 그대로 audit + 가입자 결과 페이지가 작동.
- 분석 리포트 카테고리를 cancer/cerebro/cardio 같은 임의 그룹으로 묶기 — 카테고리 자체가 시나리오 단위 (admin priority 가 묶음 정책 담당).
- `PlanProposal.pdfHash` 는 NOT NULL — `submitPlanProposal` 이 S3 GET → SHA-256 계산. 실패 시 제출 자체 차단 (fail-fast).
- `analysisError` 초기화에 raw `null` 직접 전달 — Prisma 의 nullable Json 은 `Prisma.JsonNull` sentinel 사용 (`raw null` 은 "필드 미수정" 의미).
- 어드민 group pill 을 각 페이지에서 새로 정의 — `_components/analysis-error-pill.tsx` 의 `AnalysisErrorPill` 재사용.
