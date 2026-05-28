# v2-mock/ — CLAIM Studio (v2) UI mock 영역

`/v2-mock/*` 하위는 [docs/prd-v2.md](../../../docs/prd-v2.md) 의 새 product —
**CLAIM Studio** (외부 업로드 + 비교 워크스페이스 + 회원가입 게이트 + 온보딩) 를
**가짜 in-memory 데이터** 로 시각화하기 위한 격리 라우트. 실 라우트
(`/`, `/plan-request/*`, `/admin/*`) 는 한 줄도 건드리지 않는다.

## 어휘

- **CLAIM Studio** — 사용자 노출 product 이름. 가입자 화면 chrome (`<ClaimStudioMark />`),
  마케팅 / SEO / 도움말 카피 일관. 회사 brand `CLAIM` (`<BrandMark />`) 과 분리 —
  다른 라우트 (admin/partner/marketing) 는 기존 `<BrandMark />` 그대로.
- **"제안서"** — 사용자 노출 어휘. chip "[+ 제안서 추가]", "이 제안서를 비교에서 제거",
  AddSlotSheet 헤더 등 모든 노출 카피.
- **`workbench` / `compare` / `slot`** — 코드/내부 식별자. 라우트 (`/compare`,
  `/v2-mock/compare`) 도 그대로. PRD §0 의 어휘 정책.

## 절대 규칙

- **DB / 서버 / actions / DAL 호출 금지.** 모든 데이터는 `_lib/mock-slots.ts` 같은
  in-memory 상수. queries.ts / actions.ts / requireXxxSession() import 전부 금지.
- **v1 컴포넌트 fork 금지, import 만 OK.** 일관성 우선. `features/plan-proposals/ui/*`,
  `features/plan-proposals/analysis/v5/*` 의 public surface (V5_ENTRY, V5AnalysisViewData,
  PartnerNoteBubble, RoiChart, ProposalMetricsCard 등) 를 그대로 import.
  v1 컴포넌트에 v2 만의 변종이 필요하면 **v2-mock 안에서만** 새 컴포넌트 작성.
- **middleware 영향 없음** — `/v2-mock/*` 은 admin/partner/knock 어디에도 매칭 안 됨.
- **분석/광고 픽셀 미주입** — mock 진입은 funnel 데이터 오염시키지 않음 (자체 layout).

## 디렉토리

```
v2-mock/
├─ CLAUDE.md                       # 이 파일
├─ layout.tsx                      # 480px 모바일 컨테이너 + "MOCK" 배지. (marketing) layout 의 광고 픽셀 제외 버전.
├─ page.tsx                        # mock 인덱스 — 워크스페이스 두 진입점 link (채워진 / 빈)
├─ _lib/
│  └─ mock-slots.ts                # in-memory 슬롯 3개 (업로드 final/풀/업로드 provisional) + createPendingSlot()
├─ _components/                    # v2-mock 공유
│  ├─ claim-studio-mark.tsx        # "CLAIM Studio" wordmark — 모든 v2 페이지 chrome
│  ├─ entry-card.tsx               # empty-workbench + add-slot-sheet 공유 entry 카드
│  └─ signup-modal.tsx             # 카카오 OAuth entry hop. trigger enum (second_upload/pool_entry/provisional_cta) 은 analytics 라벨용
├─ compare/                        # 워크스페이스 — v2 의 1차 시민
│  ├─ page.tsx                     # ?state=empty | ?new=pending | ?gate=... 분기
│  └─ _components/
│     ├─ compare-page-body.tsx     # client wrapper — AddSlotSheet/SignupModal state + pending slot prepend
│     ├─ workbench-header.tsx      # ClaimStudioMark chrome (헤더 한 줄)
│     ├─ workbench-view.tsx        # slot strip + active body (V5 ActiveBody dispatch + PendingBody)
│     ├─ slot-chip.tsx             # origin-aware chip (아바타 색상으로 origin 구분, analyzed=false 면 pulse dot)
│     ├─ add-slot-card.tsx         # chip [+ 제안서 추가]
│     ├─ add-slot-sheet.tsx        # chip [+] 누르면 뜨는 옵션 picker (업로드/받기) + mock authed toggle
│     ├─ slot-action-bar.tsx       # fixed bottom — partner_submit 의 "상담 진행하기" 전용
│     ├─ slot-attribution.tsx      # 본문 끝 출처 카드 (origin 별 분기)
│     ├─ slot-remove-section.tsx   # 본문 가장 끝 destructive 영역 ([🗑 X 제거])
│     ├─ slot-remove-confirm-sheet.tsx # "되돌릴 수 없어요" confirm bottom sheet
│     ├─ provisional-banner.tsx    # 임시 분석 한 줄 배너 + 정식 분석 받기 small CTA + 세부 모달 (portal)
│     ├─ origin-badge.tsx          # 출처 카드 안 origin 라벨 (작은 색상 dot + 텍스트)
│     └─ empty-workbench.tsx       # 빈 워크스페이스 (entry CTA 2개)
├─ onboarding/                     # 카카오 OAuth 후 휴대폰 인증
│  ├─ page.tsx                     # ?from=<trigger> 받아 OnboardingFlow 진입
│  └─ _components/
│     └─ onboarding-flow.tsx       # v1 confirm-wizard 패턴 차용 (휴대폰 + OTP + done)
├─ plan-request/                   # 풀 수신 — v1 step1-wizard / candidates-selector 재사용 (PRD §4.3 / §5.4)
│  ├─ _lib/
│  │  ├─ mock-price-tiers.ts       # PriceTier[] 정적 mock (queries 호출 금지)
│  │  └─ mock-partner-cards.ts     # 후보 5명 PartnerCard[] + MOCK_SELECT_LIMIT + subtitle
│  ├─ new/
│  │  └─ page.tsx                  # v1 Step1Wizard import + mock onSubmit (candidates 로 직진)
│  ├─ candidates/
│  │  └─ page.tsx                  # v1 CandidatesSelector import + mock onSubmit (dispatched 로 직진). PRD §4.3 "candidates 부활"
│  └─ dispatched/
│     └─ page.tsx                  # v1 StatusScreen import — "요청서가 전달됐어요" + 워크스페이스 복귀 CTA
└─ upload/                         # 외부 제안서 업로드 (PDF 또는 사진)
   ├─ page.tsx
   └─ _components/
      ├─ upload-flow.tsx           # form submit → router.push('/v2-mock/compare?new=pending') 한 줄
      └─ upload-form.tsx           # 파일 1장 (PDF/사진 dual picker + 카메라 capture). 메타 입력 0
```

## 진입 흐름

| 진입점 | 흐름 |
|---|---|
| `/v2-mock` (인덱스) | 워크스페이스 두 화면 link |
| **빈 워크스페이스** (`?state=empty`) | EmptyWorkbench → 두 entry CTA → SignupModal (mock 비회원 가정) |
| **채워진 워크스페이스** (default) | chip [+ 제안서 추가] → AddSlotSheet (picker + mock authed toggle) → 회원: navigate, 비회원: SignupModal |
| **임시 분석 슬롯** active | ProvisionalBanner 의 [정식 분석 받기] → SignupModal (provisional_cta) |
| **분석 중 슬롯 진입** (`?new=pending`) | /upload 에서 submit 직후 자동 navigate. 첫 chip "분석 중…" active + PendingBody placeholder |
| **데모 URL shortcut** (`?gate=...`) | picker 우회 — SignupModal 자동 open. 스테이크홀더 데모용 |

가입 흐름: SignupModal [카카오로 시작하기] → `/v2-mock/onboarding?from=<trigger>` navigate
→ OnboardingFlow (휴대폰 + OTP) → done → trigger 별 backHref (pool_entry → wizard, 그 외 → /compare)

업로드 흐름: 채워진 워크스페이스 chip [+] → picker → 회원 → `/v2-mock/upload`
→ UploadForm submit → `/v2-mock/compare?new=pending` → 분석 중 슬롯 prepend

## v1 자산 재사용 매핑

| v2 mock 컴포넌트 | 재사용 v1 자산 |
|---|---|
| workbench-view | `V5_ENTRY.ActiveBody` (분석 본문), `PartnerNoteBubble` |
| slot-chip / slot-attribution | `PartnerAvatar` (풀 슬롯만) |
| onboarding-flow | confirm-wizard 패턴 차용 (휴대폰 dash 포맷, OTP `tracking-[0.4em] text-center`, cooldown, NO_TRACK_CLASS) |
| plan-request/new | `Step1Wizard` + `Step1SubmitOutcome` (v1 의 `onSubmit` prop 일반화 후 그대로 import — PRD §5.4) |
| plan-request/candidates | `CandidatesSelector` + `Step2SubmitOutcome` (v1 의 selector 를 `onSubmit` prop 일반화 후 그대로 import — v1 페이지가 auto-skip 이라 v2 에서 컴포넌트 재가시화 — PRD §4.3 candidates 부활) |
| plan-request/dispatched | `StatusScreen` + `MailIcon` (v1 의 dispatched 화면 그대로 reuse) |
| 전반 | shadcn primitives (`Input` 등), `formatDateTime` (KST), `cn`, lucide-react 아이콘 |

v1 분석 본문 (metrics + ROI + surrender 차트) 은 `V5_ENTRY.ActiveBody` 호출 한 번으로
peers 비교까지 그대로 동작. 외부 업로드 슬롯도 같은 V5 ViewData 모양만 만들어주면 슬롯
union 비교가 자연스럽게 일어남 — v2 PRD §5.3 "공통 dimension 위에서 합쳐진다" 의
시각적 demonstration.

## mock 미구현 (의도된 placeholder)

PRD 정착 (`docs/prd-v2.md`) 과 정렬:

| 미구현 | 위치 | 실 라우트 처리 |
|---|---|---|
| **[상담 진행하기]** alert | `workbench-view.tsx` `handleContact` | v1 의 `ContactChannelSheet` ([src/features/plan-proposals/ui/contact-channel-sheet.tsx](../../../features/plan-proposals/ui/contact-channel-sheet.tsx)) + `requestPlanProposalContact` action 그대로 재사용. v2 surface 변동 없음 — mock 도 그대로 import 가능했지만 격리 우선으로 alert 유지 |
| **랜딩 redirect** (`/` → `/compare?state=empty`) | 없음 (mock 은 `/v2-mock` 인덱스에서 시작) | PRD §4.1 정착 — 별도 hero 페이지 없음. 실 라우트는 `/` 자체가 redirect |
| **분석 swap UI** | 영구 "분석 중…" 상태 | PRD §5.3 정착 — 사용자 화면 UI 변화 없음 (silent swap). 다음 방문 시 슬롯이 정식 mode 로 보일 뿐. mock 에서 시간축 시뮬레이션은 의도적 미포함 |
| **어드민 indexing 큐** | 0 | PRD §4.6 / §5.8 정착 — post-launch phase (Phase E). v2 launch scope 외 |
| **알림톡 swap 알림** | 0 | PRD §4.2 / §5.5 정착 — post-launch phase. 휴대폰 인증은 launch 에 포함 (풀 OTP reuse) |
| **mock authed toggle** | `add-slot-sheet.tsx` (AddSlotSheet) | 실 라우트는 서버가 세션으로 자동 판별이라 toggle 없음. mock 데모용 |
