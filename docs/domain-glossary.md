# 도메인 사전 (Domain Glossary)

이 문서는 프로젝트의 **도메인 엔티티 이름 / 어휘 / 명명 컨벤션** 의 단일 진실 공급원이다. 새 코드 / 문서 / 알림 문구를 작성할 때 여기 정의된 이름과 어휘를 따른다.

---

## 1. 핵심 엔티티 사전

### 1.1 가입자 측 — "설계 요청" 가족

가입자가 보험 설계를 요청 → 설계사에게 배정 → 제안서 수신 → 결과 비교 의 전 흐름.

#### `PlanRequest` (설계 요청)
- **정의**: 가입자가 만든 보험 설계 요청서 본체. 5-phase wizard (basic / coverage / budget / medical / notes) 의 종착점.
- **DB**: `plan_request`
- **수명**: 한 번 INSERT 후 status 만 전이 (`draft → selecting → confirming → dispatched → analyzing → completed`).
- **위치**: features/plan-requests/
- **소유 라우트** (가입자): `/plan-request/*`
- **`price` 컬럼**: Step1 생성 시점에 `PlanRequestPriceTier` 에서 매칭한 가격을 snapshot. 이후 admin 이 tier 가격을 바꿔도 진행 중 요청에는 영향 없음. 결과 페이지 "문자 보내기" 시 이 가격으로 partner 크레딧 차감.

#### `PlanRequestPriceTier` (요청서 가격 tier)
- **정의**: 가입자 budget 범위 → 요청서당 차감 가격 매핑. 6 row 고정 (step1-wizard 의 `BUDGET_OPTIONS` 와 lock-step).
- **DB**: `plan_request_price_tier`
- **수명**: seeder 가 6 row 백필 (멱등 upsert by position). admin 페이지에서 `price` 만 mutable, `position` / `budgetMin` / `budgetMax` 는 immutable.
- **위치**: features/plan-request-pricing/
- **Snapshot 정책**: PlanRequest 생성 시점에 `PlanRequest.price` 로 고정. tier 자체는 admin 운영용 lookup 테이블.

#### `PlanRequestAssignmentCandidate` (배정 후보)
- **정의**: 알고리즘이 산출한 `(PlanRequest × Partner)` 후보 슬롯. N명 산출 후 가입자가 K명 선택. selected=true 인 row 가 실제 배정 대상.
- **DB**: `plan_request_assignment_candidate`
- **수명**: PlanRequest 작성 트랜잭션 안에서 N개 동시 INSERT. 가입자 선택 시 selected 토글.
- **위치**: features/plan-requests/

#### `PlanRequestAssignment` (배정)
- **정의**: 가입자가 선택한 K명 설계사 각각에 대해 1 row. 알림톡 일회용 토큰 보유 — 설계사가 토큰으로 진입해 제안서 제출. status: `pending → submitted/expired`.
- **DB**: `plan_request_assignment`
- **수명**: PlanRequest finalize 트랜잭션 안에서 K개 동시 INSERT.
- **위치**: 생성은 features/plan-requests/, 토큰 조회 + 제출은 features/plan-proposals/
- **소유 라우트** (설계사): `/partner/plan-request-assignments/*`

#### `PlanProposal` (제안서)
- **정의**: 설계사가 `PlanRequestAssignment` 에 제출한 진설계 PDF + 100자 한줄 요약. assignment 와 1:1.
- **DB**: `plan_proposal`
- **수명**: 설계사 토큰 진입 → PDF 업로드 → submit 시 INSERT (1회). assignment.status='submitted' 와 같은 트랜잭션.
- **위치**: features/plan-proposals/

#### `PlanProposalAnalysisReport` (제안서 분석 리포트)
- **정의**: AI 분석 파이프라인 (`eightytwo_judge`) 이 `PlanProposal` PDF 를 분석한 결과. proposal 과 1:1.
- **DB**: `plan_proposal_analysis_report`
- **schemaVersion v5** — 진화 시 row 교체 + `analysis-schema.ts` 의 `CURRENT_REPORT_VERSION` 갱신.
- **위치**: features/plan-proposals/

---

### 1.2 사용자 모델 — User + role extension

#### `User`
- **정의**: 모든 인증 사용자 공통. Supabase `auth.users` 와 매핑 (`authId`). 도메인 nanoid PK.
- **DB**: `user`
- **역할 구분**: `Partner` / `Admin` extension row 의 존재 (+ active) 가 권한 결정.

#### `Partner` (설계사)
- **정의**: User 와 1:1 (PK 공유). 매칭 대상 풀.
- **DB**: `partner`
- **위치**: features/partners/

#### `Admin` (운영자)
- **정의**: User 와 1:1 (PK 공유). 어드민 페이지 접근 권한.
- **DB**: `admin`
- **위치**: features/admin/

#### `PartnerSignupInvitation` (설계사 가입 초청)
- **정의**: 어드민이 발급한 일회용 가입 토큰. 카카오 OAuth + 휴대폰 OTP 본인인증 두 단계 통과 시 소비되어 user + partner row 가 동시 INSERT 됨.
- **DB**: `partner_signup_invitation`
- **수명**: 발급 → 토큰 URL 전달 → 가입 트랜잭션 시 `consumedAt` 마킹 (audit 보존).
- **위치**: features/partners/
- **Signup prefix 의 의미**: 향후 다른 종류 초청 (그룹 초청, 추천 초청 등) 추가 시 충돌 회피.

#### `PartnerAssignmentStats` (설계사 배정 통계)
- **정의**: Partner 와 1:1. 배정 funnel 카운터 (`exposureCount` / `selectedCount` / `contactedCount`). 정렬 키 + 운영 지표.
- **DB**: `partner_assignment_stats`
- **위치**: features/partners/
- **카운터 정의** (퍼널 단계 순):
  - `exposureCount`: `PlanRequestAssignmentCandidate` INSERT (= 후보 카드 등장)
  - `selectedCount`: `PlanRequestAssignment` INSERT (= 알림톡 발송 대상으로 배정)
  - `contactedCount`: 결과 페이지에서 가입자가 "문자 보내기" 액션

---

### 1.3 크레딧

#### `PartnerCreditBalance`
- **정의**: 설계사 크레딧 잔액. Partner 와 1:1.
- **DB**: `partner_credit_balance`
- **위치**: features/credits/
- **`balance` / `debt` 양변 회계**: 둘 다 항상 ≥ 0. spend 시 잔액 부족분이 `debt` 로 누적, topup 시 `debt` 우선 충당 후 남는 게 `balance` 로. 음수 표현 회피 + 자산/부채 의미적 분리.

#### `PartnerCreditLedger`
- **정의**: 크레딧 거래 원장. type: `topup / spend / adjustment / refund`. 각 row 에 `balanceAfter` + `debtAfter` 스냅샷 보유.
- **DB**: `partner_credit_ledger`
- **위치**: features/credits/

---

### 1.4 시스템 / 운영

#### `AppSettings`
- **정의**: 시스템 설정 (candidateCount, selectLimit, submissionDeadlineHours, scenarioPriority 등).
- **DB**: `app_settings`
- **위치**: features/admin/

#### `PlanRequestMedicalHistory`
- **정의**: PlanRequest 와 1:N. 가입자가 입력한 병력 entries.
- **DB**: `plan_request_medical_history`
- **위치**: features/plan-requests/

---

## 2. 어휘 정책

### 2.1 "매칭" — 코드 안에선 사용 금지

**원칙**: "매칭" 단어는 **user-facing 채널 (알림톡 본문 / UI 라벨 / 마케팅 문구) 에서만** 사용한다. 코드 / 주석 / 내부 문서에서는 추방.

**이유**: 실제 흐름이 3단계 (**후보 산출 → 가입자 선택 → 배정**) 인데 "매칭" 은 이 셋 중 어느 하나도 정확히 가리키지 않는다. 가입자가 능동적으로 선택하기 때문에 "매칭" 만으로는 phase 가 모호.

**대체 어휘** (코드/내부 문서):

| 의미 | 코드 어휘 | 엔티티 |
|---|---|---|
| 알고리즘이 후보 N명 산출 | **"후보 산출"** | `PlanRequestAssignmentCandidate` INSERT |
| 가입자가 K명 고름 | **"선택"** | `selected = true` 토글 |
| 선택된 설계사에게 배정 | **"배정"** | `PlanRequestAssignment` INSERT |

**예외 — user-facing 채널은 OK**:
- 알림톡 본문: "새 매칭이 있어요" ✅
- 마케팅 페이지: "1분 만에 매칭" ✅
- UI 라벨 (가입자 화면): "매칭된 설계사 후보" ✅

코드 / 주석 / 내부 문서의 "매칭" 표기는 모두 위 3대체어 로 치환.

### 2.2 "요청" — 항상 PlanRequest 본체만 지칭

**원칙**: "요청" 이라는 단어는 **`PlanRequest` (가입자가 만든 폼)** 만 가리킨다. 다른 엔티티에 같은 단어를 쓰지 않는다.

**금지 표현**: ❌ "제안서 요청" (= `PlanRequestAssignment` INSERT 의미로 쓰던 표현)
→ ✅ "배정" 으로 통일.

**설계사 POV 의 "받은 요청"** = `PlanRequestAssignment`. 코드/문서에서는 "배정" 으로 부른다. user-facing 메시지 ("새 요청이 도착했어요") 는 예외 OK.

### 2.3 "차감 / 부채" — 크레딧 어휘

| 코드 / 내부 문서 | user-facing | DB / 모델 |
|---|---|---|
| **"차감"** (spend) | "사용" / "결제" | `PartnerCreditLedger.type = 'spend'` |
| **"부채"** | "누적 부채" / "다음 충전 시 우선 차감" | `PartnerCreditBalance.debt` |
| **"충전"** (topup) | "충전" | `type = 'topup'` |
| **"환불"** (refund) | "환불" | `type = 'refund'`, `referenceId = paymentId` |
| **"조정"** (adjustment) | (운영 내부) | `type = 'adjustment'` |

**원칙**:
- "음수 잔액" 표현은 금지 — 실제 데이터 모델은 `balance(≥0) + debt(≥0)` 양변. 코드/문서에서 "음수 잔액", "잔액 부족" 같은 표현 대신 "부채 누적" 사용.
- "spend 실패" 표현은 금지 — `applyLedger` 의 분배 알고리즘 도입 후 잔액 부족으로 인한 실패는 없음. 호출자는 conflict / invalid_input 만 분기 처리.

### 2.4 "Plan" prefix 의 의미

`Plan` prefix 가 붙은 엔티티는 모두 **"설계 요청 (PlanRequest) 라이프사이클의 일부"** 임을 뜻한다:
- `PlanRequest` — 본체
- `PlanRequestAssignmentCandidate` — 그 본체에 대한 후보
- `PlanRequestAssignment` — 그 본체의 배정 결과
- `PlanProposal` — 그 배정에 대한 제안서
- `PlanProposalAnalysisReport` — 그 제안서의 분석

`Plan` prefix 가 없는 도메인 (`Partner`, `Admin`, `User`, `AppSettings`, 크레딧) 은 설계 요청 라이프사이클과 직교적인 엔티티.

---

## 3. 명명 컨벤션

### 3.1 Prisma 모델 / DB 테이블

- **PascalCase 모델 → snake_case 테이블** (Prisma `@@map`).
- **Plan prefix**: ambiguous 한 일반어 (`Request`, `Proposal`) 에만 부여. 도메인-specific 단어 (`Partner`, `Admin`) 에는 부여 안 함.
- **계층 표현**: 부모-자식 관계는 모델 이름에 부모 prefix 박아 표현 — 예: `PlanRequestAssignmentCandidate` 는 "PlanRequest 의 Assignment 의 Candidate".

### 3.2 FK 필드명 — 짧은 form 유지

```ts
// ✅ 권장
requestId: string;        // FK to plan_request.id
partnerId: string;        // FK to partner.id
assignmentId: string;     // FK to plan_request_assignment.id
proposalId: string;       // FK to plan_proposal.id

// ❌ 금지 — 모델명을 그대로 박지 말 것
planRequestAssignmentId: string;
planProposalId: string;
```

이유: FK 필드는 코드 안에서 자주 접근됨. 짧을수록 가독성 향상. 모델명 1:1 강제는 verbosity 만 늘림.

### 3.3 Relation field 이름 — 의미 우선

Prisma relation field 는 모델명과 1:1 강제하지 않는다. 의미적으로 자연스러운 짧은 이름 사용:

```prisma
model Partner {
  assignments       PlanRequestAssignment[]            // ✅ "이 partner 의 배정들"
  candidates        PlanRequestAssignmentCandidate[]   // ✅ "이 partner 가 후보로 든 row 들"
  assignmentStats   PartnerAssignmentStats?            // ✅ 모델명 따라감 (의미 일치)
  signupInvitation  PartnerSignupInvitation?           // ✅ 모델명 따라감
}
```

### 3.4 features/ 폴더 이름

- Plan 라이프사이클 산하 폴더는 **`plan-` prefix**:
  - `features/plan-requests/` — PlanRequest, PlanRequestMedicalHistory, PlanRequestAssignmentCandidate, PlanRequestAssignment (생성)
  - `features/plan-proposals/` — PlanProposal, PlanProposalAnalysisReport, PlanRequestAssignment (토큰 조회 + 제출)
  - `features/plan-request-pricing/` — PlanRequestPriceTier (budget → 가격 lookup, admin 운영용)
- 직교 도메인은 단일어:
  - `features/partners/` — Partner, PartnerSignupInvitation, PartnerAssignmentStats
  - `features/credits/` — PartnerCreditBalance, PartnerCreditLedger
  - `features/admin/` — Admin, AppSettings

### 3.5 라우트 경로 — 도메인 + dash-case

- 가입자 영역 (마케팅): **`/plan-request/*`**
- 설계사 영역: **`/partner/plan-request-assignments/*`** (도메인 + 객체)
- 어드민 영역: **`/admin/*`** (route group 으로 묶임)

복합어는 dash-case (`plan-request-assignments`). 단일어는 단일어 (`partner`, `admin`).

---

## 4. 라우트 ↔ 엔티티 매핑

| 라우트 | 주 엔티티 | 역할 |
|---|---|---|
| `/plan-request/new` | PlanRequest | 5-phase wizard |
| `/plan-request/[id]/candidates` | PlanRequestAssignmentCandidate | 후보 노출 + 선택 |
| `/plan-request/[id]/confirm` | PlanRequest | 본인 인증 + 동의 |
| `/plan-request/[id]/dispatched` | PlanRequest | 송부 완료 |
| `/plan-request/result/[token]` | PlanProposal × N | 제안서 비교 |
| `/partner/plan-request-assignments/[token]` | PlanRequestAssignment | 토큰 진입 + 제안서 제출 |
| `/partner/plan-request-assignments/done` | — | 제출 완료 안내 |
| `/partner/signup/[token]` | PartnerSignupInvitation | 가입 흐름 Step 1 |
| `/partner/signup/[token]/verify` | PartnerSignupInvitation | 가입 흐름 Step 2 |
| `/admin/requests/[id]` | PlanRequest | 운영자 요청 상세 (어드민 라우트는 별 도메인) |

### 4.1 라우트 명명 결정 근거

- **왜 `/plan-request/result/`** (이중 segment) 인가? — `result` 가 단독 라우트가 아니라 PlanRequest 의 한 view 라는 의미를 URL 에 박기 위함. 가입자가 token 으로 진입하는 결과 페이지지만, 도메인은 PlanRequest.
- **왜 `/partner/plan-request-assignments/`** (긴 경로) 인가? — 설계사 입장에서 진입하는 것이 "PlanRequestAssignment 라는 객체" 임을 URL 만 보고 식별 가능. URL UX 가 prefix 의 본 목적.

---

## 5. features/ 폴더 책임 분배

```
src/features/
├─ admin/              # Admin, AppSettings
│
├─ credits/            # PartnerCreditBalance, PartnerCreditLedger
│
├─ partners/           # Partner, PartnerSignupInvitation, PartnerAssignmentStats
│                      # (Partner 도메인의 가입/조회/통계)
│
├─ plan-requests/      # PlanRequest, PlanRequestMedicalHistory,
│                      # PlanRequestAssignmentCandidate,
│                      # PlanRequestAssignment (생성 — finalize 트랜잭션)
│                      # OTP (본인인증 — PlanRequest 흐름의 일부)
│
├─ plan-request-pricing/ # PlanRequestPriceTier (budget → 가격 lookup)
│                        # admin 페이지 (/admin/settings) 에서 편집
│
└─ plan-proposals/     # PlanProposal, PlanProposalAnalysisReport
                       # PlanRequestAssignment (token 조회 + 제출 — 설계사 진입점)
```

**`PlanRequestAssignment` 가 두 폴더에 걸친 이유**:
- **생성** 은 PlanRequest finalize 트랜잭션의 일부 → `plan-requests/`
- **토큰 조회 + 제출** 은 PlanProposal 흐름의 일부 → `plan-proposals/`

이 분리는 트랜잭션 경계와 동시에 책임 경계를 반영함. 한 features 폴더로 합치면 PlanRequest finalize 코드와 token-based proposal 제출 코드가 한 모듈에 섞여 응집도 깨짐.

---

## 6. 부록 — 캐노니컬 정착 이력

| 단계 | PR | 내용 |
|---|---|---|
| 1 | [#44](https://github.com/bewannabe96/claim-web/pull/44) | 본 문서 작성 + 주요 CLAUDE.md / architecture.md 에 참조 링크 추가 |
| 2 | [#45](https://github.com/bewannabe96/claim-web/pull/45) | Prisma 모델 6개 rename + features 폴더 rename + 라우트 7개 rename (모든 코드/문서 일괄 정렬). manual migration SQL 은 별도 작업. |

PR 머지가 끝나면 본 문서의 "(현재 …)" 주석을 제거하고 캐노니컬 이름만 남긴다.
