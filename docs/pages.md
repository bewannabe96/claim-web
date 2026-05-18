# pages — 페이지 카탈로그

> 모든 라우트의 URL / 역할 / 접근 권한 / DB 소스 / PRD 매핑 일람.
> 새 페이지 추가·삭제 시 이 표 갱신.

## 범례

- **상태**
  - ✅ — DB 연동 완료
  - 🟡 — 부분 구현 (mock 혼재 또는 외부 의존 대기)
  - ⚪ — placeholder / 미구현
- **접근**
  - `누구나` — 인증 불필요, 공개
  - `가입자(token)` — 알림톡으로 받은 일회용 토큰
  - `설계사(token)` — 알림톡 진입 토큰 (Auth 도입 전 임시)
  - `설계사` — Supabase Auth (도입 예정)
  - `운영자` — DAL `requireAdminSession()` (Supabase auth + admin_users 화이트리스트)
- **DB 컬럼 R/W**
  - 표 안 약어: `plan_request` → `pr`, `plan_request_medical_history` → `pr_mh`,
    `plan_request_candidate` → `pr_cand`, `match_assignment` → `assign`,
    `proposal` → `prop`, `partner` → `pt`, `app_settings` → `cfg`

---

## (marketing) — 비인증 영역

랜딩 + 가입자 요청 흐름. `(marketing)` route group 으로 묶임.

| URL | 역할 | 접근 | DB | PRD | 상태 |
|---|---|---|---|---|---|
| `/` | 랜딩 — 서비스 소개 + 요청 시작 CTA | 누구나 | — | — | ✅ |
| `/request/new` | 요청서 작성 5-phase wizard (basic / coverage / budget / medical / notes) | 누구나 | **W**: pr + pr_mh + pr_cand (트랜잭션) · **R**: pt (매칭) | §5.1 | ✅ |
| `/request/[id]/candidates` | 매칭된 설계사 후보 카드 + 선택 (최대 selectLimit) | 가입자 | **W**: pr_cand.selected, pr.status=confirming · **R**: pr, pt, cfg | §5.2 | ✅ |
| `/request/[id]/confirm` | 본인 인증 (이름·휴대폰·OTP) + 동의 + 요청 내용 검토 | 가입자 | **W**: pr.{name,phone,consent,status=dispatched,...}, assign(K개 생성) — 트랜잭션 · **R**: pr, cfg | §5.3 | ✅ (OTP는 demo `000000`) |
| `/request/[id]/dispatched` | 송부 완료 안내 + 마감 시간 노출 | 누구나 (id 안다면) | **R**: pr | §5.3 | ✅ |
| `/result/[token]` | 제안서 비교 — 설계사 chip 탭 / 시나리오 chip(top-3 + 검색) + ROI(log) 차트 + 해지 시 월부담 차트 + 보장 패널 | 가입자(token) | **R**: pr, assignment + proposal(+pdfHash) + partner, `eightytwo_judge.proposal_analysis_reports` (raw SQL), app_settings.scenario_priority | §5.6 | ✅ 분석 리포트 v4 연동 완료 (Proposal.pdfHash 매칭) |

---

## partner — 설계사

알림톡 일회용 토큰 진입. Auth 통합 전까지 token 이 인증 역할.

| URL | 역할 | 접근 | DB | PRD | 상태 |
|---|---|---|---|---|---|
| `/partner/login` | 설계사 로그인 폼 | 누구나 | — | — | ⚪ placeholder |
| `/partner/assignments/[token]` | 가입자 요청 컨텍스트 + 제안서 제출 폼 (한줄 요약 + PDF) | 설계사(token) | **W**: prop (insert), assign.status=submitted — 트랜잭션 · **R**: assign, pr (+ pr_mh, pr_cand), pt · **S3**: presigned PUT | §5.4 | ✅ |
| `/partner/assignments/done` | 제출 완료 안내 | 누구나 | — | §5.4 | ✅ |

---

## admin — 운영자

`(dashboard)` route group 안에 묶여 공통 chrome (nav + brand). `/admin/login` 만 그룹 밖.

| URL | 역할 | 접근 | DB | PRD | 상태 |
|---|---|---|---|---|---|
| `/admin/login` | 운영자 로그인 | 누구나 | — | — | ✅ (dev mock 세션) |
| `/admin` | 대시보드 — KPI (진행/완료/재매칭/활성설계사) + 최근 요청 + 마감 임박 + 시스템 설정 요약 | 운영자 | **R**: pr (전체), pt, cfg | §5.8 | ✅ |
| `/admin/requests` | 요청 모니터링 — 전체 요청 목록 + 상태 필터 | 운영자 | **R**: pr | §5.8 | ✅ |
| `/admin/requests/[id]` | 요청 상세 — Step1/3 전체 + assignment 목록 (partner + proposal join) | 운영자 | **R**: pr, assign, prop, pt | §5.8 | ✅ |
| `/admin/partners` | 설계사 풀 목록 | 운영자 | **R**: pt | §5.8 | ✅ |
| `/admin/partners/new` | 신규 설계사 등록 폼 | 운영자 | **W**: pt | §5.8 | ✅ |
| `/admin/partners/[id]` | 설계사 수정 폼 | 운영자 | **R/W**: pt | §5.8 | ✅ |
| `/admin/settings` | 시스템 설정 (candidateCount, selectLimit, submissionDeadlineHours, penaltyWindow) | 운영자 | **R/W**: cfg | §5.8 / §8 | ✅ |

---

## 페이지 간 흐름

### 가입자 흐름

```
  /                           (랜딩에서 CTA 클릭)
  └─► /request/new            (5-phase wizard 제출)
      └─► /request/<id>/candidates   (후보 보고 K명 선택)
          └─► /request/<id>/confirm   (이름·번호·OTP·동의)
              └─► /request/<id>/dispatched   (송부 완료 안내)
                    │
                    │ T 시간 후 / K명 제출 시
                    ▼
                  알림톡 (token 포함)
                    │
                    ▼
                  /result/<token>            (제안서 비교 + 설계사 선택)
                    └─► 마음에 드는 설계사에게 직접 문자 (수동)
```

### 설계사 흐름

```
  알림톡 도착 (요청 송부 시)
    │
    ▼
  /partner/assignments/<token>   (가입자 요청 확인 + 진설계 PDF + 한줄 요약 제출)
    │
    │ submitProposal
    ▼
  /partner/assignments/done      (제출 완료)
```

### 운영자 흐름

```
  /admin/login
    └─► /admin                       (KPI 대시보드)
        ├─► /admin/requests          (요청 모니터링)
        │   └─► /admin/requests/<id> (요청 상세 — assignment / proposal 확인)
        ├─► /admin/partners          (설계사 풀)
        │   ├─► /admin/partners/new
        │   └─► /admin/partners/<id>
        └─► /admin/settings          (시스템 튜닝)
```

---

## 상태 전이 (PlanRequest.status)

```
                ┌──────────┐    submitStep1
                │ (생성전) │ ─────────────► selecting
                └──────────┘                   │
                                               │ submitStep2
                                               ▼
                                          confirming
                                               │
                                               │ finalizeRequest
                                               ▼
                                          dispatched
                                               │
                       ┌───────────────────────┤
                       │                       │
              deadline 초과 + 0명 제출          │ 첫 제안서 제출
                       │                       │ (submitProposal)
                       ▼                       ▼
                  rematching               analyzing  ◄────┐
                       │                       │           │
                       │ 재매칭 후              │ 추가 제출  │
                       │ 새 송부                │           │
                       ▼                       │           │
                  dispatched                   └───────────┘
                  (다시 위로)                   │
                       │                       │
                       │ 재매칭도 실패          │ 모든 assignment 종결
                       ▼                       │ (submitted or expired)
                    failed                     │ + 모든 분석 완료
                                               ▼
                                            completed
                                               │
                                               │ 가입자에게 알림톡 발송
                                               ▼
                                          result 페이지 진입
```

| 상태 | 의미 | 진입 페이지 |
|---|---|---|
| `selecting` | 매칭 후보 노출, 가입자가 K명 선택 진행 중 | `/request/<id>/candidates` |
| `confirming` | OTP 인증 진행 중 | `/request/<id>/confirm` |
| `dispatched` | 설계사들에게 송부됨, 첫 제출 대기 | `/request/<id>/dispatched` |
| `analyzing` | 1건 이상 제출됨 — incremental AI 분석 진행. 추가 제출도 받음 | (가입자 대기) |
| `completed` | 모든 assignment 종결 + 분석 완료, 가입자에게 알림톡 발송됨 | `/result/<token>` |
| `rematching` | deadline 지났고 0명 제출 → 자동 재매칭 트리거 (PRD §5.7) | (운영자 알림) |
| `failed` | 재매칭도 실패 | (운영자 알림) |

**핵심**: analyzing 은 "전원 제출 기다림" 이 아니라 **첫 제출 즉시 시작 + incremental**. 마지막 설계사를 기다리느라 가입자 결과 지연되는 일 없음.

---

## 향후 추가 예정

- `/partner/login` 실 구현 — Supabase Auth (email + password)
- `/admin/login` 실 구현 — 같은 패턴
- 가입자 OTP → Supabase Auth phone provider 전환 시 신규 라우트 (예: `auth/otp/...`) 추가 위치 결정 필요
- 분석 리포트 카테고리별 incidence (발병률) 곡선 도입 — 현재 ROI 차트는 incidence 부재
  로 발병률 area / 우측 y축 / 풀이 2번째 줄 모두 hide. v5 또는 product 상수로 채우면 자동 활성
- 가입자 birthdate/age 컬럼 — adapter 의 `DEFAULT_CUSTOMER_AGE=33` hardcode 제거 트리거
