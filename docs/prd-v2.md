# CLAIM — v2 PRD (CLAIM Studio)

> **비교 화면을 funnel의 종착점에서, 자유롭게 드나드는 작업대로.**
>
> 가입자는 제안서 비교 도구에 먼저 도착한다. 이 도구는 빈 슬롯에 외부 제안서를 직접 업로드하거나, 우리 파트너 풀에서 제안서를 받아 채울 수 있다. 단방향 funnel(요청 → 후보 → 배정 → 결과)이 사라지는 게 아니라, **comparison-first** 진입 모델 안의 한 action 으로 흡수된다.

> **Product 이름: `CLAIM Studio`** — v2 의 새 기능 line. 가입자가 보험 제안서를 직접 가져와서 객관 리포트로 변환하고 다른 제안서와 비교하는 도구.
>
> - **사용자 노출 어휘** (가입자 화면 / 마케팅 카피 / 도움말 / SEO): "CLAIM Studio". 영문 wordmark 톤 유지.
> - **코드/내부 어휘**: `workbench` / `compare` / `slot` 그대로. 라우트 (`/compare`, `/v2-mock/compare`) 도 그대로 — 사용자 노출 이름은 어디까지나 product label, 코드 식별자는 영문 lowercase 일관.
> - **회사명 ("CLAIM")** 과 별개. `CLAIM` 은 회사/플랫폼 brand, `CLAIM Studio` 는 그 안의 v2 product feature.

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

- **G1**. 비로그인 사용자가 외부 제안서 PDF 를 업로드하면 30초 내에 첫 비교 결과(임시 또는 정식)를 본다.
- **G2**. 같은 비교 화면에서 슬롯을 **여러 origin 으로 채울 수 있다** — 업로드 / 파트너 풀 수신 혼합 가능.
- **G3**. 회원 가입 trigger 는 사용자가 가치를 체감한 직후에 온다 (**2번째 업로드** 또는 풀 진입). 비교 도구의 가치 모먼트가 "슬롯 2개 이상" 부터 시작하므로 게이트와 가치 발생 시점이 정렬됨 — 1 슬롯 = 시승, 2 슬롯 시도 = 가입.
- **G3-1**. 임시 분석을 받은 게스트는 "정식 분석 받기" soft CTA 를 통해 가입할 수 있다 (강제 게이트 아님 — 임시 결과는 그대로 노출, 가입은 정확도 갈증을 해소하는 carrot). 이 경로는 G3 와 독립적으로 작동 — 1 슬롯만 보유한 사용자도 임시 → 정식 갈증으로 가입할 수 있음.
- **G4**. 약관이 indexing 안 된 외부 상품도 즉시 **유사 약관 기반 임시 분석** 을 보여준다. 회원 사용자에게는 정식 분석이 준비된 시점에 알림톡 푸시.
- **G5**. 기존 v1 단방향 flow URL 은 유효한 채로 deprecate (마케팅·SEO 보존, 광고 inbound 보호).

### 비목표 (v2 범위 밖)

- **N1**. 인앱 채팅, 마이페이지, 결제, 보험 가입 자체. v1 의 비목표 그대로 유지.
- **N2**. 외부 업로드 제안서에 대한 설계사 측 후속 액션 (가입자가 외부 제안서의 설계사에게 따로 연락하는 것은 우리 시스템 밖).
- **N3**. **`eightytwo_judge` (v1 파이프라인) 의 재사용을 강제하지 않는다** — 외부 업로드 분석기는 약식 PDF (요약본, free-text 메모, 부분 정보) 를 1차 시민으로 받는 신규 파이프라인. 기존 `eightytwo_judge` 는 partner 가 제출하는 정식 진설계서 전용으로 그대로 유지. 두 파이프라인이 산출하는 `PlanProposalAnalysisReport` 는 공통 비교 dimension 위에서 합쳐진다 (§5.3, §6).
- **N4**. 모바일 네이티브 앱. 웹 PWA 범위.
- **N5**. 구글 / 애플 OAuth 추가 채널. v2 launch 는 **카카오 OAuth + 휴대폰 인증** 1방식 — 한국 보험 시장 1순위 채널이라 단일 채널로 충분. 구글/애플은 conversion 측정 후 별도 RFC.
- **N6**. v1 의 `/plan-request/new` → candidates → confirm → result 단방향 URL 의 **제거**. v2 에서는 deprecated 표시만 하고 동작 유지. 제거는 v2 안정화 후 별도 RFC.

### Out of explicit decision — 추가 결정 필요 영역

- 풀에서 "5명 한 batch 후 종료" 제약을 PlanRequest 1건이 lifecycle 안에서 영원히 유지할지, 아니면 일정 기간(예: 7일) 경과 후 새 batch 호출 가능하게 할지. v2 launch 는 **영원히 1 batch** 로 시작 (v1 정책 그대로).

---

## 3. 사용자 모델 — Tier 재정의

`product-hypothesis.md §4.2` 의 4-tier 모델을 v2 의 실제 엔티티/제약으로 매핑한다.

| Tier | 사용자 상태 | 식별 | 허용 action | 보관 |
|---|---|---|---|---|
| **0. 익명 게스트** | 비로그인. PII 0. | **쿠키 토큰** (HttpOnly, server-issued nanoid) | 외부 제안서 업로드 **최대 1개** (시승). 비교 화면 열람. | 서버 측 익명 workspace row + S3 PDF. 30일 무활동 시 GC. |
| **1. 회원** | 카카오 OAuth + 휴대폰 인증 완료 | `User` (auth.users 매핑 신규 row) | 무제한 업로드. 파트너 풀 진입 가능. 약관 indexing 완료 시 알림톡 수신. | 영구 보관 (v1 의 `resultRetentionDays` 제약은 풀 수신 결과에만 적용, 업로드 제안서에는 미적용). |
| **2. 설계사 (`Partner`)** | v1 그대로 — kakao OAuth + 사전 초청 | v1 그대로 | v1 그대로 (알림톡 토큰 진입 + 제안서 제출). v2 에서 신규 권한 없음. | v1 그대로. |
| **3. 운영자 (`Admin`)** | v1 그대로 + supabase auth + 화이트리스트 | v1 그대로 | v1 그대로 + **약관 indexing 큐 처리** (신규). | — |

### 3.1 v1 → v2 user 모델 변화

- v1 의 가입자는 **계정 없음** 이 원칙이었다 (휴대폰 번호 = 식별자). v2 에서는 가입자가 처음으로 **계정을 가질 수 있는 1차 사용자** 가 된다.
- v1 의 `User` 테이블은 Partner/Admin extension 의 부모로만 존재했음. v2 에서는 extension 없는 plain `User` 가 **가입자(customer)** 가 된다.
- DAL (`src/server/dal.ts`) 에 **`requireCustomerSession()`** 추가 필요. partner/admin extension 이 없는 user 가 customer.

### 3.2 익명 → 회원 승계

쿠키 토큰으로 잡고 있던 익명 workspace 는 회원 가입 트랜잭션 안에서 새 `User.id` 로 owner 교체된다. 토큰은 invalidate. 업로드된 제안서 1개와 그 임시 분석 결과는 그대로 회원의 첫 workspace 로 흡수.

---

## 4. 핵심 사용자 흐름

### 4.1 entry — 비교 도구 첫 도착

```
[default entry] (/)
  → /compare?state=empty 로 redirect.
  별도 랜딩 hero 페이지 없음 — 빈 워크스페이스 자체가 v2 의 landing.
  마케팅 카피·SEO·광고 inbound 도 모두 빈 워크스페이스 hero 안으로 흡수.
       ↓
[비교 도구 — 빈 상태] (/compare?state=empty)
  - hero copy ("제안서 받으셨나요? 가져와서 비교해보세요." 류) + entry CTA 2개:
      [PDF 또는 사진 업로드] 외부에서 받은 제안서 객관 리포트로
      [클레임 파트너로부터 받기] 우리 파트너 풀에서 제안서 받기
  - 비로그인 OK. 쿠키 토큰 즉시 발급.
```

> v1 marketing 페이지 (`src/app/(marketing)/page.tsx`) 는 deprecated — v2 launch 시
> redirect 로 교체. v1 의 광고/SEO inbound 도 빈 워크스페이스로 자연 합류 (entry CTA
> 가 곧 hero CTA 역할).

### 4.2 외부 업로드 흐름

```
[슬롯 N+1 추가] [업로드] 클릭
       ↓
  게스트가 이미 1개 보유? → [회원 가입 게이트] (4.5)
       ↓
[파일 업로드]
  - 파일 1개 (필수, 50MB 한도) — **PDF 또는 사진(JPG/PNG/HEIC)**. v1 과 동일 S3 업로드 흐름 재사용.
    가입자가 권유 미팅에서 받은 자료의 형태가 PDF 정식본이 아니라 종이/스크린샷
    1~2장인 경우가 잦음 — 모바일 entry friction 최소화 (사진 직촬 = 가장 짧은 경로).
  - **메타 (보험사 / 상품명 / 보험료 / 설계사 이름) 는 가입자에게 묻지 않는다.**
    external_analyzer 가 파일에서 추출 — v1 partner_submit 과 동일 정책 (파일 1장이 모든 입력).
    가입자 입력 단계가 0 이라 G1 의 "30초 안에 첫 비교 결과" 약속의 절반 가까이가 "파일 선택"
    자체에 쓰임. 분석 후 결과 카드에서 메타 보완/수정은 별도 surface (post-launch).
       ↓
[외부 업로드 전용 분석기로 진입]
  - origin=customer_upload → external_analyzer 호출 (eightytwo_judge 아님)
  - external_analyzer 내부 분기:
      약관 indexed? → 정식 분석 (final)
      약관 missing?  → 임시 분석 (provisional, 유사 상품 약관 fallback)
       ↓
[비교 화면에 새 슬롯 표시]
  - 임시 분석 슬롯은 본문 최상단 ProvisionalBanner 한 줄 + 우측 small "정식 분석 받기" CTA
  - 게스트면 CTA → 가입 modal (4.5). 회원이면 CTA 자체가 안 보임 (이미 indexing 큐 row 등록 상태).
  - 강제 게이트 아님, 임시 결과는 그대로 표시.
```

> **회원의 정식 분석 swap 알림 — post-launch.** 임시 → 정식 swap 이 일어났다는 사실
> 자체를 회원에게 알리는 채널 (알림톡 / 인앱 토스트 등) 은 v2 launch scope 외. launch
> 시점엔 회원이 다음 방문 시 슬롯이 자연스럽게 정식 mode 로 보일 뿐 — UI 상 swap 애니메이션·
> 배지·diff 노출 모두 없음. swap fact 의 능동 전달은 어드민 indexing 큐 (§4.6) 와 함께
> post-launch phase 로 묶임.

#### 임시 분석 (Provisional Analysis)

- **트리거**: external_analyzer 가 파일에서 추출한 (보험사, 상품명) 키가 indexing 안 된 약관일 때 (가입자 폼 입력 아님 — §5.2 의 메타 출처 정책).
- **로직**: 같은 **카테고리** (암/실손/종신/CI 등) 의 가장 유사한 indexed 약관 1개를 external_analyzer 에 fallback 으로 주입. external_analyzer 는 약관 indexing 유무와 관계없이 약식 PDF 입력 (free-text 메모, 부분 필드) 를 처리하도록 설계.
- **결과 표시**: 두 파이프라인이 산출하는 `PlanProposalAnalysisReport` 가 동일 비교 dimension 위에서 합쳐진다. 단:
  - 본문 최상단에 ProvisionalBanner 한 줄 ("임시 분석으로 보고 있어요" + 세부 모달 link) — chip 자체에는 마킹하지 않음.
  - 임시 분석 슬롯은 활성화 시 본문 영역 자체에 약한 신뢰도 dimming (전체 opacity 0.85) — 분석 본문이 추정치임을 시각으로 격하.
  - 외부 업로드 슬롯은 partner_submit 대비 채울 수 없는 dimension 이 있을 수 있음 — 해당 셀은 "정보 없음" 으로 표시 (비교 자체는 가능한 차원에서 그대로 작동).
  - 정식 재분석이 완료되면 자동으로 정식 결과로 swap (회원만). **UI 상 swap 애니메이션·diff 노출 없음** — 다음 방문 시 슬롯이 정식 mode 로 보일 뿐. 능동 swap 알림은 post-launch (어드민 indexing 큐와 함께).
  - **게스트 → 회원 전환 hook**: ProvisionalBanner 우측에 small CTA "정식 분석 받기" 노출. 강제 게이트 아님. 게스트의 정확도 갈증을 가입 trigger 로 전환 — 1 슬롯 시승 단계에서도 가입할 수 있는 경로 (G3-1). 가입 트랜잭션 후 §4.6 의 indexing 큐에 row 추가 → 어드민 SLA 안에 정식 분석 swap.

#### 약관 indexing 큐 (어드민) — post-launch

- v2 launch scope 외. launch 시점에는 외부 업로드 모두 임시 분석으로 시작하고, 정식 분석으로의 swap 은 별도 어드민 surface 없이 수동 운영 (DB 직접 작업 또는 backfill 스크립트) 으로 처리.
- 어드민 surface (§4.6, §5.8) 와 회원 알림 채널 (알림톡) 은 한 묶음으로 post-launch phase 에서 도입:
  - 비회원이 올린 외부 제안서: 임시 분석만 수행. indexing 큐에 올라가지 않음.
  - 회원이 올린 외부 제안서: 임시 분석 즉시 + indexing 큐에 row 추가.
  - 어드민 큐 row picking → 약관 indexing → 키 묶음 일괄 재분석 + 알림톡 일괄 발송.

### 4.3 파트너 풀 수신 흐름 (5명 batch — 1회성)

```
[제안서 추가] picker → [클레임 파트너로부터 받기] 클릭
       ↓
  비회원? → [회원 가입 게이트] (4.5, 무조건 필요)
       ↓
[요청서 작성 wizard] (v1 의 5-phase 흐름 흡수 — coverage / budget / medical / notes)
  - v1 의 step1-wizard 를 `onSubmit` prop 으로 일반화 후 그대로 재사용
  - v1 의 MatchingScreen ("맞춤 설계사를 찾고 있어요" 2.8초 로딩) 은 끔
    (showMatchingScreen=false) — 다음 화면이 candidates 라 "찾는 중" 이 의미상 중복
       ↓
[후보 5명 노출 — 선택 화면]
  - PlanRequestAssignmentCandidate INSERT × 5 (v1 step1 의 후보 산출 그대로)
  - 가입자가 K명 선택 (K ≤ 5, AppSettings.selectLimit 정책 그대로)
  - v1 의 `candidates-selector.tsx` 를 `onSubmit` prop 으로 일반화 후 그대로 재사용
       ↓
[제안서 도착 안내] (v1 의 dispatched StatusScreen 그대로)
  - "선택된 K명이 준비 중, 최대 N시간 안에 도착해요"
  - confirm 단계 (이름 / 주민번호 / 휴대폰 / OTP / 동의) **완전 제거** — 회원
    가입 onboarding (§4.5, §5.5) 에서 모두 수집 완료 상태로 진입한다는 가정
       ↓
사용자가 [홈으로] → 워크스페이스 복귀. 도착 알림은 알림톡 (post-launch).
[비교 화면에 도착한 제안서가 슬롯으로 합류]
  - 기존 업로드 슬롯 + 풀 수신 슬롯이 동일 카드 UI 로 비교됨
```

**중요한 v1 → v2 정책 변화 1 — multi-request**: 한 회원이 **여러 PlanRequest 를 시간 차이 두고** 생성할 수 있다. v1 은 1 token = 1 request 였지만, v2 는 회원의 workspace 가 N 개의 PlanRequest 를 누적 보유. 각 request 의 "5명 1 batch" 제약은 individual request 단위로 그대로 유지된다.

**중요한 v1 → v2 정책 변화 2 — confirm 단계 제거**: v1 의 confirm 단계는 비회원 entry 가정으로 이름/주민번호/휴대폰/OTP/동의를 **요청서 finalize 직전에** 수집했다. v2 는 entry 단계에서 이미 회원 가입 + onboarding 을 통과하므로 모든 식별/동의 데이터가 회원 row 에 있다 — 풀 path 안에서 다시 받지 않는다. 후보 K명 선택이 곧 finalize 이고, 그 다음 화면은 dispatched StatusScreen.

**중요한 v1 → v2 정책 변화 3 — candidates 화면 부활**: v1 은 운영 판단으로 candidates 단계 UI 를 frontend skip 했다 (#125, `pickAssignedPartners` FNV-1a 결정성 자동 배정). v2 는 그 정책을 풀 path 안에서 **되돌린다** — 가입자가 워크스페이스 안에서 도구를 주도적으로 사용하는 중이고, 비교 의사결정의 일환으로 후보 카드를 검토하고 K명을 명시 선택하는 step 이 entry-friction 보다 가치가 큼. 같은 컴포넌트 (`candidates-selector.tsx`) 를 onSubmit prop 일반화 후 그대로 재사용 — v1 페이지 자체는 auto-skip 모드 유지, v2 풀 path 만 selector 직접 렌더.

### 4.4 비교 도구 — workbench UX

- 슬롯 chip 의 origin 구분: **아바타 색상만**으로 (◆/● 같은 prefix 심벌 없음 — 시각 노이즈).
  - `customer_upload` → 보험사 첫 글자 (파랑 아바타) + 보험사명
  - `partner_submit` → 설계사 아바타 (검정 fallback) + 설계사명
  - 자세한 origin 컨텍스트 (출처 카드) 는 활성화 시 본문 끝 attribution 영역에서 다시 노출.
- 슬롯별 액션:
  - **제거** — 비교 대상에서 빼기. 본문 가장 끝 destructive 영역에 배치 + "되돌릴 수 없어요" confirm sheet (실제 DB 도 hard delete — soft delete 의 회복 가치 없음).
  - **상담 진행하기** — `partner_submit` 슬롯일 때만 활성. v1 의 `ContactChannelSheet` ([src/features/plan-proposals/ui/contact-channel-sheet.tsx](../src/features/plan-proposals/ui/contact-channel-sheet.tsx)) 그대로 재사용 — 전화/카톡 채널 picker bottom sheet + `requestPlanProposalContact` action (v1 의 contactRequestedAt 마킹). v2 에서 추가 surface 변경 없음. fixed bottom 액션 바로 노출.
  - **정식 분석 받기** — 게스트 + 임시 분석 슬롯에만 노출 (§4.2 의 soft hook, §4.5). ProvisionalBanner 우측 small CTA. 클릭 → 가입 modal. 가입 후 자동 사라짐.
- chip strip 끝에 항상 [+ 제안서 추가] chip 노출 (빈 워크스페이스 제외 — 빈 상태는 §4.1 hero CTA 가 같은 역할).
- **[+ 제안서 추가] 클릭 흐름** — 두 단계:
  1. **AddSlotSheet (picker)** — 두 옵션 노출: [PDF 또는 사진 업로드] / [클레임 파트너로부터 받기]. 사용자가 슬롯 추가 의도를 명시.
  2. **옵션 선택 후** — 비회원이면 §4.5 가입 게이트 (SignupModal, `second_upload` / `pool_entry` trigger 분기), 회원이면 바로 해당 action 진입 (업로드 페이지 / 요청서 작성 wizard).

### 4.5 회원 가입 게이트

비회원이 다음 중 하나를 트리거할 때 가입 modal 띄움:
- **2번째 업로드 시도** (hard gate — 차단) — 첫 슬롯은 시승으로 허용, 두 번째 슬롯 추가 의도가 곧 "비교하고 싶다" 는 명시 시그널이므로 이 시점이 게이트.
- **파트너 풀 진입 시도 ([클레임 파트너로부터 받기] 클릭)** (hard gate — 차단) — 휴대폰 식별이 필수.
- **임시 분석 슬롯에서 "정식 분석 받기" CTA 클릭** (soft hook — 비차단) — 임시 결과 자체는 이미 노출 중. 가입 안 해도 그대로 사용 가능. 가입은 정확도 갈증 해소를 위한 carrot. 게스트의 1 슬롯 시승 단계에서도 발화 가능한 유일한 가입 경로.

가입 modal — **카카오 OAuth entry 한 hop** 으로 좁힘:
- "왜 가입이 필요한가" 안내는 모달 트리거 전 entry 옆 (빈 워크벤치 CTA 카드 하단 등) 에서 자연스럽게 전달. 모달 안에는 헤더 chrome 없음 — 카카오 버튼 + 닫기 X 만.
- 카카오 OAuth 완료 → **온보딩 페이지로 navigate** (`/onboarding?from=<trigger>`).

온보딩 페이지 (`/onboarding`):
- 휴대폰 번호 입력 + OTP 1회 (알림톡 발송용)
- 동의 항목 (v1 의 정보제공 동의 흐름 흡수)
- 가입 트랜잭션 안에서 **익명 workspace → 회원 workspace 승계** (3.2)
- 완료 후 `from` trigger 별로 돌아갈 곳: `second_upload`/`provisional_cta` → `/compare`, `pool_entry` → 요청서 작성 5-phase wizard.

### 4.6 어드민 흐름 — post-launch

> **v2 launch scope 외.** v2 launch 시점에는 어드민 surface 추가 없이 수동 운영 (DB
> 직접 작업 / backfill 스크립트) 으로 indexing 처리. 가입자 funnel 의 PMF 측정에 어드민
> 효율은 cogs 가 아니라 운영 비용 — launch 후 indexing 요청량이 수동 처리 한계를 넘을
> 때 도입.

도입 시 surface:

- 약관 indexing 큐 (`/admin/term-indexing-queue` 신규)
  - 회원이 올린 외부 제안서 중 약관 미indexed (보험사, 상품명) 쌍 list
  - row 클릭 → 약관 PDF/URL 업로드 → indexing 트리거 → 해당 키 묶음 일괄 재분석 + 일괄 알림톡 발송
- 운영 모니터링: 게스트 업로드 누적, 임시 분석 → 정식 분석 전환 시간 (SLA 추적)

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
  - external_analyzer 는 약식 입력 (1~2쪽 요약본, free-text 메모, 부분 필드, **사진 스캔**) 을 1차 시민으로 받음. 정식 진설계서 강제 안 함.
  - 입력 스키마, 출력 스키마, 운용 모듈 모두 별도. v1 파이프라인은 건드리지 않음.
- **허용 파일 형식**: PDF 또는 사진 (JPG / PNG / HEIC). v1 (`partner_submit`) 은 PDF 만 — 설계사가 정식 진설계서 PDF 출력본을 그대로 제출하므로. v2 의 `customer_upload` 는 사진까지 허용 — 가입자가 종이/스크린샷으로 가지고 있는 경우가 잦고 모바일 entry friction 의 dominant 요소가 "PDF 로 변환" 단계라 그 단계 자체를 없앤다. 사진은 external_analyzer 내부에서 OCR 후 같은 약식 입력 pipeline 으로 합류 — 호출자 (web) 관점에선 파일 1개 = 1 PlanProposal 동일.
- **약관 missing 판정**: (보험사, 상품명) → 약관 index 조회. miss 시 external_analyzer 가 fallback 약관으로 임시 분석 mode 로 작동 (§5.3).
- **파일 보관**: 현재 v1 의 S3 업로드 흐름 그대로 (PDF/사진 동일 경로 정책). 보관 경로만 게스트 워크스페이스용 prefix 분리.
- **메타 출처**: 보험사 / 상품명 / 보험료 / 설계사 이름 모두 **external_analyzer 가 파일에서 추출** — 가입자 폼 입력 없음. v1 의 partner_submit (eightytwo_judge) 와 동일 책임 구조라 신규 능력 요구 없음. 입력 단계 0 이 entry friction 의 dominant 절감.
- **수집 메타 PII 정책**: 위 추출 메타는 모두 **사용자 PII 아님** — 보험사/상품명은 공개 카탈로그, 가격은 시장 정보, 설계사 이름은 가입자에게 명함/문자/메일 등으로 이미 노출된 public 정보. 마스킹·암호화·접근 제한 없이 일반 컬럼으로 저장. 사용자 본인 식별 정보 (이름/휴대폰/주민등록 등) 는 파일 본문 (PDF 또는 사진) 에 있을 수 있으나 그건 분석 파이프라인 내부 정책 (§5.3).

### 5.3 임시 분석 (provisional) & 분석 출력 통합

- **신규 컬럼**: `PlanProposalAnalysisReport` 에 다음 추가:
  - `mode` enum (`provisional` / `final`) — 임시 vs 정식.
  - `analyzerVersion` text — 어느 파이프라인이 산출했는지 (`eightytwo_judge:v5` / `external:v1` 등). schema 진화 추적.
  - `fallbackTermsKey` nullable — 임시 분석 시 fallback 으로 쓴 indexed 약관 키.
- **출력 통합 정책**: 두 분석기가 같은 `PlanProposalAnalysisReport` row schema 로 결과를 떨군다. 단:
  - 양쪽 모두 채울 수 있는 **공통 dimension** (월 보험료, 카테고리, 핵심 보장 금액, 면책/감액 등) 은 두 파이프라인 모두 책임지고 채운다.
  - external_analyzer 가 채우지 못할 수 있는 dimension (ROI log 곡선, 30년 누적 계산 등 정량 dimension) 은 nullable. 비교 UI 는 "정보 없음" 셀로 표시.
  - 공통 dimension 의 정의 = v1 결과 화면이 보장 패널·시나리오 chip 에서 쓰는 카테고리 셋 ([prd-v1.md](./prd-v1.md) §5.6 참조).
- **유사 약관 매핑 정책**: 카테고리 일치 + (있다면) 보장기간/갱신주기 일치를 가산. v2 launch 는 카테고리 일치만 (간단).
- **재분석 트리거**: 어드민이 indexing 완료 시 (보험사, 상품명) 키로 묶인 `PlanProposal` row 들을 batch reanalyze. report `mode` → `final` 로 갱신, `analyzerVersion` 도 함께 갱신. v2 launch 시점엔 수동 운영 (§4.6), 어드민 surface 도입은 post-launch.
- **swap 시 사용자 화면 변화**: 없음. 회원이 다음에 워크스페이스에 진입하면 해당 슬롯에서 ProvisionalBanner 가 자연스럽게 사라지고 본문 dimming 도 해제되어 정식 분석 mode 로 보일 뿐. swap 애니메이션·diff 노출·toast·badge 모두 없음 — 의도된 silent swap. swap fact 자체의 능동 전달 (알림톡 / 인앱 알림) 은 post-launch phase 에서 어드민 surface 와 함께 도입.

### 5.4 파트너 풀 수신 — 1 batch 1회성

- **신규 제약**: 1 PlanRequest = 최대 1 batch. v1 candidate algorithm 그대로 + AppSettings.candidateCount=5.
- **회원 1명이 여러 PlanRequest 생성** 은 허용. 각 request 가 독립 1 batch.
- **PII 재사용**: 회원 row 가 식별 / 동의 / 휴대폰 모두 보유 → wizard finalize 시 회원 데이터 reuse. confirm 단계 제거 (§4.3).
- **wizard 재사용 전략**: v1 의 `step1-wizard.tsx` 와 `candidates-selector.tsx` 를 모두 `onSubmit` prop 으로 일반화 (시그니처는 outcome 패턴 — `{ ok: true; nextHref } | { ok: false; errorMessage }`). v1 페이지는 `submitStep1` / `submitStep2` 을 그대로 어댑팅해 주입 (동작 동일), v2 풀 path 는 회원 컨텍스트의 finalize 책임만 onSubmit 에서 결정. fork 없이 UX 일관성 보장. v1 의 candidates 페이지가 현재 auto-skip 모드 (#125) 라도 selector 자체는 보존된 상태이므로 prop refactor 만으로 v2 가 동일 컴포넌트 직접 렌더 가능.

### 5.5 회원 가입 — onboarding 책임

v1 의 confirm 단계 (이름 / 주민번호 / 휴대폰 / OTP / 동의) 가 통째로 사라지므로, 그 책임은 회원 가입 onboarding 으로 이동한다. onboarding 한 번에 식별 + 본인인증 + 동의를 모두 끝낸 회원만 풀 path 에 진입한다.

**카카오 OAuth + onboarding** — 한국 보험 시장 1순위 채널 단일.

- **카카오 OAuth**: 신원 confirm + 가입 자체 + 이름/이메일 기본 prefetch. v1 partner 가 같은 채널이라 인프라/세션 코드 재사용.
- **onboarding (OAuth 직후 1회)**:
  - **이름** — 카카오 OAuth 응답에서 prefilled, 사용자 수정 가능.
  - **주민번호** — 앞 6자 (YYMMDD) + 뒤 1자 (성별 derive). 정량 견적 (보험료 산출의 성별 가산) 에 필수. features/plan-requests 의 `deriveRrn` 재사용.
  - **휴대폰 인증** — OTP 1회. 풀 path 의 본인인증 reuse + 알림톡 (post-launch) 발송 채널 확보. 카카오 OAuth 의 phone 권한은 사업자 등록 + 별도 동의 필요라 별도 단계로 분리. features/plan-requests 의 OTP 모듈 재사용.
  - **동의** — 정보제공 (제3자 / 설계사 노출 — 풀 path 통한 후보 노출 시 사용) + 결과 알림톡 수신 (post-launch). v1 confirm 의 두 동의 항목 그대로 이동.
- **`User` 신규 row** (Partner/Admin extension 없음). DAL 의 `requireCustomerSession()` 신규. Customer User 는 카카오 supabase identity + 이름 + RRN derive 결과 (birthDate, gender) + 휴대폰 + 동의 컬럼 모두 가짐.
- **익명 workspace 승계** — 쿠키 토큰 → User.id 로 ownership 교체 트랜잭션 (5.7).

> 이렇게 모은 데이터로 회원의 풀 path 진입 시 confirm 단계 없이 곧바로 wizard 마지막
> submit → finalize 가능. v1 의 finalize action 시그니처는 동일, 다만 (이름/phone/rrn/
> consents) 의 출처가 form payload 가 아니라 `requireCustomerSession()` 의 회원 row.

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

### 5.8 어드민 — 약관 indexing 큐 (post-launch)

> **v2 launch scope 외.** launch 시점엔 indexing 처리량이 수동 운영 한계 안에 있어
> 별도 어드민 surface 도입의 ROI 가 낮음. 운영자가 DB 에 직접 (insurerName, productName)
> 키로 swap 트리거. 도입 시점은 운영 부담이 명시적으로 시그널 될 때.

도입 시 spec:

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
| `PlanProposalAnalysisReport` | `mode` enum 추가 (`provisional` / `final`). `analyzerVersion` text 추가 (`eightytwo_judge:vN` / `external:vN`). `fallbackTermsKey` nullable (임시 분석일 때). 외부 업로드에서 채울 수 없는 dimension 컬럼은 nullable 허용 — schema 자체는 두 파이프라인이 공유. |
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
- **§2.6 (신규)**: **CLAIM Studio** = v2 product 이름 (사용자 노출 어휘). 코드/내부 어휘는 `workbench` / `compare` / `slot` 그대로. 라우트 `/compare` 도 코드 식별자라 유지. SEO / 마케팅 / 가입자 화면 / 도움말은 "CLAIM Studio" wordmark.
- **§2.7 (신규)**: "임시 분석" (provisional) vs "정식 분석" (final) — UI / 코드 양쪽 캐노니컬 어휘.

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

**보조 funnel (임시 분석 → 정식 분석 갈증)**:
- 첫 슬롯 채움 → 임시 분석 결과 (약관 missing 비율 기반) — 자연 발생률 (지표 아님)
- 임시 분석 슬롯 → "정식 분석 받기" CTA 노출 — 100% (조건 충족 시 자동 노출)
- CTA 노출 → 클릭 → **목표 25%** (메인 funnel 의 hard gate 대비 낮음 — 임시 결과로 이미 만족했을 수도)
- 클릭 → 가입 완료 — **목표 70%** (명시적 갈증 표현이라 메인 funnel 게이트의 60% 보다 높을 것)

두 funnel 은 mutually exclusive 아님 — 임시 슬롯을 받은 게스트가 가입 안 하고 2번째 업로드 시도해서 hard gate 로 가입할 수도 있음. 분석 시 게이트 종류 별로 라벨링 (`signup_via=second_upload | pool_entry | provisional_cta`).

### 9.2 quality 지표

- 임시 분석 → 정식 분석 swap 시간 (p50, p90). **목표 p90 ≤ 48시간**. v2 launch 시점엔 수동 운영 기준 — 어드민 indexing 큐 도입 (§4.6, §5.8) 후 SLA 자동화.
- 임시 분석 정확도 — 정식 분석 swap 후의 시나리오 차이 평균 (별도 분석 잡, 비공개).

### 9.3 사용자 가치 시그널 (정성)

- "v1 의 휴대폰 번호 입력 직전 50% 이탈" (product-hypothesis.md §3) 개선 측정 — entry 후 30초 내 이탈률.
- contactedCount / 슬롯 보유 회원 비율 — workbench 가 매칭 funnel 로 잘 흐르는지.

---

## 10. Open questions

여기에 남기는 것은 **post-launch 의 진화 방향에 영향을 주는 전략 결정** 만. 구현/디자인 디테일은 PRD 가 아니라 코드와 함께 결착시킴 (자세한 건 strategic-only 원칙).

| # | 질문 | 누가 답 | 결정 기한 |
|---|---|---|---|
| Q1 | 풀 수신 batch "영원히 1회" 정책의 후속 — 7일/30일 경과 시 재요청 가능 여부 | PM + 데이터 | v2 launch 후 30일 |
| Q2 | 구글/애플 OAuth 추가 시점 — 카카오 단일 채널의 conversion 측정 후 결정 (특히 30대 미만 iOS 비중) | PM | launch 후 60일 |

---

## 11. Phasing

v2 의 전체 surface 가 크므로 phase 로 나눠 launch:

### Phase A — workbench 골격 (회원 only, internal)
- `/compare` 라우트 + 슬롯 UI 일반화 (chip-group → slot-card)
- `PlanProposal.origin` + ownerUserId 컬럼 + 회원 가입(OTP) 흐름
- 회원 1명이 v1 의 PlanRequest 를 trigger 해 슬롯에 합류시키는 흐름만 검증
- **외부 업로드 / 익명 게스트 / 임시 분석 전부 빠짐**
- 목표: v1 회원 등가 라이드 + 슬롯 모델 검증

### Phase B — 외부 업로드 (회원 only) + external_analyzer v1
- 회원이 PDF/사진 업로드 → external_analyzer 의 정식 분석 (약관 indexed 가정)
- external_analyzer 는 이 phase 에서 처음 도입. 약식 입력 (free-text 메모 + 부분 필드 + PDF/사진 OCR) 을 받아 `PlanProposalAnalysisReport` 의 공통 dimension 을 채우는 게 목표.
- 임시 분석은 아직 없음 — indexing 안 된 PDF 는 업로드 차단 + 운영자 수동 처리
- 목표: 신규 파이프라인 + 공통 dimension 합집합 검증

### Phase C — 임시 분석 (수동 swap 운영)
- 임시 분석 mode 도입 (`PlanProposalAnalysisReport.mode`)
- **어드민 surface 없음** — swap 은 운영자가 DB 직접 작업 / backfill 스크립트로 수행
- **회원 알림톡 없음** — swap fact 의 능동 전달 없음 (silent swap)
- 목표: 약관 long-tail 의 entry 차단 해제 + indexing 요청량 측정 (Phase E 도입 트리거 데이터)

### Phase D — 익명 게스트 (default entry 전환) — **v2 launch**
- `GuestWorkspace` + 쿠키 토큰 + 1개 한도
- 회원 가입 hard gate (2번째 업로드 / 풀 진입) + soft hook (임시 분석 슬롯의 "정식 분석 받기" CTA) + 익명 → 회원 승계
- `/` → `/compare?state=empty` redirect 로 default entry 전환 (별도 hero 페이지 없음)
- 목표: PMF entry 가설 측정 (§9.1 의 메인/보조 funnel 동시 측정)
- **여기까지가 v2 launch.** 이후 phase 는 launch 후 측정 데이터에 기반해 도입 시점 결정.

### Phase E — 어드민 indexing 큐 + 알림톡 (post-launch)
- `TermIndexingRequest` + 어드민 큐 라우트 + 일괄 재분석 자동화
- 회원에게 정식 분석 swap 알림톡 발송
- 도입 트리거: Phase C/D 의 indexing 요청량 / 운영 처리 시간 (§9.2 의 SLA 자기 기준 위반) 이 수동 운영 한계 초과 시
- 목표: indexing long-tail 의 운영 비용 절감 + 회원 retention hook

### Phase F — v1 deprecation 본격화 (선택)
- v1 의 `/plan-request/new` 등 옛 URL 의 광고/SEO 영향 측정 후 제거 결정
- launch 후 60일 + Phase E 안정화 후 별도 RFC

각 phase 의 launch 게이트는 §9 의 지표로 검증.

---

## 12. 부록 — v1 ↔ v2 매핑 cheat sheet

| v1 entity / route | v2 처리 |
|---|---|
| `/` marketing 페이지 | deprecated. `/compare?state=empty` 로 redirect (별도 hero 페이지 없음) |
| `/plan-request/new` 5-phase wizard | `/compare` 의 "클레임 파트너로부터 받기" action 안으로 그대로 진입 (코드 재사용) |
| `/plan-request/result/[token]` | `/compare` 의 alias. ownerUserId 매핑 후 표시 |
| v1 결과 화면의 `ContactChannelSheet` ([src/features/plan-proposals/ui/contact-channel-sheet.tsx](../src/features/plan-proposals/ui/contact-channel-sheet.tsx)) | 그대로 재사용. workbench 의 `partner_submit` 슬롯에서만 활성. `requestPlanProposalContact` action 도 그대로 |
| `PlanRequest` | 변경 없음. 풀 수신 path 에서만 INSERT |
| `PlanRequestAssignmentCandidate / Assignment` | 변경 없음. 풀 path 에서만 |
| `PlanProposal` | origin 추가, ownership 컬럼 추가 |
| `PlanProposalAnalysisReport` | mode 추가 |
| 휴대폰 OTP 본인인증 | 회원 가입 onboarding 으로 이동 (§5.5). 풀 path 안에서 다시 받지 않음. v2 launch 의 1차 용도는 풀 path 본인인증 reuse (알림톡은 post-launch) |
| confirm 단계 (이름 / 주민번호 / 휴대폰 / OTP / 동의) | 풀 path 에서 제거. 모든 항목 회원 가입 onboarding 으로 이동 (§5.5). v1 의 `confirm-wizard.tsx` / `finalizeRequest` 의 FormData 의존을 회원 row 의존으로 시그니처 변환 |
| step1-wizard 의 `submitStep1` hardcoded 호출 | `onSubmit` prop 으로 일반화. v1 페이지는 그대로 주입, v2 풀 path 는 회원 컨텍스트의 finalize 액션 주입. wizard UI fork 없음 |
| candidates-selector 의 `submitStep2` hardcoded 호출 + `requestId` prop | `onSubmit` prop 으로 일반화 (시그니처: `(partnerIds: string[]) => Promise<Step2SubmitOutcome>`). v1 페이지는 auto-skip 모드 그대로 (selector 미사용), v2 풀 path 는 selector 를 직접 렌더 + mock/회원 액션 주입. v2 PRD §4.3 의 candidates 단계 부활을 위한 비파괴 refactor |
| `PartnerCreditBalance/Ledger` 차감 | 변경 없음. 풀 수신 path 만 차감 발생 |
| `AppSettings.resultRetentionDays` | 풀 수신 path 의 token expiry 에만 적용 |

