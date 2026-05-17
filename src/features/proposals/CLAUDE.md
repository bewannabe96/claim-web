# features/proposals/ — 제안서 도메인

## 파일 구성

```
proposals/
├─ schema.ts            # zod 입력 검증 + 도메인 Proposal/MatchAssignment 타입
├─ queries.ts           # 'server-only' — Proposal/Assignment 조회 + 분석 리포트 read-only
├─ actions.ts           # 'use server' — presigned PUT 발급, 제출 (HEAD + SHA-256 + TX)
├─ analysis-schema.ts   # eightytwo_judge 분석 리포트(v4) zod schema
├─ category-labels.ts   # 분석 리포트 category id → 한글 라벨 + KNOWN_CATEGORIES
└─ select-scenarios.ts  # ROI 시계열 계산 + chip 시나리오 선정 (intersection/union)
```

## 도메인 핵심

### Proposal
- 설계사가 제출하는 진설계 PDF + 100자 한줄 평. 정형 필드는 일부러 받지 않음 — AI 가 PDF 에서 추출.
- `Proposal.pdfHash` (SHA-256 hex) 가 외부 분석 리포트와의 join key. `actions.ts` 의 `submitProposal` 이 S3 의 `fetchObjectSha256` 으로 계산해 저장.

### 분석 리포트 (`eightytwo_judge.proposal_analysis_reports`)
- 같은 팀이 관리하는 별도 schema. Prisma 가 추적하면 `migrate dev` 가 drift reset 을 요구해서 **prisma 모델로 등록하지 않고 raw SQL 로만 접근**.
- `queries.ts` 의 `getAnalysisReport(pdfHash)` 가 단일 진입점: `WHERE pdf_hash = ? AND schema_version = CURRENT_REPORT_VERSION` 으로 고정, 응답을 `AnalysisReportV4Schema.parse()` 로 gate.
- 운영 패턴: 매 schema 진화 시 row 교체 (현재 v4 한 row 만 존재).
- v5 진화 시: `analysis-schema.ts` 의 zod + `CURRENT_REPORT_VERSION` 만 갱신.

### 시나리오 선정 (`select-scenarios.ts`)
- `computeRoiSeries(report, category, startAge)` — `보장액 / 누적 보험료` 시계열. 납기 반영. startAge+1 부터 시작 (분모 0 회피).
- `unionCategoryScenarios(reports)` — 모든 제안서 카테고리 union, 가나다순. 검색 모달의 풀.
- `intersectionTopCategories(reports, priority, n)` — 모든 제안서 공통 보장 카테고리 ∩ × admin priority 순서 → 상위 N. 결과 페이지 chip 초기값.

## 안티패턴

- `queries.ts` 안에서 분석 리포트를 raw row 그대로 반환 — 반드시 `parse()` 통과한 `AnalysisReportV4` 만.
- 분석 리포트 카테고리를 cancer/cerebro/cardio 같은 임의 그룹으로 묶기 — 카테고리 자체가 시나리오 단위 (admin priority 가 묶음 정책 담당).
- `Proposal.pdfHash` 없이 분석 리포트 join — 매 row hash 채워야 함 (백필 별도).
