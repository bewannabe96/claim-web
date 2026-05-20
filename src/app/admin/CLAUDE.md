# admin/ — 운영자 영역

인터넷에 노출되어 있으므로 **모든 작업 시 보안 모델을 정확히 이해할 것.**

## 보안 모델 (4 레이어)

```
요청 → [① 루트 middleware.ts] → [② admin/layout.tsx metadata] → [③ (dashboard)/layout.tsx requireAdminSession] → 페이지
                ↓                                                       ↓
        knock cookie 검사                                         claim.admin row 존재 + active
        X-Robots-Tag 부착                                         (claim.user.authId = auth.users.id)
        Supabase 세션 optimistic 검사
```

### ① 루트 `middleware.ts` (인증 boundary 아님, optimistic 만)

- **Knock 게이트** (`ADMIN_KNOCK_PATH` env 설정 시): 유효한 `admin_knock` 쿠키 없으면 모든 `/admin/*` 응답 **404**. admin 존재 자체 부정. `/<KNOCK>` 진입 시 쿠키 발급 + 307 → /admin/login. obscurity 이지 보안 아님 — MFA / IP 화이트리스트 와 병행.
- **Optimistic 비인증 차단**: Supabase 세션 cookie 없으면 즉시 307 → /admin/login. 이게 없으면 cacheComponents/PPR 모드에서 layout 의 `redirect()` 가 1초 meta refresh fallback 으로 처리되어 admin 셸 HTML 이 응답 body 에 노출되고 크롤러가 200 으로 색인할 수 있음.
- **세션 cookie silent refresh + stale cleanup**: `auth.getUser()` 호출 부수 효과로 토큰 만료 직전 갱신. refresh 실패 (`refresh_token_not_found` 등 `AuthError`) 면 `sb-*-auth-token*` cookie 를 응답에서 명시 만료 — `@supabase/auth-js` 는 `AuthSessionMissingError` 에서만 자동 청소하므로 refresh 실패는 stale cookie 가 그대로 남아 후속 요청에서 반복 throw 됨. 일시적 네트워크 오류엔 cookie 안 건드림.
- **`X-Robots-Tag`**: 모든 admin 관련 응답에 `noindex, nofollow, noarchive, nosnippet, noimageindex`. partner 경로는 가입자와 동등 노출 정책이라 미부착.

### ② `admin/layout.tsx` (metadata only)

`metadata.robots` 로 `<meta name="robots">` 가 모든 `/admin/*` 페이지에 자동 주입. middleware 의 HTTP 헤더와 이중 방어 (CDN 캐시 / 정적 export 등 엣지 케이스 보험). UI 는 자식 (dashboard) layout / login page 가 책임 — 여기는 `return children` passthrough.

### ③ `admin/(dashboard)/layout.tsx` (진짜 auth boundary)

```ts
await requireAdminSession();  // dal.ts — Supabase getUser() → user(authId) → admin extension active 확인
```

이게 단일 진실 공급원. 자식 페이지는 admin 인증된 세션을 신뢰. `(dashboard)` route group 이라 URL 에 안 박힘.

### ④ Server Action 들 (개별 가드 필수)

**Layout 의 `requireAdminSession()` 은 페이지 렌더에만 적용됨 — server action POST 호출에는 적용 안 됨.** 그래서 admin 영역의 모든 mutation action 은 함수 진입부에서 직접 `requireAdminSession()` 을 호출해야 함:

```ts
// src/features/admin/actions.ts, src/features/partners/actions.ts (create/update)
"use server";
export async function saveSettings(...) {
  await requireAdminSession();  // ← 누락 시 누구나 POST 가능
  // ... 로직
}
```

action 새로 추가할 때 반드시 첫 줄 가드. `src/app/admin/(dashboard)/_actions/logout.ts` 의 signOut 처럼 가드 없어도 무해한 액션은 예외.

## 사용자 모델 (User + Admin extension)

- `claim.user` — 모든 인증 사용자 공통. PK = nanoid, `authId` = auth.users.id (UUID, nullable).
- `claim.admin` — admin extension. PK = `user.id` 공유. `active` 토글로 즉시 차단.
- 사전 등록 후 첫 로그인 시 `signInAdmin` action 이 email 로 user 찾아 `authId` 채움 (claim).
- 이후 로그인은 DAL 이 `where: { authId }` 로 바로 lookup.

## 파일 구조

```
admin/
├─ layout.tsx                    # metadata.robots noindex (모든 admin 페이지 적용)
├─ login/
│  ├─ page.tsx                   # 이미 로그인된 admin 은 /admin 으로 redirect
│  ├─ actions.ts                 # signInAdmin: Supabase signIn + user lookup + admin 검증 + authId claim
│  └─ _components/login-form.tsx # useActionState 폼
└─ (dashboard)/                  # route group — 모든 인증 영역
   ├─ layout.tsx                 # requireAdminSession + top bar + nav + 로그아웃 form
   ├─ page.tsx                   # 대시보드 홈
   ├─ requests/...               # 요청 모니터링 (상세 페이지에서 분석 실패도 인라인 노출)
   ├─ analysis-failures/page.tsx # 미해결 분석 실패 모니터링 + 재시도
   ├─ partners/...               # 설계사 풀 관리 (가입 초청 발급 + 등록된 partner 편집)
   │  ├─ page.tsx                # 가입 대기 (invitation) + 등록 완료 (partner) 2-섹션 리스트
   │  ├─ new/page.tsx            # 신규 초청 발급 (createPartnerSignupInvitation 액션)
   │  ├─ invitations/[id]/...    # 초청 상세 — 가입 URL 복사 + 재발급/삭제/정보수정
   │  └─ [id]/page.tsx           # 등록 완료된 partner 편집 (updatePartner) + 크레딧 수동 조정 (adjustCredit, [features/credits](../../features/credits/CLAUDE.md))
   ├─ settings/...               # 시스템 설정
   ├─ _actions/logout.ts         # signOutAdmin server action
   └─ _components/                # 어드민 공용 UI
      ├─ admin-nav.tsx
      ├─ analysis-error-pill.tsx # 분석 실패 group 색상/라벨 단일화 — pill 직접 정의 금지
      ├─ page-shell.tsx
      └─ retry-analysis-button.tsx  # 분석 재시도 client 버튼 (useTransition + retryPlanProposalAnalysis)
```

## ENV

| 변수 | 역할 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_PUBLISHABLE_KEY` | Auth flow 용 (anon key 의 신 명칭). RLS 적용 받음. |
| `ADMIN_KNOCK_PATH` | (옵션, 권장) admin 경로 은닉. `/<value>` 진입 시 쿠키 발급. 미설정 시 knock 검사 스킵. |
| `LOCAL_DEV_ADMIN_USER_ID` | (dev 전용) 본인 auth.users.id (UUID). seed 가 user.authId 채움. |
| `LOCAL_DEV_ADMIN_EMAIL` | (dev 전용) 본인 이메일. seed 가 user.email 로 upsert. |
| `PARTNER_INVITATION_TTL_DAYS` | (옵션, 기본 7) 신규 설계사 가입 초청 token 만료 (일). |

자세한 형식/회전 절차는 [.env.example](../../../.env.example).

## 운영 절차

### 새 partner 등록 (가입 초청 발급)

partner 는 어드민이 직접 INSERT 하지 않음. 다음 흐름:

1. `/admin/partners/new` 에서 이름/휴대폰 + partner 정보 입력 → "초청 발급"
2. `createPartnerSignupInvitation` 액션이 partner_signup_invitation row + token + expiresAt 생성, `/admin/partners/invitations/<id>` 로 자동 이동
3. 발급된 가입 URL (`/partner/signup/<token>`) 복사 → 메신저로 설계사에게 전달
4. 설계사가 **카카오 OAuth → 본인인증** 두 단계 완료 시점에 verify 액션이 user + partner 트랜잭션 INSERT + invitation 소비. 매 진입마다 새 OAuth 가 강제되며 콜백은 invitation 의 linkedAuthId 를 최신 계정으로 덮어씀 — 다른 카카오 계정으로 재시도 가능 (횡령 방지는 본인인증의 phone 매칭이 책임).
5. 자세한 흐름은 [src/app/partner/CLAUDE.md](../partner/CLAUDE.md) 참조

같은 페이지에서 가능한 운영 액션:
- 초청 정보 수정 (이름/휴대폰/partner 필드)
- 토큰 재발급 (만료 임박 / token URL 유출 등 — token 회전 + expiresAt 갱신. 부수적으로 linkedAuthId / phoneVerifiedAt 도 NULL 리셋되지만 어차피 다음 진입이 덮어쓰므로 cleanliness 목적)
- 초청 삭제 (미소비 invitation 만)

### 어드민 본인 설계사 등록 (겸직)

운영자가 직접 매칭에 참여하는 경우 — 한 User 에 admin + partner extension 동시 보유. 1 User = 1 phone 원칙 유지.

1. `/admin/partners/new` 에서 본인 휴대폰 번호 입력 → 폼이 `lookupAdminUserByPhone` 으로 admin user 자동 감지 → "어드민 본인 설계사 등록" 체크박스 노출
2. 체크 후 "초청 발급" → invitation row 가 `existingUserId` 셋팅된 채 INSERT (immutable). phone 도 변경 불가 (수정 폼 readonly).
3. 발급된 URL 을 **본인이 같은 브라우저에서 직접 클릭** → signup 페이지가 admin 세션 확인 후 verify 로 자동 forward (Kakao OAuth 우회). admin 세션 없으면 `/admin/login?next=...` 로 redirect.
4. 휴대폰 OTP 본인인증 통과 시 트랜잭션이 user.create 대신 **`partner.create` + balance/stats eager-create + invitation 소비**. user row (name/email/authId/phone) 는 그대로. 가입 완료 후 `/admin/partners` 로 redirect.

분기 기준은 `partner_signup_invitation.existingUserId` 한 컬럼 — set 이면 겸직, NULL 이면 일반. OAuth 콜백 (`handleSignup`) 은 existingUserId set invitation 진입을 reject 해 정상 흐름 외 경로를 차단. 자세한 가입 트랜잭션 분기는 [src/app/partner/CLAUDE.md](../partner/CLAUDE.md).

### 새 admin 계정 추가 (운영 환경)

1. Supabase Dashboard → Authentication → Users → Add user (이메일/비밀번호)
2. 생성된 `auth.users.id` (UUID) 복사
3. SQL editor 에서 user + admin 두 row 생성 (한 트랜잭션):
   ```sql
   WITH new_user AS (
     INSERT INTO claim."user" (id, auth_id, email, name, updated_at)
     VALUES (<nanoid>, '<auth.users.id>', '<email>', '<name>', now())
     RETURNING id
   )
   INSERT INTO claim.admin (id, updated_at)
   SELECT id, now() FROM new_user;
   ```

코드/seed 로 자동화 안 함 (운영) — 어떤 계정이 admin 인지 코드에 박지 않기 위함.
dev 환경은 `LOCAL_DEV_ADMIN_*` env 가 있으면 seed 가 매번 멱등 upsert.

### 즉시 차단
```sql
UPDATE claim.admin SET active=false WHERE id='<user.id>';
```
DAL 이 매 요청마다 확인하므로 next 요청부터 차단.

### Knock 경로 회전
1. `ADMIN_KNOCK_PATH` env 새 값으로 교체
2. 재배포 (matcher 가 빌드 타임 baked-in)
3. 기존 쿠키 자동 무효화 (쿠키 값 = ENV 값 비교)

## 흔한 실수

- ❌ Server action 에 `requireAdminSession()` 가드 누락 (위 ④ 참조)
- ❌ admin 데이터를 features 도메인 queries 에서 RLS 우회 service_role 로 가져옴 — Prisma 가 이미 DB 에 직결되므로 RLS 우회 자체는 정상이나, DAL 호출로 권한 검증을 먼저 거치도록 페이지/액션 entry point 에서 보장
- ❌ middleware 에서 DB 쿼리 (user 조회 등) — middleware 는 매 요청 실행. DB 호출은 layout/action 의 DAL 에서만
- ❌ `ADMIN_KNOCK_PATH` 를 평문 코드/git 에 커밋 — env 로만 관리
- ❌ MFA 없이 obscurity (knock) 에만 의존 — 코드 한 번 새면 끝
- ❌ User row 만 만들고 Admin row 누락 — admin extension row 자체가 권한. 누락 시 DAL 통과 안 됨
- ❌ partner 를 어드민에서 직접 INSERT 하는 액션 부활 — `createPartner` 없음. 반드시 `createPartnerSignupInvitation` → 콜백 흐름으로만 생성
