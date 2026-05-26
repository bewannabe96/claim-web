# features/plan-proposals/ — 제안서 도메인

## 파일 구성

```
proposals/
├─ schema.ts            # zod 입력 검증 + 도메인 PlanProposal/PlanRequestAssignment 타입
├─ queries.ts           # 'server-only' — PlanProposal/Assignment 조회 + 분석 리포트 read
├─ actions.ts           # 'use server' — presigned PUT 발급, 제출 (HEAD + SHA-256 + TX)
├─ adapt-proposal.ts    # PlanProposalCard + AnalysisReportV5 → PlanProposalData (UI shape)
├─ analysis-schema.ts   # claim.plan_proposal_analysis_report (v5) zod schema
├─ category-labels.ts   # 분석 리포트 category id → 한글 라벨 + KNOWN_CATEGORIES
├─ select-scenarios.ts  # ROI 시계열 계산 + chip 시나리오 선정 (intersection/union)
└─ ui/                  # 차트/카드 공유 컴포넌트 (아래 참조)
```

## ui/ — 차트·카드 공유 컴포넌트

```
ui/
├─ chart-types.ts                 # PlanProposalData / RoiPoint / ScenarioMeta 등 공유 데이터 shape
├─ format-krw.ts                  # 원 → "5,000만원" 표기 유틸
├─ roi-chart.tsx                  # 회수 배율 라인 차트 (시나리오 토글 + 커서)
├─ surrender-loss-chart.tsx       # 해지 시 월평균 부담 곡선
├─ coverage-panel.tsx             # 시나리오 보장 상세 (총액 + 담보 breakdown)
├─ partner-note-bubble.tsx        # 설계사 한줄평 말풍선
├─ proposal-metrics-card.tsx      # 보험사 / 월 납입료 / 계약 구조 카드
├─ proposal-tab-chip.tsx          # 제안서 전환 탭 칩 (아바타 + 이름)
├─ scenario-modal.tsx             # 카테고리 검색 모달 (한글 자모/초성 substring)
├─ scenario-picker-roi-chart.tsx  # RoiChart + recent chip + scenario-modal 결합
├─ proposal-result-view.tsx       # chip 탭 + 활성 제안서 본문 (slot: bottomActionFor / footer)
├─ result-page-shell.tsx          # BrandMark + "제안서 N건 도착" 헤더 + AnalysisStatusBadge (chrome)
├─ result-footer.tsx              # disclaimer + "결과는 N일간 유지돼요" — footer slot 공용
├─ contact-cta-button.tsx         # 상담 진행하기 pill button — props 로 idle/요청완료/preview 분기
├─ contact-channel-sheet.tsx      # 상담 채널 선택 바텀 시트 (kakao / sms)
├─ result-view.tsx                # 가입자 wrapper — state + sheet + 인터랙티브 CTA
└─ admin-preview-result-view.tsx  # 어드민 preview wrapper — disabled CTA 만 (state/sheet 없음)
```

**라우트 공유 + 의존성 방향**: 다음 셋이 같은 `ui/` 모듈을 공유한다:

| 호출자 | 데이터 source | UI 엔트리 |
|---|---|---|
| 가입자 결과 페이지 `/plan-request/result/[token]` | `adaptPlanProposal(card, report, age)` | `ResultPageShell` + `ResultView` |
| 어드민 preview `/admin/requests/[id]/result` | 동일 `adaptPlanProposal` | 같은 shell + `AdminPreviewResultView` (480px 프레임 안) |
| 랜딩 데모 `(marketing)/_components/proposal-comparison-demo` | `_lib/demo-proposals.ts` mock | `RoiChart` 등 개별 컴포넌트 |

가입자/어드민 wrapper 모두 `ProposalResultView` 의 `bottomActionFor` + `footer`
slot 패턴으로 합성 — flag 분기 없음, 각 wrapper 가 단일 책임 (interactive vs preview).
공유 부품 (`ContactCtaButton`, `ResultFooter`) 는 props 만으로 모드를 표현.

사이드이펙트 (`ResultViewedMarker` / `requestPlanProposalContact`) 는 모두 가입자
wrapper 와 그 호출자에 격리. 어드민 preview 트리에는 두 컴포넌트 모두 미포함이라
preview 진입이 가입자측 카운터 / `resultViewedAt` / `contactRequestedAt` 을 절대
오염하지 않음 — flag 가 아닌 트리 격리로 보장.

어드민 라우트가 호출하더라도 `'use client'` 컴포넌트가 admin 인증 경계를 침범하지
않음 (인증은 `(dashboard)/layout.tsx` 의 `requireAdminSession` 이 책임).

이 `ui/` 모듈은 **어느 라우트에도 의존하면 안 된다** — import 는 `@/lib`, `@/features/*`,
그리고 `ui/` 내부 형제만. 방향: `랜딩 / 가입자 / 어드민 → ui ← 자기 자신`.

## 도메인 핵심

### PlanProposal
- 설계사가 제출하는 진설계 PDF + 100자 한줄 평. 정형 필드는 일부러 받지 않음 — AI 가 PDF 에서 추출.
- `PlanProposal.pdfHash` (SHA-256 hex) — 업로드 직후 항상 채워짐 (S3 GET + `fetchObjectSha256`). SQS 잡 입력 + audit 용도. 분석 리포트 join 키로는 더이상 사용 안 함 (`proposal_id` 기반으로 전환).

### 분석 리포트 (`claim.plan_proposal_analysis_report`)
- 우리 schema 의 1급 테이블 (Prisma 모델). plan_proposal 과 1:1 (`proposal_id` PK + FK).
- 저장 책임: 웹훅 `/api/webhooks/eightytwo-judge-analysis` 가 외부 분석 파이프라인 (eightytwo_judge) 콜백 수신 시 INSERT.
- 읽기 진입점: `queries.ts` 의 `getAnalysisReport(proposalId)` — `WHERE proposalId AND schemaVersion = CURRENT_REPORT_VERSION` 로 한정, `AnalysisReportV5Schema.parse()` gate.
- 운영 패턴: 매 schema 진화 시 row 교체 (현재 v5 한 row 만 존재).
- v6 진화 시: `analysis-schema.ts` 의 zod + `CURRENT_REPORT_VERSION` 만 갱신.

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
- **건너뛰기**: `actions.ts:skipPlanProposalAnalysis(proposalId)` — 어드민 전용. 재시도로도 회복 안 되는 제안서를 결과 마감으로 진행시키는 escape hatch. 가드: `analyzedAt IS NULL AND analysisErrorAt IS NOT NULL` (성공한 케이스 / 응답조차 없는 정체 케이스 차단 — 정체는 retry 로 실패 응답 유도 후 skip). `proposal.analysisSkippedAt` 마킹 → `closePlanRequest` 호출. state-transition 의 analyzed count 가 `analyzedAt OR analysisSkippedAt` 둘을 동급 취급해 조기 마감 트리거. 가입자 결과 페이지는 해당 카드만 "분석 불가" placeholder 로 분기 (note + 상담 CTA 는 유지). UI: [admin/(dashboard)/_components/skip-analysis-button.tsx](../../app/admin/(dashboard)/_components/skip-analysis-button.tsx) — 두 단계 confirm 으로 비가역 가드.
- 운영 흐름: 외부 시스템 (예: 상품 카탈로그) 수정 → 어드민이 `/admin/analysis-failures` 에서 "분석 재시도" → 성공 시 row 자연스럽게 사라짐. 회복 불가 판단 시 "분석 건너뛰기" → 가입자 결과 화면이 그 카드만 "분석 불가" 로 표시되고 나머지 제안서로 마감 진행. 분석 실패가 미해결인 동안 plan_request 는 `analyzing` 에 머무르지만, 마감시간이 지나면 cron 의 시간 마감이 미분석 제안서를 포함한 채 `completed` 로 강제 종결 — 즉 재시도/건너뛰기는 마감 전에 처리해야 결과에 반영된다.
- 정체 (실패 콜백조차 없음) 재시도: `/admin/requests/[id]` 상세의 assignment 인라인 박스 (`AnalysisPendingBlock`) — `analyzedAt IS NULL AND analysisErrorAt IS NULL` 케이스용. 같은 `retryPlanProposalAnalysis` 액션 재사용. 시간 임계값 없이 사람이 모니터링.
- **분석 완료된 제안서 재분석**: `/admin/requests/[id]` 상세의 `AnalysisCompletedBlock` — 외부 파이프라인 업그레이드 / 결과 이상 발견 시 어드민이 다시 분석을 트리거. `RetryAnalysisButton` 의 `requireConfirm` 모드 (두 단계 confirm) 로 비가역 가드 — 기존 `PlanProposalAnalysisReport` row 가 삭제되고 새 콜백이 INSERT 해 교체됨. plan_request 가 이미 `completed` 라도 `closePlanRequest` 멱등 가드로 상태가 되돌아가진 않고, 새 리포트는 결과 페이지 (resultToken 동일) 에 자연스럽게 노출. `contactRequestedAt` 등 가입자 액션 상태는 보존.

### 시나리오 선정 (`select-scenarios.ts`)
- `computeRoiSeries(report, category, startAge)` — `보장액 / 누적 보험료` 시계열. 납기 반영. startAge+1 부터 시작 (분모 0 회피).
- `unionCategoryScenarios(reports)` — 모든 제안서 카테고리 union, 가나다순. 검색 모달의 풀.
- `intersectionTopCategories(reports, priority, n)` — 모든 제안서 공통 보장 카테고리 ∩ × admin priority 순서 → 상위 N. 결과 페이지 chip 초기값.

## 안티패턴

- `queries.ts` 안에서 분석 리포트를 raw row 그대로 반환 — 반드시 `parse()` 통과한 `AnalysisReportV5` 만.
- 분석 리포트 카테고리를 cancer/cerebro/cardio 같은 임의 그룹으로 묶기 — 카테고리 자체가 시나리오 단위 (admin priority 가 묶음 정책 담당).
- `PlanProposal.pdfHash` 는 NOT NULL — `submitPlanProposal` 이 S3 GET → SHA-256 계산. 실패 시 제출 자체 차단 (fail-fast). 동일 PDF 식별 / audit 용도 (분석 리포트 join 키는 plan_proposal.id).
- `analysisError` 초기화에 raw `null` 직접 전달 — Prisma 의 nullable Json 은 `Prisma.JsonNull` sentinel 사용 (`raw null` 은 "필드 미수정" 의미). 패턴은 `retryPlanProposalAnalysis` 참조.
- 어드민 group pill 을 각 페이지에서 새로 정의 — `_components/analysis-error-pill.tsx` 의 `AnalysisErrorPill` 재사용 (색상/라벨 정책 단일화).
