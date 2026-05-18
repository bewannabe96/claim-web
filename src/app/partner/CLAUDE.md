# partner/ — 설계사 영역

가입자 페이지와 같은 모바일 셸 (`max-w-[480px]`) 안에서 동작. 두 가지 진입 흐름이 공존:

1. **알림톡 일회용 토큰** — PRD §5.4. `/partner/assignments/[token]` 으로 직접 진입. **로그인 불필요** — 토큰 자체가 인증.
2. **카카오톡 로그인** — `/partner/login` → Kakao OAuth → `/partner` 대시보드. 본인 받은 요청 / 진행 현황 확인용.

## 보안 모델 (3 레이어)

```
요청 → [① 루트 middleware.ts] → [② (dashboard)/layout.tsx requirePartnerSession] → 페이지
                ↓                            ↓
        Supabase 세션 optimistic 검사   user.role='partner' + partner.active
        (login / 토큰 진입 carve-out)   (claim.user.authId = auth.users.id)
```

### ① 루트 `middleware.ts` (인증 boundary 아님)

- **Optimistic 비인증 차단**: `/partner/*` 에서 Supabase 세션 cookie 없으면 즉시 307 → /partner/login.
  PPR 모드의 1초 meta refresh fallback 회피 목적 (자세한 건 docs/architecture.md §7.2).
- **Carve-out**: `/partner/login` (비인증 진입 정상) + `/partner/assignments/*` (토큰 진입) 는 auth 체크 스킵.
- **X-Robots-Tag 미부착** — partner 영역은 가입자/마케팅과 동등 노출 정책.

### ② `(dashboard)/layout.tsx` (진짜 auth boundary)

```ts
await requirePartnerSession();  // dal.ts — user + partner.active 2단계 검증
```

로그인 필요한 partner 페이지 (현재 `/partner` 만, 향후 본인 대시보드들) 는 이 `(dashboard)` route group 안에 둘 것. 토큰 진입 페이지는 그룹 밖.

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

**토큰 기반 action** (`submitProposal`, `requestPdfUpload`) 은 token + assignment status 검증이 인증 역할 — partner session 가드 추가 안 함. 알림톡 흐름의 본질이므로.

## 사용자 모델 (User + Partner extension)

- `claim.user` — 모든 인증 사용자 공통. PK = nanoid, `authId` = auth.users.id (UUID, nullable).
- `claim.partner` — partner extension. PK = `user.id` 공유. `active` 토글로 매칭 풀 제외 / 로그인 차단.
- 사전 등록 후 첫 Kakao 로그인 시 `/api/auth/callback` 가 email 로 user 찾아 `authId` 채움 (claim).
- 이후 로그인은 DAL 이 `where: { authId }` 로 바로 lookup.

## 파일 구조

```
partner/
├─ layout.tsx                          # 모바일 셸 + 브랜드 헤더 (모든 partner 페이지 공통)
├─ login/
│  ├─ page.tsx                         # 이미 로그인된 partner 는 /partner 로 redirect
│  └─ actions.ts                       # signInWithKakao: Supabase OAuth URL 반환 + redirect
├─ assignments/                        # 알림톡 토큰 진입 (로그인 불필요)
│  ├─ [token]/page.tsx                 # 토큰 검증 → 폼 / 안내 분기
│  └─ done/page.tsx                    # 제출 완료 안내
└─ (dashboard)/                        # route group — 로그인 필요
   ├─ layout.tsx                       # requirePartnerSession + 로그아웃 헤더
   ├─ page.tsx                         # /partner 대시보드 (현재 placeholder)
   └─ _actions/logout.ts               # signOutPartner
```

OAuth 콜백은 `/api/auth/callback` 라우트 핸들러 (partner Kakao 전용). admin 영역과 분리.

## ENV

| 변수 | 역할 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL. admin 과 공유. |
| `SUPABASE_PUBLISHABLE_KEY` | Auth flow 용 (anon key 의 신 명칭). |

추가로 Supabase Dashboard 에서:
- **Authentication → Providers → Kakao** 활성화 + Kakao REST API Key/Secret 입력
- **Authentication → URL Configuration → Redirect URLs** 에 `<도메인>/api/auth/callback` 추가
- **Kakao Developers** 콘솔에서 동의항목 "카카오계정(이메일)" 필수 동의 — 미동의 시 callback 이 `?error=no_email` 로 튕김

## 운영 절차

### 새 partner 등록

운영자가 `/admin/partners/new` 에서 user + partner 동시 등록 (한 트랜잭션):
- User: email, name, phone, role='partner'
- Partner: avatarUrl, bio, yearsOfExperience, trustMetric, licenseNumber (필수), active

`authId` 는 null 상태로 저장. 해당 email 로 카카오 첫 로그인 시 callback 이 자동 claim.

### 즉시 차단
```sql
UPDATE claim.partner SET active=false WHERE id='<user.id>';
```
DAL 이 매 요청마다 확인. 매칭 후보 추출에서도 동시에 제외.

### 토큰 진입 흐름의 우회 우려

`/partner/assignments/[token]` 은 로그인 게이트가 없으므로 token + assignment status 검증이 전부.
- 토큰은 `nanoid(32)` (192bit) 라 추측 불가.
- `assignment.status='pending'` 이 아닌 경우 폼 미노출 (`submitted`/`expired`).
- `submitProposal` action 이 s3Key prefix(`assignment.id`) + S3 HEAD 검증으로 path forgery 차단.

partner 인증 추가됐다고 토큰 흐름을 막지 말 것 — alimtalk 발송 시 매번 로그인 요구는 UX 손해.

## 흔한 실수

- ❌ `(dashboard)` 밖에 로그인 필요한 페이지 추가 — layout 가드 안 적용. 새 페이지 위치 정할 때 토큰 vs 로그인 흐름 확인.
- ❌ Partner mutation server action 에 `requirePartnerSession()` 가드 누락 — layout 게이트는 페이지 렌더 전용.
- ❌ 토큰 기반 action 에 session 가드 추가 — alimtalk 흐름 끊김. 토큰 + status 검증이 인증.
- ❌ middleware 의 carve-out 목록에 새 토큰 경로 누락 — 새 토큰 흐름 추가 시 `isPartnerPublicPath` 도 갱신.
- ❌ User row 만 만들고 Partner row 누락 — role='partner' 이어도 partner extension 없으면 DAL 통과 안 됨 (의도, defense in depth).
