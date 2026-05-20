# partner/ — 설계사 영역

가입자 페이지와 같은 모바일 셸 (`max-w-[480px]`) 안에서 동작. 세 가지 진입 흐름이 공존:

1. **알림톡 일회용 토큰** — PRD §5.4. `/partner/plan-request-assignments/[token]` 으로 직접 진입. **로그인 불필요** — 토큰 자체가 인증.
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
- **`?next` 보존**: redirect 시 원래 경로(`pathname + search`) 를 쿼리에 실어 보냄 →
  로그인 페이지 → action → callback URL 까지 forward → 로그인 성공 후 원 위치 복귀.
  화이트리스트 (`safeNextPath`, `/partner/*` 만) 는 페이지/액션/콜백 3 단계 검증.
- **Carve-out**: `/partner/login`, `/partner/plan-request-assignments/*` (알림톡 토큰), `/partner/signup/*` (가입 초청 token) 는 auth 체크 스킵.
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

**토큰 기반 action** (`submitPlanProposal`, `requestPdfUpload`, `signUpWithKakao`) 은 token 자체가 인증 역할 — partner session 가드 추가 안 함. 알림톡 / 신규 가입 흐름의 본질이므로.

## 사용자 모델 (User + Partner extension + Invitation)

- `claim.user` — 모든 인증 사용자 공통. PK = nanoid, `authId` = auth.users.id (UUID, nullable). `phone` UNIQUE.
- `claim.partner` — partner extension. PK = `user.id` 공유. `active` 토글로 매칭 풀 제외 / 로그인 차단.
- `claim.partner_signup_invitation` — 가입 초청 (임시). 어드민이 발급한 후 설계사가 정식 가입할 때까지 보관.
  - `linkedAuthId` — Kakao OAuth 콜백이 lock 한 auth.users.id. **매 진입마다 무조건 덮어씀** — 다른 카카오 계정으로 재진입해도 그대로 새 계정으로 가입 진행 가능. 보안 게이트가 아니며, 단지 "verify 액션이 최신 OAuth 한 세션으로 호출되는지" 일관성 검증에만 사용. 횡령 방지는 휴대폰 OTP (알리고 SMS) 가 담당 — 발송 대상이 `invitation.phone` 으로 고정되어 다른 사람의 OAuth + invitation 조합으로는 코드 수신 불가. reissue 시 NULL.
  - `phoneVerifiedAt` — 휴대폰 OTP 통과 audit. 가입 트랜잭션 직전 set (게이트 아닌 audit only). 콜백 진입 시 NULL 리셋, reissue 시 NULL.
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
│     └─ verify/
│        ├─ page.tsx                   # Step 2 — Kakao session + linkedAuthId 매칭 검증 후 본인인증 폼 노출
│        └─ _components/verify-form.tsx
├─ assignments/                        # 알림톡 토큰 진입 (로그인 불필요)
│  ├─ [token]/page.tsx                 # 토큰 검증 → 폼 / 안내 분기
│  └─ done/page.tsx                    # 제출 완료 안내
└─ (dashboard)/                        # route group — 로그인 필요
   ├─ layout.tsx                       # requirePartnerSession + 로그아웃 헤더
   ├─ page.tsx                         # /partner 대시보드 (잔액 카드 임베드)
   ├─ credits/
   │  ├─ page.tsx                      # 잔액 + 거래 내역 (cursor pagination)
   │  ├─ topup/page.tsx                # 충전 금액 입력 → PG SDK 호출 / stub redirect
   │  └─ topup/result/page.tsx         # 모바일 SDK redirect 착지 — acknowledgeTopup 호출 + 결과 안내
   └─ _actions/logout.ts               # signOutPartner
```

크레딧 도메인 자체의 규칙 (chokepoint, 멱등성, 액터 매트릭스) 은 [src/features/credits/CLAUDE.md](../../features/credits/CLAUDE.md). 충전 PG 콜백은 `/api/webhooks/credits/[provider]` 라우트가 받음 — 세션 가드 없음, `PaymentProvider.verifyWebhook` 가 인증.

OAuth 콜백은 `/api/auth/callback` 라우트 핸들러 — `?signup=<token>` 유무로 가입 / 로그인 분기. signup 분기는 invitation lock 만 책임 (user/partner INSERT 안 함) — 가입 트랜잭션은 verify 액션이 소유. 로그인 분기는 `?next` 를 받아 화이트리스트 검증 후 해당 경로로 redirect (에러 응답에도 `?next` 보존해 재시도 후 복귀).

## ENV

| 변수 | 역할 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL. admin 과 공유. |
| `SUPABASE_PUBLISHABLE_KEY` | Auth flow 용 (anon key 의 신 명칭). |
| `PARTNER_INVITATION_TTL_DAYS` | (옵션, 기본 7) 가입 초청 token 만료 (일). |
| `ALIGO_KEY`, `ALIGO_USER_ID`, `ALIGO_SENDER`, `ALIGO_TEST_MODE` | 휴대폰 OTP SMS + 신규 배정 / 연락 요청 알림 LMS — 마케팅과 공유 (`server/aligo.ts`). |
| `ALIGO_PROXY_URL`, `ALIGO_PROXY_SECRET` | (운영 필수) Vercel egress 가 동적이라 알리고 whitelist 통과용 고정 IP 프록시. 미설정 시 알리고 직접 호출 (로컬 dev 용). 인프라: `infra/aligo-proxy/`. |
| `REDIS_URL` *or* `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | OTP 코드 + IP 레이트리밋 카운터. 로컬 Docker 는 `REDIS_URL` (ioredis), Vercel prod 는 Upstash REST 두 줄. 백엔드 자동 선택은 `src/server/redis.ts`. 마케팅과 공유. |
| `OTP_RATE_LIMIT_DISABLED` | (옵션) `Y` 면 IP 별 OTP 발송 시도 카운터 우회 — load test / 스테이징 편의. 미설정 = default 동작 (1시간 5회 제한). 마케팅과 공유. |

추가로 Supabase Dashboard 에서:
- **Authentication → Providers → Kakao** 활성화 + Kakao REST API Key/Secret 입력
- **Authentication → URL Configuration → Redirect URLs** 에 `<도메인>/api/auth/callback` 추가
- **Kakao Developers** 콘솔에서 "카카오계정(이메일)" 동의항목 필수 — 미동의 시 callback 이 `?error=no_email`.
  Kakao OAuth 는 전화번호를 제공하지 않음 → 별도 휴대폰 OTP (알리고 SMS) 로 phone 검증 (verify 단계).

## 운영 절차

### 새 partner 가입 (initial signup)

운영자가 `/admin/partners/new` 에서 invitation 발급:
- 입력: name, phone, bio, yearsOfExperience, trustMetric, licenseNumber, active
- 즉시 INSERT 되는 것은 **partner_signup_invitation 한 row** + token + expiresAt (`PARTNER_INVITATION_TTL_DAYS`)
- user / partner row 는 만들지 않음 — 가입 완료 시점에 콜백 트랜잭션이 한꺼번에 INSERT

이후 흐름 (2단계, Kakao 먼저 → 본인인증) — **매 진입마다 새 Kakao OAuth**:
1. 어드민이 `/admin/partners/invitations/[id]` 에서 가입 URL 복사 → 메신저로 설계사에게 전달
2. 설계사가 링크 진입 → 페이지는 항상 Step 1 ("카카오톡으로 시작") 표시. `linkedAuthId` 분기 없음 — 다른 계정으로 재시도해도 동일하게 시작.
3. `signUpWithKakao` 액션: 현재 Supabase 세션 signOut → `signInWithOAuth` (`prompt=login` 으로 Kakao SSO 우회 + 계정 선택 강제).
4. 콜백 (`/api/auth/callback?signup=<token>`) — invitation lock 갱신 만:
   - `updateMany WHERE token AND consumedAt IS NULL AND expiresAt > now()` 로 invitation 유효성 + lock 갱신을 한 쿼리에. updated.count === 0 이면 invalid 로 처리.
   - `linkedAuthId` 는 매번 현재 `authUser.id` 로 **무조건 덮어씀** (이전 lock 무시). `phoneVerifiedAt` 도 NULL 리셋 — 새 계정 진입이므로 본인인증 다시 받도록.
   - 성공 시 `/partner/signup/<token>/verify` 로 redirect (user/partner INSERT 안 함).
5. `/partner/signup/<token>/verify`:
   - 페이지 가드: Kakao 세션 존재 + `invitation.linkedAuthId === authUser.id` 매칭. mismatch (다른 탭이 새 OAuth 해 lock 옮긴 경우 등) 면 signOut + Step 1 으로 silent redirect (별도 에러 안내 X).
   - 휴대폰 OTP 폼: name + invitation.phone prefill (readonly). "인증번호 전송" → `requestPartnerSignupOtp` 가 알리고 SMS 로 6자리 코드 발송 + Redis 에 `otp:partner-signup:{invitationId}` EX=180 저장. 같은 IP 의 발송 시도는 `otp:rl:{ip}` 로 60분 5회 제한 (마케팅 OTP 와 카운터 공유). `ALIGO_TEST_MODE=Y` 일 땐 코드 "000000" 고정 + 알리고 호출 생략.
   - `verifyPartnerSignupOtp` 통과 시 (Redis GET 일치 → DEL) 단일 트랜잭션:
     - tx 안 invitation 재확인 (소비 / 만료 / linkedAuthId 셋 모두 → race-safe). 다른 탭이 lock 을 옮겼다면 여기서 reject.
     - `user` (authId/email=Kakao, name/phone=invitation) + `partner` (invitation partner 필드) + invitation 소비 (`consumedAt`, `consumedUserId`, `phoneVerifiedAt` audit).
   - Kakao 응답의 phone 은 사용 안 함 — phone 매칭은 OTP 발송 대상 = `invitation.phone` 으로 자동 강제 (횡령 방지 게이트).
6. `/partner` 로 redirect

### 어드민 본인 겸직 가입 (Kakao OAuth 우회)

운영자가 자기 자신을 설계사로도 등록하는 흐름. 1 User = 1 phone 원칙 유지 — 기존 admin User 에 Partner extension 만 추가.

분기 기준은 `partner_signup_invitation.existingUserId` — 발급 시 set 되면 이 흐름.

1. `/admin/partners/new` 에서 본인 phone 입력 → `lookupAdminUserByPhone` 으로 admin user 자동 감지 → "어드민 본인 설계사 등록" 체크 → invitation INSERT (`existingUserId` set, immutable).
2. 발급된 `/partner/signup/<token>` 을 같은 브라우저에서 본인이 직접 클릭. signup 페이지가 admin 세션 + `existingUserId` 일치 확인 후 verify 로 자동 forward (Kakao 단계 skip). 세션 없으면 `/admin/login?next=...` redirect.
3. verify 페이지가 admin 세션 가드 (Kakao 가드 우회) → 휴대폰 OTP 폼 (일반 흐름과 동일 — invitation.phone prefill, 알리고 SMS, Redis EX=180, IP 레이트리밋 공유).
4. `verifyPartnerSignupOtp` 의 admin 분기 트랜잭션:
   - invitation 재확인 (consumedAt / expiresAt / existingUserId race-safe).
   - user 재확인 (admin.active + partner 없음 + user.phone === invitation.phone).
   - **`partner.create` + balance/stats eager-create + invitation 소비.** user row 는 update 안 함 (name/email/authId/phone 모두 보존).
5. `/admin/partners` 로 redirect — admin context 유지.

OAuth 콜백 가드 — `handleSignup` 이 invitation.existingUserId NOT NULL 진입을 reject. 정상 흐름은 signup 페이지가 verify 로 forward 하므로 도달하지 않으며, 콜백 URL 위조 시도 시 Kakao 세션 청소 후 `?error=admin_required` 로 안내.

서버 액션 보안 게이트:
- `signUpWithKakao` 는 existingUserId set invitation 진입을 reject (이 흐름은 카카오 안 씀).
- `requestPartnerSignupOtp` / `verifyPartnerSignupOtp` 는 `resolveCallerAuth` 로 invitation 의 mode 를 token 만 보고 판정해 admin / kakao 분기. 클라이언트가 보낸 hidden field 에 의존 안 함.

### 초청 재발급 / 삭제

- **재발급** (만료 임박 / token URL 유출 등): `/admin/partners/invitations/[id]` 의 "토큰 재발급" 버튼. token 회전 + expiresAt 갱신 (구 token 즉시 무효). 부수적으로 `linkedAuthId` / `phoneVerifiedAt` NULL 리셋되지만 어차피 다음 진입이 덮어쓰므로 cleanliness 목적.
- **삭제**: 같은 페이지의 "초청 삭제" 버튼. 미소비 invitation 만 삭제 가능 (소비된 invitation 은 audit 용 보존).

### 즉시 차단 (가입 완료된 partner)

```sql
UPDATE claim.partner SET active=false WHERE id='<user.id>';
```
DAL 이 매 요청마다 확인. 매칭 후보 추출에서도 동시에 제외.

### 토큰 진입 흐름의 우회 우려

`/partner/plan-request-assignments/[token]` + `/partner/signup/[token]` 모두 로그인 게이트가 없으므로 token + status 검증이 전부.
- 토큰은 `nanoid(32)` (192bit) 라 추측 불가.
- assignments: `assignment.status='pending'` 이 아닌 경우 폼 미노출 (`submitted`/`expired`).
- signup: invitation 의 `consumedAt IS NULL AND expiresAt > now()` 양쪽 만족해야 진입. **매 진입마다 새 Kakao OAuth 가 invitation.linkedAuthId 를 덮어씀** — Kakao 계정 자체는 보안 게이트가 아니라 "가입 후 어떤 계정으로 로그인할지" 결정 수단. **횡령 방지는 휴대폰 OTP** — 발송 대상이 `invitation.phone` 으로 고정되어 invitation 소유자만 코드 수신 가능. verify 페이지/액션은 "현재 Kakao 세션 == 최신 lock" 인지만 검증 — mismatch 시 silent 하게 Step 1 으로 돌려보내 새 OAuth 시작. 가입 트랜잭션 안에서 invitation 의 미소비 / 미만료 / linkedAuthId 매칭 모두 재확인 (race-safe).
- `submitPlanProposal` action 이 s3Key prefix(`assignment.id`) + S3 HEAD 검증으로 path forgery 차단.

토큰 흐름을 로그인 흐름으로 막지 말 것 — alimtalk / 가입 링크 발송 시 매번 로그인 요구는 UX 손해.

## 흔한 실수

- ❌ `(dashboard)` 밖에 로그인 필요한 페이지 추가 — layout 가드 안 적용. 새 페이지 위치 정할 때 토큰 vs 로그인 흐름 확인.
- ❌ Partner mutation server action 에 `requirePartnerSession()` 가드 누락 — layout 게이트는 페이지 렌더 전용.
- ❌ 토큰 기반 action (signUpWithKakao 등) 에 session 가드 추가 — 흐름 끊김. 토큰 + 콜백 검증이 인증.
- ❌ middleware 의 carve-out 목록에 새 토큰 경로 누락 — 새 토큰 흐름 추가 시 `isPartnerPublicPath` 도 갱신.
- ❌ 어드민에서 user/partner 직접 INSERT 액션 부활 — invitation 경유가 단일 진입점. `createPartnerSignupInvitation` 만 존재.
- ❌ Kakao OAuth 응답에서 phone 을 직접 매칭하려는 시도 — Kakao 는 phone 을 제공하지 않음. phone 매칭은 휴대폰 OTP (verify 단계, 발송 대상이 `invitation.phone` 으로 고정) 책임.
- ❌ User row 만 만들고 Partner row 누락 — partner extension row 자체가 권한. 누락 시 DAL 통과 안 됨.
- ❌ verify action 에서 `invitation.linkedAuthId === authUser.id` 매칭 검사 누락 — 다른 탭의 stale 세션이 가입 트랜잭션 호출 가능 (Kakao 자체는 게이트 아니지만 일관성 검증 필요).
- ❌ 콜백에서 user/partner INSERT 부활 — partial state (user 있고 partner 없음) 회귀 + 두 트랜잭션 owner 의 책임 분리 깨짐. 콜백은 invitation lock 만.
- ❌ 콜백을 "처음에만 claim" 로직으로 되돌리기 — 다른 Kakao 계정 재시도가 막힘. lock 은 매 진입마다 무조건 덮어쓰는 모델 (`signUpWithKakao` 의 signOut + prompt=login 과 한 쌍).
- ❌ signup 페이지에서 `linkedAuthId` 보고 자동 `/verify` redirect — 같은 링크로 다른 카카오 계정 재시도 차단됨. 항상 Step 1 부터.
- ❌ reissue 액션에서 `linkedAuthId` / `phoneVerifiedAt` 리셋 누락 — 운영자가 Kakao lock 후 본인인증 안 끝낸 invitation 을 해제할 방법 없어짐.
- ❌ 어드민 겸직 가입 트랜잭션에서 `user.create` 또는 `user.update(phone/name/email)` 호출 — 기존 admin row 가 partner.create 만으로 partner extension 추가되는 모델 (1 User = 1 phone 유지). user 컬럼 갱신은 별도 admin 메뉴에서.
- ❌ `existingUserId` 분기 검사를 클라이언트가 보낸 hidden field 로만 판정 — `resolveCallerAuth` 가 server 측에서 token → invitation.existingUserId 로 mode 재 확인. UI hidden field 는 발급 단계의 의도 표시일 뿐.
