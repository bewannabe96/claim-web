# features/proposals/ — 제안서 도메인

## 파일 구성

```
proposals/
├─ schema.ts            # zod 입력 검증 + 도메인 Proposal/MatchAssignment 타입
├─ queries.ts           # 'server-only' — Proposal/Assignment 조회 + 분석 리포트 read
├─ actions.ts           # 'use server' — presigned PUT 발급, 제출 (HEAD + SHA-256 + TX)
├─ analysis-schema.ts   # claim.proposal_analysis_report (v5) zod schema
├─ category-labels.ts   # 분석 리포트 category id → 한글 라벨 + KNOWN_CATEGORIES
└─ select-scenarios.ts  # ROI 시계열 계산 + chip 시나리오 선정 (intersection/union)
```

## 도메인 핵심

### Proposal
- 설계사가 제출하는 진설계 PDF + 100자 한줄 평. 정형 필드는 일부러 받지 않음 — AI 가 PDF 에서 추출.
- `Proposal.pdfHash` (SHA-256 hex) — 업로드 직후 항상 채워짐 (S3 GET + `fetchObjectSha256`). SQS 잡 입력 + audit 용도. 분석 리포트 join 키로는 더이상 사용 안 함 (`proposal_id` 기반으로 전환).

### 분석 리포트 (`claim.proposal_analysis_report`)
- 우리 schema 의 1급 테이블 (Prisma 모델). proposal 과 1:1 (`proposal_id` PK + FK).
- 저장 책임: 웹훅 `/api/webhooks/eightytwo-judge-analysis` 가 외부 분석 파이프라인 (eightytwo_judge) 콜백 수신 시 INSERT.
- 읽기 진입점: `queries.ts` 의 `getAnalysisReport(proposalId)` — `WHERE proposalId AND schemaVersion = CURRENT_REPORT_VERSION` 로 한정, `AnalysisReportV5Schema.parse()` gate.
- 운영 패턴: 매 schema 진화 시 row 교체 (현재 v5 한 row 만 존재).
- v6 진화 시: `analysis-schema.ts` 의 zod + `CURRENT_REPORT_VERSION` 만 갱신.

### 분석 실패 (`Proposal.analysisError` + `analysisErrorAt`)
- 외부 파이프라인이 `status=failed` 콜백 보내면 웹훅이 두 컬럼에 마킹. `analyzedAt` 은 건드리지 않음 → plan_request 전이 안 일어남.
- 페이로드: `AnalysisError = { group, type, message, detail? }` (zod 는 `schema.ts:AnalysisErrorSchema`).
  - `group` 은 `input_error | product_id_match | internal_error` 고정 enum.
  - `type` 은 그룹별 세부 사유 (open string, 외부 확장 가능).
  - 라벨 매핑은 `ANALYSIS_ERROR_GROUP_LABEL`, 어드민 pill 은 `app/admin/(dashboard)/_components/analysis-error-pill.tsx` 한 곳에서 색상 정책 단일화.
- 읽기 진입점:
  - `queries.ts:mapProposal` — 모든 Proposal read 가 자동으로 `parseAnalysisError` (zod safeParse) 통과시켜 도메인 타입 노출. parse 실패 row 는 undefined + 로그.
  - `queries.ts:listFailedAnalysisProposals()` — `analyzedAt IS NULL AND analysisErrorAt IS NOT NULL`. 어드민 `/admin/analysis-failures` 페이지 단일 사용처.
- 재시도: `actions.ts:retryProposalAnalysis(proposalId)` — 어드민 전용 (`requireAdminSession`). 두 컬럼 null 초기화 (race-safe `WHERE analyzedAt IS NULL`) → `publishAnalysisJob` 재발행. webhook 이 첫 콜백처럼 멱등 처리.
- 운영 흐름: 외부 시스템 (예: 상품 카탈로그) 수정 → 어드민이 `/admin/analysis-failures` 에서 "분석 재시도" → 성공 시 row 자연스럽게 사라짐. 영구 미해결 케이스는 plan_request 가 `analyzing` 으로 정체된다는 신호.

### 시나리오 선정 (`select-scenarios.ts`)
- `computeRoiSeries(report, category, startAge)` — `보장액 / 누적 보험료` 시계열. 납기 반영. startAge+1 부터 시작 (분모 0 회피).
- `unionCategoryScenarios(reports)` — 모든 제안서 카테고리 union, 가나다순. 검색 모달의 풀.
- `intersectionTopCategories(reports, priority, n)` — 모든 제안서 공통 보장 카테고리 ∩ × admin priority 순서 → 상위 N. 결과 페이지 chip 초기값.

## 안티패턴

- `queries.ts` 안에서 분석 리포트를 raw row 그대로 반환 — 반드시 `parse()` 통과한 `AnalysisReportV5` 만.
- 분석 리포트 카테고리를 cancer/cerebro/cardio 같은 임의 그룹으로 묶기 — 카테고리 자체가 시나리오 단위 (admin priority 가 묶음 정책 담당).
- `Proposal.pdfHash` 는 NOT NULL — `submitProposal` 이 S3 GET → SHA-256 계산. 실패 시 제출 자체 차단 (fail-fast). 동일 PDF 식별 / audit 용도 (분석 리포트 join 키는 proposal.id).
- `analysisError` 초기화에 raw `null` 직접 전달 — Prisma 의 nullable Json 은 `Prisma.JsonNull` sentinel 사용 (`raw null` 은 "필드 미수정" 의미). 패턴은 `retryProposalAnalysis` 참조.
- 어드민 group pill 을 각 페이지에서 새로 정의 — `_components/analysis-error-pill.tsx` 의 `AnalysisErrorPill` 재사용 (색상/라벨 정책 단일화).
