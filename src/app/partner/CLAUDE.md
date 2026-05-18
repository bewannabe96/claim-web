# partner/ — 설계사 영역

가입자 페이지와 같은 모바일 셸 (`max-w-[480px]`) 안에서 동작. 세 가지 진입 흐름이 공존:

1. **알림톡 일회용 토큰** — PRD §5.4. `/partner/assignments/[token]` 으로 직접 진입. **로그인 불필요** — 토큰 자체가 인증.
2. **카카오톡 로그인** — `/partner/login` → Kakao OAuth → `/partner` 대시보드. 본인 받은 요청 / 진행 현황 확인용.
3. **가입 초청** — `/partner/signup/[token]` 으로 진입 → Kakao OAuth (콜백이 invitation 에 Kakao 계정 lock) → `/partner/signup/[token]/verify` 본인인증 → 통과 시 단일 트랜잭션으로 user + partner INSERT + invitation 소비. 어드민이 발급한 일회용 invitation token 보유 시 1회 사용.

## 보안 모델 (3 레이어)

```
요청 → [① 루트 middleware.ts] → [② (dashboard)/layout.tsx requirePartnerSession] → 페이지
                ↓                            ↓
        Supabase 세션 optimistic 검사   claim.partner row 존재 + active
        (login / 토큰 / signup carve-out)   (claim.user.authId = auth.users.id)
```

### ① 루트 `middleware.ts` (인증 boundary 아님)

- **Optimistic 비인증 차단**: `/partner/*` 에서 Supabase 세션 cookie 없으면 즉시 307 → /partner/login.
  PPR 모드의 1초 meta refresh fallback 회피 목적 (자세한 건 docs/architecture.md §7.2).
- **Carve-out**: `/partner/login`, `/partner/assignments/*` (알림톡 토큰), `/partner/signup/*` (가입 초청 token) 는 auth 체크 스킵.
- **X-Robots-Tag 미부착** — partner 영역은 가입자/마케팅과 동등 노출 정책.

### ② `(dashboard)/layout.tsx` (진짜 auth boundary)

```ts
await requirePartnerSession();  // dal.ts — user + partner.active 2단계 검증
```

로그인 필요한 partner 페이지 (현재 `/partner` 만, 향후 본인 대시보드들) 는 이 `(dashboard)` route group 안에 둘 것. 토큰 / 가입 진입 페이지는 그룹 밖.

### ③ Server Action (가드 필수)

`requirePartnerSession()` 은 페이지 렌더에만 적용 — server action POST 호출에는 미적용. partner mutation action 추가 시 함수 진입부에서 직접 호출:

```ts
"use server";
export async function updateMyProfile(...) {
  await requirePartnerSession();  // ← 누락 시 누구나 POST 가능
  // ... 로직
}
```

`signOutPartner` 같은 가드 없어도 무해한 액션은 예외.

**토큰 기반 action** (`submitProposal`, `requestPdfUpload`, `signUpWithKakao`) 은 token 자체가 인증 역할 — partner session 가드 추가 안 함. 알림톡 / 신규 가입 흐름의 본질이므로.

## 사용자 모델 (User + Partner extension + Invitation)

- `claim.user` — 모든 인증 사용자 공통. PK = nanoid, `authId` = auth.users.id (UUID, nullable). `phone` UNIQUE.
- `claim.partner` — partner extension. PK = `user.id` 공유. `active` 토글로 매칭 풀 제외 / 로그인 차단.
- `claim.partner_invitation` — 가입 초청 (임시). 어드민이 발급한 후 설계사가 정식 가입할 때까지 보관.
  - `linkedAuthId` — Kakao OAuth 콜백이 lock 한 auth.users.id. **다른 카카오 계정의 콜백은 reject** (link_conflict). `reissuePartnerInvitationToken` 만이 NULL 로 리셋해 잠금 해제.
  - `phoneVerifiedAt` — PortOne 본인인증 통과 audit. 가입 트랜잭션 직전 set (게이트 아닌 audit only). reissue 시 NULL.
  - `consumedAt + consumedUserId` — 가입 완료 시 채워지고 더 이상 사용 불가.

**user/partner 직접 생성 금지** — partner 는 반드시 invitation 경유 + Kakao OAuth + 본인인증 흐름으로만 생성됨. 어드민 어디에도 직접 INSERT 액션 없음 (`createPartner` 없음). 콜백도 partial state 를 만들지 않음 — user/partner INSERT 는 본인인증 통과 시점에 단일 트랜잭션으로만 일어남.

## 파일 구조

```
partner/
├─ layout.tsx                          # 모바일 셸 + 브랜드 헤더 (모든 partner 페이지 공통)
├─ login/
│  ├─ page.tsx                         # 이미 로그인된 partner 는 /partner 로 redirect
│  └─ actions.ts                       # signInWithKakao: 로그인용 Supabase OAuth URL 반환 + redirect
├─ signup/
│  └─ [token]/
│     ├─ page.tsx                      # Step 1 — 초청 token 검증 + "카카오톡으로 시작" 버튼
│     ├─ actions.ts                    # signUpWithKakao + requestPartnerSignupOtp + verifyPartnerSignupOtp (가입 트랜잭션 owner)
│     ├─ _components/step-badge.tsx    # Step 1/Step 2 진행 표시 공유 컴포넌트
│     └─ verify/
│        ├─ page.tsx                   # Step 2 — Kakao session + linkedAuthId 매칭 검증 후 본인인증 폼 노출
│        └─ _components/verify-form.tsx
├─ assignments/                        # 알림톡 토큰 진입 (로그인 불필요)
│  ├─ [token]/page.tsx                 # 토큰 검증 → 폼 / 안내 분기
│  └─ done/page.tsx                    # 제출 완료 안내
└─ (dashboard)/                        # route group — 로그인 필요
   ├─ layout.tsx                       # requirePartnerSession + 로그아웃 헤더
   ├─ page.tsx                         # /partner 대시보드 (현재 placeholder)
   └─ _actions/logout.ts               # signOutPartner
```

OAuth 콜백은 `/api/auth/callback` 라우트 핸들러 — `?signup=<token>` 유무로 가입 / 로그인 분기. signup 분기는 invitation lock 만 책임 (user/partner INSERT 안 함) — 가입 트랜잭션은 verify 액션이 소유.

## ENV

| 변수 | 역할 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL. admin 과 공유. |
| `SUPABASE_PUBLISHABLE_KEY` | Auth flow 용 (anon key 의 신 명칭). |
| `PARTNER_INVITATION_TTL_DAYS` | (옵션, 기본 7) 가입 초청 token 만료 (일). |

추가로 Supabase Dashboard 에서:
- **Authentication → Providers → Kakao** 활성화 + Kakao REST API Key/Secret 입력
- **Authentication → URL Configuration → Redirect URLs** 에 `<도메인>/api/auth/callback` 추가
- **Kakao Developers** 콘솔에서 "카카오계정(이메일)" 동의항목 필수 — 미동의 시 callback 이 `?error=no_email`.
  Kakao OAuth 는 전화번호를 제공하지 않음 → 별도 PortOne 본인인증으로 phone 검증 (signup 페이지 Step 1).

PortOne 본인인증 연동에 필요한 env (Phase B):
- `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET` — V2 API 기준

## 운영 절차

### 새 partner 가입 (initial signup)

운영자가 `/admin/partners/new` 에서 invitation 발급:
- 입력: name, phone, bio, yearsOfExperience, trustMetric, licenseNumber, active
- 즉시 INSERT 되는 것은 **partner_invitation 한 row** + token + expiresAt (`PARTNER_INVITATION_TTL_DAYS`)
- user / partner row 는 만들지 않음 — 가입 완료 시점에 콜백 트랜잭션이 한꺼번에 INSERT

이후 흐름 (2단계, Kakao 먼저 → 본인인증):
1. 어드민이 `/admin/partners/invitations/[id]` 에서 가입 URL 복사 → 메신저로 설계사에게 전달
2. 설계사가 링크 진입 → `linkedAuthId` 로 페이지 분기:
   - **Step 1 — 카카오 가입 (linkedAuthId IS NULL)**: "카카오톡으로 시작" → Kakao OAuth
   - **Step 2 — 본인인증 (linkedAuthId IS NOT NULL)**: `/verify` 라우트로 자동 redirect
3. 콜백 (`/api/auth/callback?signup=<token>`) — invitation lock 만:
   - invitation 미소비 + 미만료 확인
   - `linkedAuthId` 처리: NULL 이면 race-safe claim (`updateMany WHERE linkedAuthId IS NULL`), 일치하면 통과 (재진입), 불일치면 supabase signOut + `?error=link_conflict`
   - `/partner/signup/<token>/verify` 로 redirect (user/partner INSERT 안 함)
4. `/partner/signup/<token>/verify`:
   - 페이지 가드: Kakao 세션 존재 + `invitation.linkedAuthId === authUser.id` 매칭
   - PortOne 본인인증 폼 (현재 placeholder, dev 에서 6자리 OTP 통과)
   - `verifyPartnerSignupOtp` 통과 시 단일 트랜잭션:
     - tx 안 invitation 재확인 (소비 / 만료 / linkedAuthId 셋 모두 → race-safe)
     - `user` (authId/email=Kakao, name/phone=invitation) + `partner` (invitation partner 필드) + invitation 소비 (`consumedAt`, `consumedUserId`, `phoneVerifiedAt` audit)
   - Kakao 응답의 phone 은 사용 안 함 — phone 매칭은 PortOne 본인인증 책임
5. `/partner` 로 redirect

### 초청 재발급 / 삭제

- **재발급** (만료 임박/Kakao lock 후 본인인증 미완 등): `/admin/partners/invitations/[id]` 의 "토큰 재발급" 버튼. token 회전 + expiresAt 갱신 + **`linkedAuthId` / `phoneVerifiedAt` NULL 리셋** (Kakao 잠금 해제). 구 token 즉시 무효.
- **삭제**: 같은 페이지의 "초청 삭제" 버튼. 미소비 invitation 만 삭제 가능 (소비된 invitation 은 audit 용 보존).

### 즉시 차단 (가입 완료된 partner)

```sql
UPDATE claim.partner SET active=false WHERE id='<user.id>';
```
DAL 이 매 요청마다 확인. 매칭 후보 추출에서도 동시에 제외.

### 토큰 진입 흐름의 우회 우려

`/partner/assignments/[token]` + `/partner/signup/[token]` 모두 로그인 게이트가 없으므로 token + status 검증이 전부.
- 토큰은 `nanoid(32)` (192bit) 라 추측 불가.
- assignments: `assignment.status='pending'` 이 아닌 경우 폼 미노출 (`submitted`/`expired`).
- signup: invitation 의 `consumedAt IS NULL AND expiresAt > now()` 양쪽 만족해야 진입. **Step 1 Kakao OAuth 가 invitation.linkedAuthId 에 auth.users.id 를 lock** — 이후 본인인증 단계 (`/verify`) 는 Kakao 세션 + linkedAuthId 매칭 두 게이트가 모두 통과해야 접근. 다른 Kakao 계정의 콜백은 reject (link_conflict). 가입 트랜잭션 안에서 invitation 의 미소비 / 미만료 / linkedAuthId 매칭 모두 재확인 (race-safe). token 만 알아도 본인인증 엔드포인트에 무차별 접근 불가.
- `submitProposal` action 이 s3Key prefix(`assignment.id`) + S3 HEAD 검증으로 path forgery 차단.

토큰 흐름을 로그인 흐름으로 막지 말 것 — alimtalk / 가입 링크 발송 시 매번 로그인 요구는 UX 손해.

## 흔한 실수

- ❌ `(dashboard)` 밖에 로그인 필요한 페이지 추가 — layout 가드 안 적용. 새 페이지 위치 정할 때 토큰 vs 로그인 흐름 확인.
- ❌ Partner mutation server action 에 `requirePartnerSession()` 가드 누락 — layout 게이트는 페이지 렌더 전용.
- ❌ 토큰 기반 action (signUpWithKakao 등) 에 session 가드 추가 — 흐름 끊김. 토큰 + 콜백 검증이 인증.
- ❌ middleware 의 carve-out 목록에 새 토큰 경로 누락 — 새 토큰 흐름 추가 시 `isPartnerPublicPath` 도 갱신.
- ❌ 어드민에서 user/partner 직접 INSERT 액션 부활 — invitation 경유가 단일 진입점. `createPartnerInvitation` 만 존재.
- ❌ Kakao OAuth 응답에서 phone 을 직접 매칭하려는 시도 — Kakao 는 phone 을 제공하지 않음. phone 매칭은 PortOne 본인인증 (verify 단계) 책임.
- ❌ User row 만 만들고 Partner row 누락 — partner extension row 자체가 권한. 누락 시 DAL 통과 안 됨.
- ❌ verify action 에서 `invitation.linkedAuthId === authUser.id` 매칭 검사 누락 — 다른 사람 token + 본인 Kakao 세션으로 가입 횡령 가능.
- ❌ 콜백에서 user/partner INSERT 부활 — partial state (user 있고 partner 없음) 회귀 + 두 트랜잭션 owner 의 책임 분리 깨짐. 콜백은 invitation lock 만.
- ❌ reissue 액션에서 `linkedAuthId` / `phoneVerifiedAt` 리셋 누락 — 운영자가 Kakao lock 후 본인인증 안 끝낸 invitation 을 해제할 방법 없어짐.
