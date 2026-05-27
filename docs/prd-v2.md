# CLAIM — v2 PRD (Workbench 진화)

> **비교 화면을 funnel의 종착점에서, 자유롭게 드나드는 작업대로.**
>
> 가입자는 제안서 비교 도구(workbench)에 먼저 도착한다. 이 도구는 빈 슬롯에 외부 제안서를 직접 업로드하거나, 우리 파트너 풀에서 제안서를 받아 채울 수 있다. 단방향 funnel(요청 → 후보 → 배정 → 결과)이 사라지는 게 아니라, **comparison-first** 진입 모델 안의 한 action 으로 흡수된다.

- 작성일: 2026-05-26
- 상태: v2 방향 확정, 구현 phasing 검토 중
- 관련 문서:
  - [docs/prd-v1.md](./prd-v1.md) — v1 MVP (현재 라이브). 단방향 funnel + 결과 화면 비교.
  - [docs/product-hypothesis.md](./product-hypothesis.md) — tool-led entry 가설의 근거. v2 는 이 가설의 본격 실행.
  - [docs/domain-glossary.md](./domain-glossary.md) — 엔티티/어휘. v2 에서 새 엔티티 도입 시 본 문서 갱신 필요.
  - [docs/pages.md](./pages.md) — 라우트별 책임 표.

---

## 0. 진화의 핵심 한 줄

**v1**: `요청서 작성 → 후보 5명 → 선택 → 배정 → 제안서 도착 → 비교` (linear, 1회성)
**v2**: `비교 도구 진입 → 슬롯에 제안서를 [업로드 | 풀에서 받기] → 비교 → 더 채우거나 결정` (cyclical, 자유 출입)

`PlanProposal` 의 origin 이 1종(설계사 토큰 제출)에서 2종(외부 업로드 / 파트너 풀 제출)으로 확장된다. 비교 화면의 1차 시민이 **partner pill** 에서 **proposal slot** 으로 격상된다.

**중요 — 분석 파이프라인은 origin 별로 분리한다.** 외부 업로드 제안서는 형태 자체가 약식(가입자가 손에 든 PDF — 권유 미팅에서 받은 1~2쪽 요약본일 수도, 정식 진설계서일 수도 있음)이라 v1 의 `eightytwo_judge` 입력 표준과 안 맞는 경우가 잦다. DB row 는 `PlanProposal` 단일 테이블 + `origin` enum 으로 통일하되, **분석기는 두 갈래** (`partner_submit` 용 기존 파이프라인 + `customer_upload` 용 신규 파이프라인) 로 운용한다. 자세한 데이터 모델 영향은 §5.3, §6 참조.

---

## 1. 배경 & 문제

v1 의 강점은 **객관 비교** 의 답을 끝까지 책임진다는 점이다. 그러나 진입 직전의 사용자가 부담하는 비용이 크다:

- "아직 제안 받을 단계가 아닌데" — 설계사한테 이미 받은 제안서가 1장 있는 사용자는 v1 entry 가 과한 commitment 로 느껴진다 (휴대폰 본인인증, 파트너 풀에 노출, K명의 설계사가 연락 가능 상태가 됨).
- "내가 가진 걸 먼저 검증해보고 싶다" — `product-hypothesis.md §1` 의 4겹 불신 레이어를 단계적으로 무너뜨리려면, 사용자가 **들고 온 자료** 부터 객관 비교가 작동해야 한다.

v2 는 entry 비용을 **PDF 1장 = 0 PII** 까지 낮춘다. 매칭은 사용자가 "이걸 시장 평균과 견줘보고 싶다" 고 명시 트리거할 때만 활성화되는 in-tool action 이 된다.

---

## 2. 목표 & 비목표

### 목표 (v2)

- **G0 (브랜드 포지셔닝)**. **"AI 도구로서의 중립성" 인식 구축이 신뢰 자본 축적의 핵심 경로.** 보험은 신뢰가 결정하는 시장. 설계사 직접 추천 형태는 고전적 DB 영업 트라우마를 자극함 ([product-hypothesis.md §1](./product-hypothesis.md) 의 4겹 불신 레이어). v2 의 entry 가 "비교 도구" 로 시작하고 매칭이 도구 안의 한 옵션으로 종속되는 구조 자체가 brand frame 을 "보험 매칭 플랫폼" 에서 "보험 도구 회사" 로 옮기는 장치. v1 의 매칭 우선 entry 가 누적시킨 "또 DB 업 아니야?" 의심을 도구 우선 entry 로 reset 하는 것이 v2 의 가장 큰 목표 — 모든 기능 goal (G1~G5) 은 이 포지셔닝을 코드로 증명하는 수단.

- **G1**. 비로그인 사용자가 외부 제안서 PDF 를 업로드하면 30초 내에 첫 비교 결과(어림 또는 정식)를 본다.
- **G2**. 같은 비교 화면에서 슬롯을 **여러 origin 으로 채울 수 있다** — 업로드 / 파트너 풀 수신 혼합 가능.
- **G3**. 회원 가입 trigger 는 사용자가 가치를 체감한 직후에 온다 (**2번째 업로드** 또는 풀 진입). 비교 도구의 가치 모먼트가 "슬롯 2개 이상" 부터 시작하므로 게이트와 가치 발생 시점이 정렬됨 — 1 슬롯 = 시승, 2 슬롯 시도 = 가입.
- **G3-1**. 어림 분석을 받은 게스트는 "정식 분석 받기" soft CTA 를 통해 가입할 수 있다 (강제 게이트 아님 — 어림 결과는 그대로 노출, 가입은 정확도 갈증을 해소하는 carrot). 이 경로는 G3 와 독립적으로 작동 — 1 슬롯만 보유한 사용자도 어림 → 정식 갈증으로 가입할 수 있음.
- **G4**. 약관이 indexing 안 된 외부 상품도 즉시 **유사 약관 기반 어림 분석** 을 보여준다. 회원 사용자에게는 정식 분석이 준비된 시점에 알림톡 푸시.
- **G5**. 기존 v1 단방향 flow URL 은 유효한 채로 deprecate (마케팅·SEO 보존, 광고 inbound 보호).

### 비목표 (v2 범위 밖)

- **N1**. 인앱 채팅, 마이페이지, 결제, 보험 가입 자체. v1 의 비목표 그대로 유지.
- **N2**. 외부 업로드 제안서에 대한 설계사 측 후속 액션 (가입자가 외부 제안서의 설계사에게 따로 연락하는 것은 우리 시스템 밖).
- **N3**. **`eightytwo_judge` (v1 파이프라인) 의 재사용을 강제하지 않는다** — 외부 업로드 분석기는 약식 PDF (요약본, free-text 메모, 부분 정보) 를 1차 시민으로 받는 신규 파이프라인. 기존 `eightytwo_judge` 는 partner 가 제출하는 정식 진설계서 전용으로 그대로 유지. 두 파이프라인이 산출하는 `PlanProposalAnalysisReport` 는 공통 비교 dimension 위에서 합쳐진다 (§5.3, §6).
- **N4**. 모바일 네이티브 앱. 웹 PWA 범위.
- **N5**. 회원 가입 시 카카오/구글 OAuth 등 sso 옵션 확장. v2 launch 는 휴대폰 OTP 1방식.
- **N6**. v1 의 `/plan-request/new` → candidates → confirm → result 단방향 URL 의 **제거**. v2 에서는 deprecated 표시만 하고 동작 유지. 제거는 v2 안정화 후 별도 RFC.

### Out of explicit decision — 추가 결정 필요 영역

- 풀에서 "5명 한 batch 후 종료" 제약을 PlanRequest 1건이 lifecycle 안에서 영원히 유지할지, 아니면 일정 기간(예: 7일) 경과 후 새 batch 호출 가능하게 할지. v2 launch 는 **영원히 1 batch** 로 시작 (v1 정책 그대로).

---

## 3. 사용자 모델 — Tier 재정의

`product-hypothesis.md §4.2` 의 4-tier 모델을 v2 의 실제 엔티티/제약으로 매핑한다.

| Tier | 사용자 상태 | 식별 | 허용 action | 보관 |
|---|---|---|---|---|
| **0. 익명 게스트** | 비로그인. PII 0. | **쿠키 토큰** (HttpOnly, server-issued nanoid) | 외부 제안서 업로드 **최대 1개** (시승). 비교 화면 열람. | 서버 측 익명 workspace row + S3 PDF. 30일 무활동 시 GC. |
| **1. 회원** | 휴대폰 OTP 본인인증 완료 | `User` (auth.users 매핑 신규 row) | 무제한 업로드. 파트너 풀 진입 가능. 약관 indexing 완료 시 알림톡 수신. | 영구 보관 (v1 의 `resultRetentionDays` 제약은 풀 수신 결과에만 적용, 업로드 제안서에는 미적용). |
| **2. 설계사 (`Partner`)** | v1 그대로 — kakao OAuth + 사전 초청 | v1 그대로 | v1 그대로 (알림톡 토큰 진입 + 제안서 제출). v2 에서 신규 권한 없음. | v1 그대로. |
| **3. 운영자 (`Admin`)** | v1 그대로 + supabase auth + 화이트리스트 | v1 그대로 | v1 그대로 + **약관 indexing 큐 처리** (신규). | — |

### 3.1 v1 → v2 user 모델 변화

- v1 의 가입자는 **계정 없음** 이 원칙이었다 (휴대폰 번호 = 식별자). v2 에서는 가입자가 처음으로 **계정을 가질 수 있는 1차 사용자** 가 된다.
- v1 의 `User` 테이블은 Partner/Admin extension 의 부모로만 존재했음. v2 에서는 extension 없는 plain `User` 가 **가입자(customer)** 가 된다.
- DAL (`src/server/dal.ts`) 에 **`requireCustomerSession()`** 추가 필요. partner/admin extension 이 없는 user 가 customer.

### 3.2 익명 → 회원 승계

쿠키 토큰으로 잡고 있던 익명 workspace 는 회원 가입 트랜잭션 안에서 새 `User.id` 로 owner 교체된다. 토큰은 invalidate. 업로드된 제안서 1개와 그 어림 분석 결과는 그대로 회원의 첫 workspace 로 흡수.

---

## 4. 핵심 사용자 흐름

### 4.1 entry — 비교 도구 첫 도착

```
[랜딩] (/, 신규 default entry)
  "제안서 받으셨나요? 가져와서 비교해보세요."
       ↓
[비교 도구 — 빈 상태] (/compare 또는 /plan-request/result 재명명 검토)
  - 빈 슬롯 carousel
  - CTA 2개:
      [업로드] 가지고 있는 제안서 PDF 업로드
      [풀에서 받기] 우리 파트너로부터 제안서 받기
  - 비로그인 OK. 쿠키 토큰 즉시 발급.
```

### 4.2 외부 업로드 흐름

```
[슬롯 N+1 추가] [업로드] 클릭
       ↓
  게스트가 이미 1개 보유? → [회원 가입 게이트] (4.5)
       ↓
[PDF 업로드 + 메타 입력]
  - PDF (필수, 50MB 한도, v1 과 동일 S3 업로드 흐름 재사용)
  - 보험사 / 상품명 / 보험료 (필수, 어림 매핑 키)
  - 설계사 이름 (선택) — public 정보로 취급, PII 아님. 가입자가 알면 입력.
  - 설계사 메모 (선택, 분석 힌트)
       ↓
[외부 업로드 전용 분석기로 진입]
  - origin=customer_upload → external_analyzer 호출 (eightytwo_judge 아님)
  - external_analyzer 내부 분기:
      약관 indexed? → 정식 분석 (final)
      약관 missing?  → 어림 분석 (provisional, 유사 상품 약관 fallback)
       ↓
[비교 화면에 새 슬롯 표시]
  - 어림 분석 슬롯은 노란 배지 "어림 분석 — 정확도 제한"
  - 회원이면 토스트 "약관 분석이 완료되면 알림톡으로 알려드릴게요"
  - 게스트면 슬롯 카드에 soft CTA "정식 분석 받기 (회원 가입)" 노출
    — 클릭 시 가입 modal (4.5). 강제 게이트 아님, 어림 결과는 그대로 표시.
```

#### 어림 분석 (Provisional Analysis)

- **트리거**: 외부 업로드 PDF 의 (보험사, 상품명) 키가 indexing 안 된 약관일 때.
- **로직**: 같은 **카테고리** (암/실손/종신/CI 등) 의 가장 유사한 indexed 약관 1개를 external_analyzer 에 fallback 으로 주입. external_analyzer 는 약관 indexing 유무와 관계없이 약식 PDF 입력 (free-text 메모, 부분 필드) 를 처리하도록 설계.
- **결과 표시**: 두 파이프라인이 산출하는 `PlanProposalAnalysisReport` 가 동일 비교 dimension 위에서 합쳐진다. 단:
  - 상단에 "어림 분석" 노란 배지 + tooltip ("실제 약관 indexing 대기 중. 결과는 유사 상품 기준 추정치입니다.")
  - 어림 분석 슬롯은 비교 시 **신뢰도 dimming** (60% opacity 등) — 향후 디자인 detail.
  - 외부 업로드 슬롯은 partner_submit 대비 채울 수 없는 dimension 이 있을 수 있음 — 해당 셀은 "정보 없음" 으로 표시 (비교 자체는 가능한 차원에서 그대로 작동).
  - 정식 재분석이 완료되면 자동으로 정식 결과로 swap (회원만).
  - **게스트 → 회원 전환 hook**: 어림 분석 슬롯 카드에 soft CTA "정식 분석 받기 (회원 가입)" 노출. 강제 게이트 아님. 게스트의 정확도 갈증을 가입 trigger 로 전환 — 1 슬롯 시승 단계에서도 가입할 수 있는 경로 (G3-1). 가입 트랜잭션 후 §4.6 의 indexing 큐에 row 추가 → 어드민 SLA 안에 정식 분석 swap + 알림톡.

#### 약관 indexing 큐 (어드민)

- 비회원이 올린 외부 제안서: 어림 분석만 수행. indexing 큐에 **올라가지 않음**.
- 회원이 올린 외부 제안서: 어림 분석 즉시 + **indexing 큐에 row 추가**.
- 어드민이 큐 row 를 picking → 약관 indexing 완료 → 해당 `PlanProposal` 재분석 (analysis report v 갱신) → 회원에게 알림톡 발송 ("약관 분석이 완료됐어요. 비교 결과를 확인해보세요").
- 같은 (보험사, 상품명) 키에 묶인 회원 N명의 제안서는 indexing 1회로 일괄 재분석 + 일괄 알림톡.

### 4.3 파트너 풀 수신 흐름 (5명 batch — 1회성)

```
[슬롯 N+1 추가] [풀에서 받기] 클릭
       ↓
  비회원? → [회원 가입 게이트] (4.5, 무조건 필요)
       ↓
[요청서 작성] (v1 의 5-phase wizard 흡수)
  - 5-phase 그대로 (basic / coverage / budget / medical / notes)
  - v1 의 step1-wizard 그대로 재사용
       ↓
[후보 5명 노출] (v1 의 candidates 화면 그대로)
  - PlanRequestAssignmentCandidate INSERT × 5
  - 가입자가 K명 선택 (K ≤ 5, 현재 정책 그대로)
       ↓
[정보 동의 + SMS OTP] (v1 그대로)
  - 단, 회원 이미 본인인증 완료 → OTP skip (휴대폰 번호 reuse)
       ↓
[알림톡 송부 + 제안서 도착 대기] (v1 그대로)
       ↓
[비교 화면에 도착한 제안서가 슬롯으로 합류]
  - 기존 업로드 슬롯 + 풀 수신 슬롯이 동일 카드 UI 로 비교됨
```

**중요한 v1 → v2 정책 변화**: 한 회원이 **여러 PlanRequest 를 시간 차이 두고** 생성할 수 있다. v1 은 1 token = 1 request 였지만, v2 는 회원의 workspace 가 N 개의 PlanRequest 를 누적 보유. 각 request 의 "5명 1 batch" 제약은 individual request 단위로 그대로 유지된다.

### 4.4 비교 도구 — workbench UX

- 슬롯 카드의 origin badge:
  - 🟦 "직접 업로드" — 게스트/회원이 PDF 로 추가
  - 🟩 "CLAIM 매칭" — 우리 파트너 풀에서 도착
- 슬롯별 액션:
  - **제거** — 비교 대상에서 빼기 (soft delete, DB row 보존)
  - **연락하기** — origin=CLAIM 매칭일 때만 활성 (v1 의 contactRequestedAt 마킹 그대로)
  - **정식 분석 받기 (회원 가입)** — 게스트 + 어림 분석 슬롯에만 노출 (§4.2 의 soft hook, §4.5). 클릭 → 가입 modal. 가입 후 자동 사라짐.
- 빈 슬롯이 0 일 때 빈 카드 carousel 끝에 항상 [+ 추가] 카드 노출.

### 4.5 회원 가입 게이트

비회원이 다음 중 하나를 트리거할 때 가입 modal 띄움:
- **2번째 업로드 시도** (hard gate — 차단) — 첫 슬롯은 시승으로 허용, 두 번째 슬롯 추가 의도가 곧 "비교하고 싶다" 는 명시 시그널이므로 이 시점이 게이트.
- **파트너 풀 진입 시도 ([풀에서 받기] 클릭)** (hard gate — 차단) — 휴대폰 식별이 필수.
- **어림 분석 슬롯에서 "정식 분석 받기" CTA 클릭** (soft hook — 비차단) — 어림 결과 자체는 이미 노출 중. 가입 안 해도 그대로 사용 가능. 가입은 정확도 갈증 해소를 위한 carrot. 게스트의 1 슬롯 시승 단계에서도 발화 가능한 유일한 가입 경로.

가입 modal:
- 휴대폰 번호 입력 + OTP 1회
- 동의 항목 (v1 의 정보제공 동의 흐름 흡수)
- 가입 트랜잭션 안에서 **익명 workspace → 회원 workspace 승계** (3.2)

### 4.6 어드민 흐름 — v2 신규 surface

- 약관 indexing 큐 (`/admin/term-indexing-queue` 신규)
  - 회원이 올린 외부 제안서 중 약관 미indexed (보험사, 상품명) 쌍 list
  - row 클릭 → 약관 PDF/URL 업로드 → indexing 트리거 → 해당 키 묶음 일괄 재분석 + 일괄 알림톡 발송
- 운영 모니터링: 게스트 업로드 누적, 어림 분석 → 정식 분석 전환 시간 (SLA 추적)

---

## 5. 기능 명세

### 5.1 비교 도구 (workbench)

- **라우트**: `/compare` (신규). v1 의 `/plan-request/result/[token]` 은 deprecated alias 로 유지 (token → 회원 workspace 로 redirect 또는 회원 가입 prompt).
- **인증**: 게스트 OK (쿠키 토큰), 회원 OK.
- **데이터 소스**: 현재 사용자 workspace 의 슬롯 목록 (업로드 + 풀 수신 혼합).
- **시각화 재사용**: v1 의 시나리오 chip + ROI log 차트 + 보장 패널 + 질병 검색 모달 그대로. 단 chip-group axis 가 "설계사" 에서 "제안서 슬롯" 으로 일반화.

### 5.2 외부 제안서 업로드

- **DB 표현**: `PlanProposal` 단일 테이블 유지 + `origin` enum (`partner_submit` / `customer_upload`) + `assignmentId` nullable. 별도 테이블 분리하지 않음 — 비교 화면 read 경로에서 슬롯 union 비용이 커지기 때문.
- **분석 파이프라인은 분리**: origin 기준으로 dispatch. `customer_upload` 는 **external_analyzer** (신규 파이프라인) 로 진입. `partner_submit` 은 v1 의 `eightytwo_judge` 그대로.
  - external_analyzer 는 약식 입력 (1~2쪽 요약본, free-text 메모, 부분 필드) 을 1차 시민으로 받음. 정식 진설계서 강제 안 함.
  - 입력 스키마, 출력 스키마, 운용 모듈 모두 별도. v1 파이프라인은 건드리지 않음.
- **약관 missing 판정**: (보험사, 상품명) → 약관 index 조회. miss 시 external_analyzer 가 fallback 약관으로 어림 분석 mode 로 작동 (§5.3).
- **PDF 보관**: 현재 v1 의 S3 업로드 흐름 그대로. 보관 경로만 게스트 워크스페이스용 prefix 분리.
- **수집 메타 PII 정책**: 보험사 / 상품명 / 보험료 / 설계사 이름 / 설계사 메모 모두 **사용자 PII 아님** — 보험사/상품명은 공개 카탈로그, 가격은 시장 정보, 설계사 이름은 가입자에게 명함/문자/메일 등으로 이미 노출된 public 정보. 마스킹·암호화·접근 제한 없이 일반 컬럼으로 저장. 사용자 본인 식별 정보 (이름/휴대폰/주민등록 등) 는 PDF 본문에 있을 수 있으나 그건 분석 파이프라인 내부 정책 (§5.3).

### 5.3 어림 분석 (provisional) & 분석 출력 통합

- **신규 컬럼**: `PlanProposalAnalysisReport` 에 다음 추가:
  - `mode` enum (`provisional` / `final`) — 어림 vs 정식.
  - `analyzerVersion` text — 어느 파이프라인이 산출했는지 (`eightytwo_judge:v5` / `external:v1` 등). schema 진화 추적.
  - `fallbackTermsKey` nullable — 어림 분석 시 fallback 으로 쓴 indexed 약관 키.
- **출력 통합 정책**: 두 분석기가 같은 `PlanProposalAnalysisReport` row schema 로 결과를 떨군다. 단:
  - 양쪽 모두 채울 수 있는 **공통 dimension** (월 보험료, 카테고리, 핵심 보장 금액, 면책/감액 등) 은 두 파이프라인 모두 책임지고 채운다.
  - external_analyzer 가 채우지 못할 수 있는 dimension (ROI log 곡선, 30년 누적 계산 등 정량 dimension) 은 nullable. 비교 UI 는 "정보 없음" 셀로 표시.
  - 공통 dimension 의 정의 = v1 결과 화면이 보장 패널·시나리오 chip 에서 쓰는 카테고리 셋 ([prd-v1.md](./prd-v1.md) §5.6 참조).
- **유사 약관 매핑 정책**: 카테고리 일치 + (있다면) 보장기간/갱신주기 일치를 가산. v2 launch 는 카테고리 일치만 (간단).
- **재분석 트리거**: 어드민이 indexing 완료 시 (보험사, 상품명) 키로 묶인 `PlanProposal` row 들을 batch reanalyze. report `mode` → `final` 로 갱신, `analyzerVersion` 도 함께 갱신.

### 5.4 파트너 풀 수신 — 1 batch 1회성

- **신규 제약**: 1 PlanRequest = 최대 1 batch. v1 candidate algorithm 그대로 + AppSettings.candidateCount=5.
- **회원 1명이 여러 PlanRequest 생성** 은 허용. 각 request 가 독립 1 batch.
- **PII 재사용**: 회원이 이미 본인인증한 휴대폰 번호 reuse → 두 번째 request 부터 OTP skip.

### 5.5 회원 가입

- **휴대폰 OTP 1방식** (v2 launch). features/plan-requests/ 의 OTP 모듈 재사용.
- **`User` 신규 row** (Partner/Admin extension 없음). DAL 의 `requireCustomerSession()` 신규.
- **익명 workspace 승계** — 쿠키 토큰 → User.id 로 ownership 교체 트랜잭션 (5.7).

### 5.6 익명 게스트 세션 — 쿠키 토큰

- **쿠키**: `claim_guest_session`, HttpOnly, SameSite=Lax, 365일.
- **신규 엔티티**: `GuestWorkspace` { id, cookieToken (unique), createdAt, lastSeenAt, claimedByUserId (nullable), gcAfter }.
- **slot ownership**: `PlanProposal.ownerWorkspaceId` (nullable, GuestWorkspace 참조) 또는 `PlanProposal.ownerUserId` (nullable, User 참조) — 정확히 1개 set. claim 트랜잭션 시 swap.
- **GC**: 30일 무활동 → workspace soft-delete + S3 PDF 삭제 (cron). claimed 된 workspace 는 GC 면제.
- **rate-limit**: 1 쿠키 = 1 업로드 hard limit. 쿠키 삭제로 우회 방지 위해 IP+UA fingerprint 보조 카운터 (best-effort, v2 launch 후 abuse 보고 시 강화).

### 5.7 익명 → 회원 승계 트랜잭션

```typescript
// 의사 코드
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ ...customerData });
  await tx.guestWorkspace.update({
    where: { id: workspaceId },
    data: { claimedByUserId: user.id },
  });
  await tx.planProposal.updateMany({
    where: { ownerWorkspaceId: workspaceId },
    data: { ownerUserId: user.id, ownerWorkspaceId: null },
  });
});
// 쿠키 invalidate + 회원 세션 set
```

### 5.8 어드민 — 약관 indexing 큐

- 신규 라우트 `/admin/term-indexing-queue`.
- **신규 엔티티**: `TermIndexingRequest` { id, insurerName, productName, requestedByUserIds[], firstRequestedAt, completedAt (nullable), proposalIds[] (역참조) }.
- **워크플로우**: 회원의 PlanProposal 업로드 시 (insurerName, productName) 으로 upsert → requestedByUserIds 누적. 어드민이 completedAt 마킹 + 약관 indexing → 해당 row 의 proposalIds 전부 reanalyze + 회원들에게 알림톡.

---

## 6. 데이터 모델 영향 요약

| 엔티티 | 변경 |
|---|---|
| `User` | 변경 없음. 단 Partner/Admin extension 없는 plain User = customer 로 운용 시작. |
| `Customer` (신규?) | **선택**: `User` 에 customer-specific 메타가 거의 없다면 별도 테이블 불필요. `User` row 하나로 충분. 향후 마이페이지 추가 시 `Customer` extension 도입 검토. **v2 launch 는 만들지 않음.** |
| `GuestWorkspace` (신규) | 익명 세션 anchor. 쿠키 토큰 unique. |
| `PlanProposal` | `origin` enum 추가 (`partner_submit` / `customer_upload`). `ownerWorkspaceId` / `ownerUserId` nullable FK 1개 set. `assignmentId` nullable 화 (upload origin 일 때 null). **분석 파이프라인은 origin 별로 dispatch** (table 은 단일, runtime 분기). |
| `PlanProposalAnalysisReport` | `mode` enum 추가 (`provisional` / `final`). `analyzerVersion` text 추가 (`eightytwo_judge:vN` / `external:vN`). `fallbackTermsKey` nullable (어림 분석일 때). 외부 업로드에서 채울 수 없는 dimension 컬럼은 nullable 허용 — schema 자체는 두 파이프라인이 공유. |
| `TermIndexingRequest` (신규) | 어드민 큐 + 일괄 재분석 grouping. |
| `PlanRequestAssignment` | 변경 없음. v1 의 contactRequestedAt 흐름 그대로. |
| `PartnerAssignmentStats` | 변경 없음. exposureCount/selectedCount/contactedCount 정의 그대로. |
| `PartnerCreditBalance/Ledger` | **재검토 필요**: v1 의 credit 차감은 `PlanRequest.price / N` 분할 (`features/credits/CLAUDE.md`). 이건 v2 에서도 풀 수신 path 에서 그대로. 외부 업로드 path 는 credit 미발생 (설계사 미관여). 즉 **로직 변화 없음, 단 회계 분리 모니터링만 추가**. |

> 위 변경은 schema 수준 영향만 정리. 실제 migration 은 **manual SQL label PR** 로 진행 (CLAUDE.md 의 prisma 정책).

---

## 7. 도메인 어휘 (glossary 갱신 필요)

`docs/domain-glossary.md` 에 v2 도입 시 다음 항목 추가:

- **§1.1 PlanProposal**: origin 2종 명시 (`partner_submit` / `customer_upload`). 후자는 `assignmentId = null`.
- **§1.5 (신규)**: GuestWorkspace, TermIndexingRequest.
- **§2.6 (신규)**: "workbench" = 비교 도구의 사용자 측 명칭. 코드에서는 `compare` / `workspace` 사용.
- **§2.7 (신규)**: "어림 분석" (provisional) vs "정식 분석" (final) — UI / 코드 양쪽 캐노니컬 어휘.

---

## 8. 마이그레이션 — v1 공존 정책

| v1 자산 | v2 처리 |
|---|---|
| `/plan-request/new` URL | **유지 + deprecated 헤더 노출**. 신규 진입 시 `/compare` 로 이동하는 banner. 광고/SEO inbound 보호. |
| `/plan-request/[id]/candidates` 외 v1 경로 | **유지**. 이미 진행 중인 PlanRequest 의 lifecycle 보호. |
| `/plan-request/result/[token]` | **alias 유지**. 회원/익명 모두 `/compare` 와 같은 화면을 보여줌 (token 으로 슬롯 set 식별). |
| v1 에서 생성된 PlanRequest + PlanProposal | **100% 무중단**. v2 launch 시 ownerUserId / ownerWorkspaceId backfill 필요 (token → User.id 매핑 또는 익명 workspace 신규 생성 후 매핑). |
| AppSettings.resultRetentionDays | **유효 범위 축소**: 풀 수신 PlanProposal 의 token 만료에만 적용. 업로드 PlanProposal 은 만료 없음. |

backfill 스크립트는 별도 manual migration label PR.

---

## 9. 성공 지표

### 9.1 conversion funnel (v2 신규)

**메인 funnel (가입 = 비교 의도 시점)**:
- 랜딩 → 첫 슬롯 채움 (업로드 1) — **목표 35%** (현 v1 의 wizard 1-step → finalize ~12% 대비)
- 첫 슬롯 보유 → 두 번째 슬롯 추가 시도 (= 회원 가입 hard gate 노출) — **목표 50%**
- gate 노출 → 가입 완료 — **목표 60%** (1 슬롯으로 이미 가치 체감, 비교하려는 명시 의도까지 표현한 상태)
- 가입 후 → 두 번째 슬롯 실제 채움 (업로드 OR 풀 수신 finalize) — **목표 80%**

**보조 funnel (어림 분석 → 정식 분석 갈증)**:
- 첫 슬롯 채움 → 어림 분석 결과 (약관 missing 비율 기반) — 자연 발생률 (지표 아님)
- 어림 분석 슬롯 → "정식 분석 받기" CTA 노출 — 100% (조건 충족 시 자동 노출)
- CTA 노출 → 클릭 → **목표 25%** (메인 funnel 의 hard gate 대비 낮음 — 어림 결과로 이미 만족했을 수도)
- 클릭 → 가입 완료 — **목표 70%** (명시적 갈증 표현이라 메인 funnel 게이트의 60% 보다 높을 것)

두 funnel 은 mutually exclusive 아님 — 어림 슬롯을 받은 게스트가 가입 안 하고 2번째 업로드 시도해서 hard gate 로 가입할 수도 있음. 분석 시 게이트 종류 별로 라벨링 (`signup_via=second_upload | pool_entry | provisional_cta`).

### 9.2 quality 지표

- 어림 분석 → 정식 분석 swap 시간 (p50, p90). **목표 p90 ≤ 48시간** (어드민 SLA 의 자기 기준).
- 어림 분석 정확도 — 정식 분석 swap 후의 시나리오 차이 평균 (별도 분석 잡, 비공개).

### 9.3 사용자 가치 시그널 (정성)

- "v1 의 휴대폰 번호 입력 직전 50% 이탈" (product-hypothesis.md §3) 개선 측정 — entry 후 30초 내 이탈률.
- contactedCount / 슬롯 보유 회원 비율 — workbench 가 매칭 funnel 로 잘 흐르는지.

---

## 10. Open questions

여기에 남기는 것은 **post-launch 의 진화 방향에 영향을 주는 전략 결정** 만. 구현/디자인 디테일은 PRD 가 아니라 코드와 함께 결착시킴 (자세한 건 strategic-only 원칙).

| # | 질문 | 누가 답 | 결정 기한 |
|---|---|---|---|
| Q1 | 풀 수신 batch "영원히 1회" 정책의 후속 — 7일/30일 경과 시 재요청 가능 여부 | PM + 데이터 | v2 launch 후 30일 |
| Q2 | 회원 가입 시 카카오 sso 추가 시점 — OTP 만으로 conversion 충분한지 측정 후 결정 | PM | launch 후 60일 |

---

## 11. Phasing

v2 의 전체 surface 가 크므로 phase 로 나눠 launch:

### Phase A — workbench 골격 (회원 only, internal)
- `/compare` 라우트 + 슬롯 UI 일반화 (chip-group → slot-card)
- `PlanProposal.origin` + ownerUserId 컬럼 + 회원 가입(OTP) 흐름
- 회원 1명이 v1 의 PlanRequest 를 trigger 해 슬롯에 합류시키는 흐름만 검증
- **외부 업로드 / 익명 게스트 / 어림 분석 전부 빠짐**
- 목표: v1 회원 등가 라이드 + 슬롯 모델 검증

### Phase B — 외부 업로드 (회원 only) + external_analyzer v1
- 회원이 PDF 업로드 → external_analyzer 의 정식 분석 (약관 indexed 가정)
- external_analyzer 는 이 phase 에서 처음 도입. 약식 입력 (free-text 메모 + 부분 필드 + PDF) 을 받아 `PlanProposalAnalysisReport` 의 공통 dimension 을 채우는 게 목표.
- 어림 분석은 아직 없음 — indexing 안 된 PDF 는 업로드 차단 + 어드민 alert
- 목표: 신규 파이프라인 + 공통 dimension 합집합 검증

### Phase C — 어림 분석 + indexing 큐
- 어림 분석 mode 도입
- `TermIndexingRequest` + 어드민 큐 + 일괄 재분석 + 알림톡
- 목표: 약관 long-tail 흡수

### Phase D — 익명 게스트 (default entry 전환)
- `GuestWorkspace` + 쿠키 토큰 + 1개 한도
- 회원 가입 hard gate (2번째 업로드 / 풀 진입) + soft hook (어림 분석 슬롯의 "정식 분석 받기" CTA) + 익명 → 회원 승계
- 랜딩 default 가 `/compare` 빈 상태로 전환
- 목표: PMF entry 가설 측정 (§9.1 의 메인/보조 funnel 동시 측정)

### Phase E — v1 deprecation 본격화 (선택)
- `/plan-request/new` 진입 시 `/compare` 로 강제 redirect
- 광고/SEO 영향 측정 후 옛 URL 제거 결정

각 phase 의 launch 게이트는 §9 의 지표로 검증.

---

## 12. 부록 — v1 ↔ v2 매핑 cheat sheet

| v1 entity / route | v2 처리 |
|---|---|
| `/plan-request/new` 5-phase wizard | `/compare` 의 "풀에서 받기" action 안으로 그대로 진입 (코드 재사용) |
| `/plan-request/result/[token]` | `/compare` 의 alias. ownerUserId 매핑 후 표시 |
| `PlanRequest` | 변경 없음. 풀 수신 path 에서만 INSERT |
| `PlanRequestAssignmentCandidate / Assignment` | 변경 없음. 풀 path 에서만 |
| `PlanProposal` | origin 추가, ownership 컬럼 추가 |
| `PlanProposalAnalysisReport` | mode 추가 |
| 휴대폰 OTP 본인인증 | 회원 가입 모듈로 격상. PlanRequest finalize 시점이 아니라 회원 가입 시점으로 이동 |
| `PartnerCreditBalance/Ledger` 차감 | 변경 없음. 풀 수신 path 만 차감 발생 |
| `AppSettings.resultRetentionDays` | 풀 수신 path 의 token expiry 에만 적용 |

