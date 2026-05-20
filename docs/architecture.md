# Next.js 16 아키텍처 가이드

> Next.js 16 + React 19 + App Router + Turbopack + Tailwind v4 + shadcn/ui (Nova) + pnpm 기준의 권장 아키텍처.
> 이 프로젝트(보험 가입자 ↔ 설계사 매칭 MVP)에 적용할 표준 패턴을 정리합니다.
>
> **도메인 엔티티 이름 / 어휘 / 명명 컨벤션은 [domain-glossary.md](domain-glossary.md) 참조** — 본 문서는 아키텍처 패턴, glossary 는 도메인 사전.

---

## 0. 전제 버전

| 항목 | 버전 / 상태 |
|---|---|
| Next.js | 16.2.x |
| React | 19.2+ (필수) |
| Node.js | ≥ 20.9 (Node 18 지원 종료) |
| TypeScript | ≥ 5.1 |
| 번들러 | Turbopack (default), webpack은 `--webpack` 플래그로 |
| 스타일 | Tailwind v4 (CSS-first, `tailwind.config.ts` 없음) |
| UI | shadcn/ui Nova preset (Base UI 기반) |

이 프로젝트는 셋업 시점에 Next.js 16.2.4가 설치되었습니다.

---

## 1. 폴더 구조

핵심 원칙은 **route-based + 콜로케이션**, `src/` 사용, 그리고 세 가지 escape hatch (route group, private folder `_xxx`, server-only DAL).

```
/
├─ next.config.ts
├─ middleware.ts                 # 공식 이름은 proxy.ts 지만 16.2.4 + Turbopack 버그로 legacy 이름 사용 (§7.1)
├─ components.json                # shadcn 설정
├─ tsconfig.json                  # paths: { "@/*": ["./src/*"] }
├─ public/
└─ src/
   ├─ app/
   │  ├─ layout.tsx               # 루트 레이아웃 (html/body, 폰트, providers)
   │  ├─ globals.css              # Tailwind v4 (@import + @theme)
   │  ├─ page.tsx                 # 랜딩
   │  ├─ loading.tsx
   │  ├─ error.tsx                # 'use client' 필수
   │  ├─ not-found.tsx
   │  ├─ (marketing)/             # 비인증 영역 (route group)
   │  │  ├─ layout.tsx
   │  │  └─ planners/[slug]/page.tsx
   │  ├─ (app)/                   # 인증 영역
   │  │  ├─ layout.tsx            # 세션 검증 (DAL 호출)
   │  │  ├─ dashboard/
   │  │  │  ├─ page.tsx
   │  │  │  ├─ loading.tsx
   │  │  │  ├─ _components/       # 라우트 전용 UI (라우팅 안 됨)
   │  │  │  └─ _lib/
   │  │  │     ├─ queries.ts      # 'server-only' import
   │  │  │     └─ actions.ts      # 'use server'
   │  │  └─ proposals/[id]/page.tsx
   │  ├─ (auth)/
   │  │  ├─ login/page.tsx
   │  │  └─ signup/page.tsx
   │  └─ api/                     # Route Handler 전용 (웹훅, OAuth 콜백 등)
   │     └─ webhooks/stripe/route.ts
   ├─ components/
   │  └─ ui/                      # shadcn 생성 프리미티브
   ├─ features/                   # 기능 단위 모듈 (앱이 커지면 분리)
   │  └─ proposals/
   │     ├─ schema.ts             # zod 스키마 (서버/클라 공유)
   │     ├─ actions.ts            # 'use server'
   │     ├─ queries.ts            # 'server-only'
   │     └─ ui/
   ├─ lib/
   │  ├─ utils.ts                 # cn() 등
   │  └─ env.ts                   # @t3-oss/env-nextjs (zod 검증)
   ├─ server/                     # 서버 전용 모듈
   │  ├─ auth.ts                  # 인증 인스턴스 (예: Better Auth)
   │  ├─ db.ts                    # ORM 클라이언트 (drizzle/prisma)
   │  └─ dal.ts                   # Data Access Layer (세션 검증 + 쿼리)
   ├─ db/
   │  └─ schema.ts                # ORM 스키마
   └─ types/
      └─ index.ts
```

**규칙**

- **`_components`, `_lib`** (private folder) → 해당 라우트에서만 쓰는 컴포넌트/로직 콜로케이션. 언더스코어 prefix가 라우팅 시스템에서 제외시킴.
- **`(marketing)`, `(app)`** (route group) → URL에 영향 주지 않고 layout만 분리. `(app)`은 인증 가드, `(marketing)`은 공개 영역에 다른 chrome 적용.
- **`server/`** + 모든 파일에 `import 'server-only'` → 클라이언트 번들에 실수로 포함되면 빌드 실패. DB/세션을 다루는 모든 모듈의 표준.
- **`features/`** → 라우트와 직교(orthogonal)한 도메인 모듈. 각 도메인은 `schema.ts` (zod) + `queries.ts` (server-only read) + `actions.ts` (use server write).

---

## 2. 라우팅 패턴

### 2.1 파일 컨벤션

| 파일 | 역할 |
|---|---|
| `page.tsx` | 라우트 진입 페이지 |
| `layout.tsx` | 자식 트리를 감싸는 영구 UI (네비게이션 시 unmount 안 됨) |
| `template.tsx` | layout과 비슷하나 매 네비게이션마다 re-mount. 입장 애니메이션이 진짜 필요할 때만 |
| `loading.tsx` | 자동으로 `<Suspense>`로 page를 감쌈 → 스트리밍 |
| `error.tsx` | error boundary, **`'use client'` 필수**, `{ error, reset }` 받음 |
| `not-found.tsx` | `notFound()` 호출 또는 매칭 라우트 없을 때 |
| `default.tsx` | parallel route 슬롯의 fallback. **Next 16에선 모든 슬롯에 필수** |
| `route.ts` | Route Handler (REST 엔드포인트) |

### 2.2 고급 라우팅

- **Dynamic segment**: `[slug]`, `[[...optional]]`, `[...catchAll]`
- **Parallel route `@slot`**: 같은 layout에 여러 page를 슬롯에 끼움. 부모 layout이 `({ children, modal })`로 받음.
- **Intercepting route `(.)`, `(..)`, `(...)`**: 다른 라우트의 컨텍스트에서 렌더. 대표 패턴 — 모달:

```
app/(app)/
├─ @modal/
│  ├─ default.tsx                 # 필수 (보통 return null)
│  └─ (.)proposals/[id]/page.tsx  # /proposals/[id] 모달 버전
└─ proposals/[id]/page.tsx        # 직접 진입(새로고침 등)은 풀 페이지
```

### 2.3 ⚠️ Next 16 변경 — `params`, `searchParams`는 Promise

```tsx
// ❌ Next 14 / 16에서 throw
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params
}

// ✅ Next 16
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
}
```

같은 변경이 `cookies()`, `headers()`, `draftMode()`에도 적용됨 — 모두 `await` 필요.

---

## 3. Server Component vs Client Component

**기본 규칙: 모든 컴포넌트는 Server Component.** `"use client"` directive로 클라이언트로 명시 전환. 한번 `'use client'` 선언하면 그 파일에서 import한 모든 자식 컴포넌트도 클라이언트가 됨 (transitive).

### 3.1 Leaf-client 패턴 (표준)

데이터는 서버에서 fetch, 인터랙션이 필요한 leaf만 클라이언트:

```tsx
// app/(app)/dashboard/page.tsx — Server Component
import { listProposalsForUser } from '@/server/dal'
import { ProposalListInteractive } from './_components/proposal-list-interactive'

export default async function DashboardPage() {
  const proposals = await listProposalsForUser()
  return <ProposalListInteractive initial={proposals} />
}
```

```tsx
// app/(app)/dashboard/_components/proposal-list-interactive.tsx
'use client'
import { useState } from 'react'

export function ProposalListInteractive({ initial }: { initial: Proposal[] }) {
  const [filter, setFilter] = useState('')
  // ...필터 UI만 클라이언트
}
```

### 3.2 컴포지션 함정

- **클라이언트 컴포넌트는 서버 컴포넌트를 import 못 함.** 대신 `children` 등 prop으로 슬롯 주입은 가능 — "Server Component slot in client wrapper" 패턴.
- **Server → Client 경계로 함수, 클래스, 비-직렬화 객체 전달 금지.** 런타임 에러.
- **Server Component는 async 가능, Client Component는 async 불가.** 클라이언트에선 `use(promise)` 사용.
- 데이터 흐름은 항상 **서버에서 위 → 아래**. 클라이언트에서 fetch해서 lift-up하지 않음.

---

## 4. 데이터 fetching & 캐싱 (Next 16의 가장 큰 변화)

> 14/15 시절 튜토리얼이 가장 많이 틀리는 영역.

### 4.1 새 default: 아무것도 캐시하지 않음

```ts
// next.config.ts
import type { NextConfig } from 'next'
const config: NextConfig = {
  cacheComponents: true,   // 핵심 옵션 (구 experimental.dynamicIO)
  typedRoutes: true,
}
export default config
```

- **Next 14/15**: `fetch()`는 기본 캐시, 라우트는 기본 static.
- **Next 16 + `cacheComponents: true`**: 모든 것이 요청마다 dynamic. 캐시는 **명시적으로** `'use cache'`로 선언.

### 4.2 `'use cache'` directive

파일/함수/컴포넌트 단위로 적용. 컴파일러가 클로저 + 인자를 해시해 자동으로 캐시 키 생성.

```ts
import { cacheLife, cacheTag } from 'next/cache'

export async function getPartner(id: string) {
  'use cache'
  cacheTag(`partner-${id}`)
  cacheLife('hours')
  return db.partners.findById(id)
}
```

- `cacheLife`: built-in profile (`'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'`) 또는 `next.config`에 정의한 커스텀.
  - 세 가지 시점: `stale`(클라가 재확인 없이 사용 가능), `revalidate`(백그라운드 재검증), `expire`(반드시 새로 받아야 함).
- `cacheTag`: bulk 무효화용 태그 (≤ 256자, case-sensitive).
- `'use cache: private'`: 사용자별 캐싱 (Next 16.2).

### 4.3 무효화 API (Next 16 재정비)

| API | 용도 | 비고 |
|---|---|---|
| `revalidateTag(tag, profile)` | 일반 무효화 (stale-while-revalidate) | **2번째 인자 필수**. 1-arg 형태 deprecated |
| `updateTag(tag)` | **Server Actions 전용**, read-your-writes | 같은 요청에서 즉시 fresh 데이터 반영 |
| `refresh()` | **Server Actions 전용**, uncached dynamic만 다시 렌더 | 캐시 건드리지 않음 |
| `revalidatePath(path)` | 경로 기반 무효화 | 무거운 망치, 가능하면 tag 우선 |

**선택 기준**: 폼 제출 후 사용자가 즉시 결과를 봐야 하면 `updateTag`. 게시판 목록처럼 "결국 일관성"이면 `revalidateTag`.

### 4.4 `unstable_cache` 상태

`'use cache'`로 사실상 대체됨. back-compat로 export는 유지되나 신규 코드에서 쓰지 않음. `cacheLife`/`cacheTag`는 `unstable_` prefix가 떨어져 정식 stable.

---

## 5. Mutation (Server Actions)

전체 패턴 — zod 검증 + read-your-writes + 점진적 향상(JS 없이도 동작):

```ts
// src/features/proposals/schema.ts
import { z } from 'zod'

export const RequestProposalSchema = z.object({
  partnerId: z.string().min(1),
  message: z.string().min(10).max(1000),
})

export type RequestProposalState =
  | { errors?: Record<string, string[]>; message?: string }
  | undefined
```

```ts
// src/features/proposals/actions.ts
'use server'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { RequestProposalSchema, RequestProposalState } from './schema'
import { requireSession } from '@/server/dal'

export async function requestProposal(
  _prev: RequestProposalState,
  formData: FormData,
): Promise<RequestProposalState> {
  const session = await requireSession()

  const parsed = RequestProposalSchema.safeParse({
    partnerId: formData.get('partnerId'),
    message: formData.get('message'),
  })
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  const proposal = await db.proposals.create({
    customerId: session.userId,
    ...parsed.data,
  })

  updateTag(`user-${session.userId}-proposals`) // read-your-writes
  redirect(`/proposals/${proposal.id}`)
}
```

```tsx
// src/app/(app)/partners/[id]/_components/request-form.tsx
'use client'
import { useActionState } from 'react'
import { requestProposal } from '@/features/proposals/actions'

export function RequestProposalForm({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(requestProposal, undefined)
  return (
    <form action={action}>
      <input type="hidden" name="partnerId" value={partnerId} />
      <textarea name="message" />
      {state?.errors?.message && <p>{state.errors.message[0]}</p>}
      <button disabled={pending}>제안 요청</button>
    </form>
  )
}
```

**Server Action vs Route Handler**

| 호출 주체 | 선택 |
|---|---|
| 우리 React 앱 (form, button) | **Server Action** — 타입 안전, 단일 round-trip, 점진적 향상 |
| 외부 (Stripe 웹훅, OAuth 콜백, 모바일 클라, 파일 스트리밍) | **Route Handler** (`app/api/.../route.ts`) |

---

## 6. Form & 검증

2026년 컨센서스: **단계적 접근**.

1. **기본**: `useActionState` + zod `safeParse` (서버 측). 의존성 최소, 점진적 향상 무료. MVP 폼 80%는 이걸로 충분.
2. **`useFormStatus`** 추가 — 자손 컴포넌트가 prop drilling 없이 `pending` 알아야 할 때.
3. **`useOptimistic`** 추가 — 채팅/리스트처럼 즉시 반응 UI. 액션 실패 시 React가 자동 롤백.
4. **react-hook-form + zod resolver** — 5+ 필드, cross-field 검증, 키 입력마다 검증, `useFieldArray` 등 복잡 시나리오. 같은 zod 스키마를 서버 액션에서 재사용.

이 프로젝트(가입, 제안 요청, 프로필 정도): `useActionState`만으로 시작. 폼이 복잡해지면 RHF 도입.

---

## 7. Middleware / Proxy & 인증

### 7.1 파일명 — `middleware.ts` (Next 16 + Turbopack 워크어라운드)

Next 16 공식 컨벤션은 `proxy.ts` + `export function proxy`. 그러나 **16.2.4 + Turbopack 에서 proxy.ts 가 build manifest 에 등록되지 않는 버그**가 있어, 현재 프로젝트는 **legacy `middleware.ts` + `export async function middleware`** 를 사용. Production build (`pnpm build` / `pnpm start`) 에서는 정상 작동, dev mode (`pnpm dev`) Turbopack 에서는 middleware 자체가 안 돌지만 보안 검증은 production 모드로 수행. 버그 수정 시 `npx @next/codemod@canary middleware-to-proxy` 로 일괄 변환 가능.

Node.js 런타임 전용 (Edge 불가).

### 7.2 ⚠️ middleware 를 인증 boundary 로 쓰지 말 것 (하지만 optimistic 차단은 필수)

공식 가이드: middleware 는 **optimistic redirect** (명백히 비로그인 사용자 튕기기) 용도. 실제 권한 검사는 **Server Component / Layout / Server Action 에서 DAL 호출** 로 수행.

**중요 (Next 16 PPR 제약)**: `cacheComponents: true` + PPR 모드에서 layout 의 `redirect()` 가 HTTP 307 이 아니라 1초 `<meta http-equiv="refresh">` fallback 으로 처리되어, 그 1초 동안 셸 HTML 이 응답에 노출되고 크롤러는 200 으로 인식해 색인할 수 있음 (실측 확인). 그래서 middleware 가 **optimistic 으로 Supabase 세션 cookie 부재 시 307** 을 쏘고, DAL 이 user + 역할 extension active 화이트리스트로 진짜 검증을 함. 두 레이어 모두 필수.

### 7.3 채택 — Supabase Auth + 역할 extension 화이트리스트

신규 프로젝트 권장은 Better Auth 지만, 이 프로젝트는 이미 Supabase Postgres 사용 중 + RLS 통합 이점 + Auth/Storage 일원화로 **Supabase Auth** 채택. 모든 역할 (일반/파트너/운영자) 은 단일 Supabase auth 풀을 공유하고, 우리 도메인 테이블 (`claim.user` + `claim.partner` / `claim.admin`) 이 역할 화이트리스트.

**사용자 모델 (1:1 extension, 다중 역할 가능):**

```
auth.users (Supabase 관리)
   │ 1:1 via user.authId (UUID, nullable — 첫 로그인 시 claim)
   ▼
claim.user (id=nanoid, email/name/phone[UNIQUE])
   │ 1:1 (PK 공유) — 한 사용자가 둘 다 가질 수 있음
   ├──▶ claim.partner (bio, yearsOfExperience, trustMetric, licenseNumber, active)
   │       │ 1:1 (PK 공유)
   │       ├──▶ claim.partner_credit_balance  (잔액 + version)
   │       └──▶ claim.partner_match_stats     (exposure / selected / contacted 카운터)
   └──▶ claim.admin   (active, 추후 permissions)

claim.partner_invitation (임시) — partner 가입 진행 중 임시 보관
   ↓ 가입 완료 시 → user + partner 트랜잭션 INSERT + consumed 마킹
```

User 에는 role discriminator 컬럼이 없음 — 역할은 partner / admin extension row 존재(+active) 자체로 판정. 한 사용자가 partner + admin 둘 다 가질 수 있고, 각 require\*Session() 은 자신이 필요로 하는 extension 만 확인.

`User.authId` 가 nullable 인 이유 — admin 은 운영자가 Supabase 에서 직접 생성 + SQL 로 user/admin row 사전 등록 (authId=null) → 첫 비번 로그인 시 `signInAdmin` 이 email 로 매칭해 authId 채움. partner 는 그 사전 등록 단계를 거치지 않고, **`partner_invitation` → Kakao 가입 + 본인인증 통과 시점에 user/partner row 와 authId 가 단일 트랜잭션으로 INSERT** 되므로 authId 가 nullable 인 채로 유지되는 케이스가 거의 없음. authId mismatch (이미 다른 auth.users 와 매핑된 user 의 email 로 다른 Supabase 계정 로그인) 는 거부 — 운영자가 수동 정정.

**구조 (3단계 인증/권한):**

1. **인증 (authn)** — Supabase `auth.getUser()` (JWT 서버 검증). `server/supabase.ts` 의 `getSupabaseServerClient()` 가 단일 진입점.
2. **사용자 lookup** — `dal.ts:getOptionalUser()` 가 `claim.user where authId = auth.users.id` 로 도메인 user 조회. cache 로 same-request dedupe.
3. **권한 (authz)** — 역할별 `getOptional*Session()` 가 해당 extension row (`claim.admin` / `claim.partner`) 의 존재 + `active=true` 확인. 통과해야 세션 발급. `require*Session()` 는 null 시 각 영역 login 페이지로 redirect (admin: `/admin/login`, partner: `/partner/login`). 모든 보호 페이지 layout + 모든 mutation server action 진입부에서 호출.

**로그인 흐름:**

- **Admin** (`/admin/login`) — 이메일/비밀번호. `signInAdmin` action 이 `signInWithPassword` → user lookup → admin.active 검증 → authId claim → `/admin` 으로 redirect.
- **Partner — 로그인** (`/partner/login`) — 이미 가입한 partner. Kakao OAuth. `signInWithKakao` action 이 `signInWithOAuth` URL 반환 → Kakao 인증 → `/api/auth/callback` 라우트가 code→session 교환 + user lookup + partner.active 검증 → `?next` (middleware 가 미인증 진입 시 보존한 원 경로, 기본 `/partner`, `safeNextPath` 화이트리스트 통과한 것) 로 redirect.
- **Partner — 가입** (`/partner/signup/<invitation_token>`) — 아래 §7.4 참조.
- 등록 안 된 이메일은 두 흐름 모두 동일 에러 메시지 ("로그인에 실패했습니다." / "등록된 설계사 계정이 아닙니다.") 로 응답해 enumeration 방어.

### 7.4 Partner 가입 — invitation 경유 single source

partner 는 admin 처럼 사전 등록되지 않고 어드민이 발급한 **일회용 가입 초청 token** 으로만 가입. 어드민에 partner 직접 INSERT 액션 없음 (`createPartner` 없음 — `createPartnerInvitation` 만).

**흐름 (2단계, Kakao 먼저 → 본인인증) — 매 진입마다 새 OAuth:**

1. 어드민 `/admin/partners/new` 입력 → `createPartnerInvitation` 이 `claim.partner_invitation` row INSERT (name/phone/bio/.../active + token + expiresAt = now + `PARTNER_INVITATION_TTL_DAYS`). `linkedAuthId` 와 `phoneVerifiedAt` 은 NULL. user/partner row 없음.
2. 어드민이 `/admin/partners/invitations/<id>` 에서 가입 URL (`/partner/signup/<token>`) 복사 → 메신저로 설계사에게 전달.
3. 설계사가 링크 진입 → invitation 유효성 (미소비 + 미만료) 확인. **페이지는 `linkedAuthId` 보지 않고 항상 Step 1 ("카카오톡으로 시작") 노출** — 다른 카카오 계정으로 재시도해도 동일하게 시작.
4. `signUpWithKakao` action: 현재 Supabase 세션 `signOut()` (이전 진입의 잔여 세션 청소) → `signInWithOAuth` 에 `redirectTo=…?signup=<token>` + `queryParams.prompt=login` (Kakao SSO 우회 → 계정 선택 강제).
5. Kakao 인증 후 `/api/auth/callback?signup=<token>` 진입 — **invitation lock 갱신만 책임**:
   - `exchangeCodeForSession` → session cookie
   - 단일 `updateMany WHERE token = ? AND consumedAt IS NULL AND expiresAt > now()` 로 invitation 유효성 + lock 갱신을 한 쿼리에. updated.count === 0 이면 `signOut` + signup 페이지로 redirect (token 무효).
   - `linkedAuthId` 는 매번 현재 `authUser.id` 로 **무조건 덮어씀** (이전 lock 무시). `phoneVerifiedAt` 도 NULL 리셋 — 새 계정 진입이면 본인인증 다시 받도록.
   - **user/partner INSERT 안 함.** 콜백 책임은 lock 갱신 + `/partner/signup/<token>/verify` 로 forward.
6. `/partner/signup/<token>/verify` 진입 — 페이지 가드: Kakao 세션 존재 + `invitation.linkedAuthId === authUser.id` 매칭. mismatch (다른 탭이 같은 링크로 새 OAuth 해 lock 옮긴 경우 등) 면 `signOut` + Step 1 으로 silent redirect (별도 에러 안내 X). 통과 시 휴대폰 OTP 폼 노출: name + invitation.phone prefill (readonly), "인증번호 전송" → `requestPartnerSignupOtp` 가 알리고로 6자리 SMS 발송 + Redis 에 `otp:partner-signup:{invitationId}` EX=180 저장. 같은 IP 의 발송 시도는 `otp:rl:{ip}` 로 60분 5회 제한 (마케팅 OTP 와 카운터 공유). `ALIGO_TEST_MODE=Y` 일 땐 코드 "000000" 고정 + 알리고 호출 생략.
7. `verifyPartnerSignupOtp` action 이 **가입 트랜잭션의 owner** — Redis 코드 GET 일치 시 즉시 DEL (재사용 차단) + Kakao 세션 + `linkedAuthId` 매칭 + tx 안 재확인 (소비 / 만료 / `linkedAuthId` 셋 모두 → race-safe) 후 단일 트랜잭션으로:
   - `user` (authId=kakao, email=kakao, name/phone=invitation)
   - `partner` (invitation 의 partner 필드들)
   - invitation 소비 (`consumedAt`, `consumedUserId`, `phoneVerifiedAt` audit)
   - 성공 → `/partner` redirect.

**재발급/삭제** — `/admin/partners/invitations/<id>` 에서 `reissuePartnerInvitationToken` (token 회전 + expiresAt 갱신; 부수적으로 `linkedAuthId` / `phoneVerifiedAt` NULL 리셋 — 어차피 다음 진입이 덮어쓰므로 cleanliness 목적) / `deletePartnerInvitation` (미소비만). 소비된 invitation 은 audit 용 보존.

**race-safety** —
- 콜백의 lock 갱신: `updateMany WHERE token = ? AND consumedAt IS NULL AND expiresAt > now()`. 가입 트랜잭션이 먼저 `consumedAt` 채우면 이후 콜백은 no-op (이미 consumed 인 invitation 의 lock 을 못 옮김).
- verify 액션 가입 트랜잭션 안 재조회: `consumedAt IS NULL AND linkedAuthId = authUser.id AND expiresAt > now()`. 동시 verify 호출 시 한쪽만 user/partner INSERT 도달. 다른 탭에서 새 OAuth 해 lock 이 옮겨갔다면 stale tab 의 verify 는 여기서 reject.
- `user.phone` / `user.authId` / `partner.licenseNumber` UNIQUE 가 추가 방어. 충돌 시 verify action 이 사용자에게 안내 메시지 반환.

**보안 의도 — Kakao 계정은 보안 게이트가 아님:**
- Token URL = 1차 게이트 (192bit nanoid, 추측 불가). 휴대폰 OTP (알리고 SMS 발송 대상 = invitation.phone) = 진짜 게이트 — invitation 소유자만 코드 수신 가능.
- Kakao 계정은 "가입 후 어떤 계정으로 로그인할지" 결정하는 수단일 뿐. `linkedAuthId` 는 매 진입마다 덮어쓰므로 다른 카카오 계정으로 같은 invitation 재시도 가능.
- verify 페이지/액션의 `linkedAuthId === authUser.id` 매칭은 횡령 방지가 아니라 "최신 OAuth 한 브라우저 컨텍스트가 verify 한다" 는 일관성 검증 — 다른 탭이 lock 을 옮겼다면 stale 세션을 reject.
- 가입 트랜잭션 시점이 본인인증 통과 시점과 동일 → user 만 있고 partner 없는 partial state 가 절대 발생 안 함.

**외부 의존**:
- **Kakao Developers**: "카카오계정(이메일)" 동의항목 필수 (`?error=no_email` 방지). Kakao 자체는 전화번호를 제공하지 않으므로 phone scope 는 불필요 — phone 검증은 휴대폰 OTP 가 책임.
- **알리고 SMS / LMS**: env `ALIGO_KEY` / `ALIGO_USER_ID` / `ALIGO_SENDER` / `ALIGO_TEST_MODE`. `server/aligo.ts` 가 두 export 제공 — `sendOtpSms` (휴대폰 OTP, 마케팅 요청서 + 설계사 가입 공용) / `sendNotificationLms` (URL 포함 사용자 알림 — 분석 완료, 신규 배정, 연락 요청 세 시점). dev 에선 `ALIGO_TEST_MODE=Y` → OTP 는 코드 "000000" 고정 + 발송 생략, LMS 는 함수 내부 console.log 만. 운영 (Vercel) 에선 egress IP 가 동적이라 알리고 whitelist 통과 불가 → `ALIGO_PROXY_URL` + `ALIGO_PROXY_SECRET` 으로 고정 IP 프록시 경유 ([infra/aligo-proxy/](../infra/aligo-proxy/) — Lightsail + Caddy + Node forward proxy).
- **Redis**: 백엔드 자동 선택 (`src/server/redis.ts`) — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 있으면 Upstash REST (prod / serverless), 그 외 `REDIS_URL` 로 ioredis (로컬 Docker). OTP 코드 (`otp:partner-signup:{invitationId}`, EX 180s) + IP 발송 시도 카운터 (`otp:rl:{ip}`, EX 3600s, 마케팅과 카운터 공유) 보관. 카운터는 `OTP_RATE_LIMIT_DISABLED=Y` env 로 우회 가능 (load test / 스테이징).

**경로 은닉 (admin 만, defense in depth, optional)** — `ADMIN_KNOCK_PATH` env 가 설정되면 middleware 가:
- `/<KNOCK>` 진입 시 `admin_knock` 쿠키 (30일) 발급 후 307 → /admin/login
- `/admin/*` 요청에 유효한 쿠키 없으면 **404** (admin 존재 자체 부정)

obscurity 이지 보안 아님. MFA / IP 화이트리스트 와 병행 권장. 자세한 건 [src/app/admin/CLAUDE.md](../src/app/admin/CLAUDE.md). partner 영역은 가입자/마케팅과 동등 노출 정책이라 knock/X-Robots-Tag 모두 적용 안 함.

**알림톡 토큰 진입 (partner 만)** — `/partner/assignments/[token]` 은 PRD §5.4 일회용 토큰 인증. middleware carve-out + 페이지에서 token → assignment lookup 으로 처리. 로그인과 무관하게 작동 — 토큰 자체가 인증이고, partner 도메인의 1차 흐름.

**검색 엔진 색인 차단 (admin 만)** — middleware 가 `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` HTTP 헤더를 모든 `/admin/*` 응답 + 404 응답 + knock 응답에 자동 부착. `src/app/admin/layout.tsx` 의 `metadata.robots` 가 `<meta name="robots">` 로 이중 방어. robots.txt 에 `Disallow: /admin` 은 의도적으로 추가하지 않음 — 경로 존재를 노출하는 역효과.

---

## 8. 스타일 — Tailwind v4 + shadcn Nova

### 8.1 Tailwind v4 변화

- `tailwind.config.ts` **없음**. 모든 테마는 CSS의 `@theme {}`에 선언.
- `@tailwind base/components/utilities` 3 줄 → `@import "tailwindcss"` 한 줄.
- 엔진 Rust 재작성 ("Oxide"), 빌드 속도 향상.
- 기본 팔레트가 **OKLCH**.

```css
/* src/app/globals.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --radius: 0.5rem;
}
.dark {
  --background: oklch(0.145 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --radius-lg: var(--radius);
}
```

### 8.2 shadcn Nova preset 주의점

- **Base UI 기반** (Radix 아님). 가장 큰 차이: `asChild` 대신 **`render` prop**.

```tsx
// ❌ Radix 시절 / 옛 shadcn
<Button asChild><Link href="/foo">Go</Link></Button>

// ✅ Nova / Base UI
<Button render={<Link href="/foo" />}>Go</Button>
// 또는: buttonVariants() className을 Link에 직접
<Link href="/foo" className={buttonVariants()}>Go</Link>
```

- `components.json`의 `tailwind.config` 필드는 **빈 문자열**(`""`)로.
- shadcn CLI v4 (2026-03)부터 Radix/Base UI 모두 지원. `shadcn apply` (2026-04)로 기존 컴포넌트에 preset/테마 변경 재적용 가능.

### 8.3 한글 폰트

`app/layout.tsx`에서 `next/font/google`로 Pretendard 등 로드 → Tailwind theme 변수에 노출.

---

## 9. State 관리 — 라이브러리 추가 기준

선호 순서 (왼쪽부터 먼저 시도):

1. **Server Component + props** — 서버가 이미 아는 데이터.
2. **URL state (`searchParams`)** — 필터, 탭, 페이지네이션, 모달 open. 새로고침/공유/인덱싱 가능.
3. **`nuqs`** — URL state를 `useState` 같은 API로. 6kB, 타입 안전, RSC 깊이 무관 (prop drilling 없음). **필터/검색 UI 디폴트 추천.**
4. **`useState` / `useReducer`** — 로컬 UI 상태.
5. **React Context** — 트리 전반 클라이언트 상태에 진짜 Provider 의미가 필요할 때 (theme, locale).
6. **Zustand** — 여러 클라이언트 island가 공유하는 client-only 상태 + URL에 안 맞을 때만. (Node 서버 렌더 시 store factory로 per-request 분리 주의.)
7. **TanStack Query** — 클라이언트 주도 fetching이 진짜 많을 때 (cursor 무한스크롤, 폴링). Server Action + `updateTag` + `refresh`로 대부분 해결됨.

이 프로젝트: **searchParams/nuqs로 설계사 목록 필터, 그 외엔 useState.** 처음부터 Zustand 깔지 말 것.

---

## 10. 타입 안전 boundary

세 레이어:

- **`typedRoutes: true`** — Next 16에서 stable. `<Link href="/foo">`, `router.push('/foo')`가 컴파일 타임에 파일 시스템 기반 검증.
- **zod**: 신뢰 경계마다 — Server Action 입력, Route Handler body, 외부 API 응답, 환경 변수 (`@t3-oss/env-nextjs`로 wrap, `server`/`client` 스키마 분리).
- **TypeScript**: 그 외 전부. zod 스키마는 `z.infer<typeof Schema>`로 타입 derive, 액션과 폼이 같은 타입 공유.

---

## 11. 테스트

**스택**: Vitest + RTL (unit/component) + Playwright (E2E). 신규 Next 프로젝트에서 Jest는 더 이상 추천 안 함.

| 대상 | 도구 | 비고 |
|---|---|---|
| 순수 함수, zod 스키마, 포매터 | Vitest | `*.test.ts` 콜로케이션 |
| Client Component | Vitest + RTL (jsdom) | Server Action mock, 인터랙션만 검증 |
| Async Server Component | E2E or 데이터 함수 직접 테스트 | jsdom에서 async RSC 렌더링 미지원 (현재) |
| Route Handler | Vitest | `Request` mock으로 직접 호출 |
| 풀 사용자 플로우 | Playwright | `next start` 띄우고 hydration 포함 |

---

## 12. 성능

### `<Image>` 변경 (Next 16)

- `minimumCacheTTL` 기본값 4시간 (이전 60초)
- `images.qualities` 기본 `[75]`만 (이전 1..100 전체)
- **`quality` prop 필수** (또는 default 수용)
- `priority` deprecated → **`preload`**
- 로컬 이미지 + query string은 `images.localPatterns` 설정 필요 (enumeration 공격 방지)
- `images.domains` deprecated → **`images.remotePatterns`**

### `<Link>` prefetching

`prefetch="auto"` 기본 — static 라우트는 풀 prefetch, dynamic 라우트는 가장 가까운 `loading.tsx`까지. viewport 벗어나면 취소, hover 시 재우선순위. **prefetch 요청 수는 늘지만 페이로드 총량은 줄어듦.**

### 스트리밍

- 페이지 전체: `loading.tsx` (자동 Suspense wrap)
- 카드/리스트 단위: `<Suspense>` 직접 사용
- `cacheComponents` + Suspense → 정적 shell 즉시 + dynamic island 점진 스트리밍

### Partial Prerendering

**Next 16에서 stable** (Cache Components 산하). 옛 `experimental.ppr` 플래그, `experimental_ppr` route segment 옵션 제거됨.

### React Compiler

Next 16에서 stable, opt-in (`reactCompiler: true`). Babel 기반이라 빌드 느려짐. MVP 단계에선 보류.

---

## 13. 배포

| 옵션 | 추천 시나리오 |
|---|---|
| **Vercel** | MVP 디폴트. zero-config, 스트리밍/ISR/proxy.ts 모두 동작. Seoul region: `icn1` |
| **Self-host (`output: 'standalone'`)** | 비용/데이터 주권 우선. Docker 이미지 가능. ⚠️ Next 16.1.x에서 Turbopack 빌드 시 `serverExternalPackages`가 standalone에 누락되는 이슈 — 해결 전엔 `next build --webpack`로 우회 |

### 환경 변수

- `NEXT_PUBLIC_*` → 클라이언트 노출, 그 외 서버 전용.
- `@t3-oss/env-nextjs`로 zod 검증 → 빠진 변수가 있으면 첫 요청이 아니라 **부팅 시점에 fail**.
- `serverRuntimeConfig` / `publicRuntimeConfig`는 **Next 16에서 제거**. `.env`만 사용.

---

## 14. ⚠️ Next 16에서 바뀐 것 (옛 튜토리얼 경계 리스트)

옛 (14/15) 자료를 그대로 따라가면 틀리는 항목:

| 옛 (14/15) | 새 (16) |
|---|---|
| `cookies()`, `headers()`, `params`, `searchParams` 동기 | **모두 async, `await` 필요** |
| `fetch()` 기본 캐시 | `cacheComponents: true`면 기본 dynamic, `'use cache'`로 opt-in |
| `experimental.ppr` | **제거** — `cacheComponents: true` 사용 |
| `experimental.dynamicIO` | **`cacheComponents`로 이름 변경** |
| `unstable_cache`, `unstable_cacheLife`, `unstable_cacheTag` | `cacheLife`/`cacheTag`는 stable, `unstable_cache`는 사실상 대체됨 |
| `revalidateTag(tag)` | **`revalidateTag(tag, profile)`** — 1-arg 형태 deprecated |
| (없음) | **`updateTag(tag)`** — Server Action read-your-writes |
| (없음) | **`refresh()`** — uncached dynamic만 재렌더 |
| `middleware.ts` (Edge) | **`proxy.ts`** (Node 전용) — 단 16.2.4 Turbopack 버그로 현재는 `middleware.ts` 사용 (§7.1) |
| webpack 디폴트 | **Turbopack 디폴트**, webpack은 `--webpack` |
| `experimental.typedRoutes` | **`typedRoutes: true`** (top-level stable) |
| `next lint` | **제거** — ESLint/Biome 직접 호출 |
| AMP 지원 | 완전 제거 |
| `images.domains` | `images.remotePatterns` |
| `<Image priority>` | `<Image preload>` |
| `<Image>` 기본 qualities `[1..100]` | `[75]` |
| `serverRuntimeConfig` / `publicRuntimeConfig` | 제거, `.env` 사용 |
| Parallel slot에 `default.tsx` 없어도 됨 | **빌드 실패** — 모든 슬롯에 `default.tsx` 필수 |
| `scroll-behavior: smooth` 자동 | `data-scroll-behavior="smooth"` 명시 opt-in |
| Node 18 | Node ≥ 20.9 |
| React 18.x | React 19.2+ |
| Lucia 인증 | Deprecated → **Better Auth** |

---

## 15. 이 프로젝트에 즉시 적용할 항목

MVP 단계에서 바로 잡고 갈 결정:

1. **`next.config.ts`에 `cacheComponents: true`, `typedRoutes: true` 추가.**
2. **`src/server/dal.ts`** 만들어서 mock 데이터 접근도 DAL 시그니처로 통일 (DB 붙이면 구현만 교체).
3. **route group 도입**: `(marketing)` (랜딩/설계사 둘러보기) vs `(app)` (제안서 관리).
4. **`features/proposals/` + `features/partners/`** 분리, 각 폴더에 `schema.ts` (zod) / `actions.ts` (`'use server'`) / `queries.ts` (`'server-only'`).
5. **shadcn 사용 시 `render` prop 패턴** 통일 (이미 [src/app/page.tsx](../src/app/page.tsx)에서 `buttonVariants()` 사용 중).
6. **검색/필터는 `nuqs`** 도입 검토. Zustand는 보류.
7. **`@t3-oss/env-nextjs`** 도입 — env 검증을 처음부터 강제.
8. 인증 시점 결정 시 **Better Auth** 후보 1순위.

---

## 부록 — 출처

주요 검증 출처 (최신 공식 docs + 2026 커뮤니티):

- Next.js 16 release blog, 16 Upgrade Guide, Project Structure, `'use cache'`/`cacheLife`/`cacheTag`/`cacheComponents` reference
- Next.js Forms guide, Authentication guide, Parallel Routes, `proxy.ts` convention, Prefetching guide, Image reference
- React 19 release post, `useActionState`/`useOptimistic` reference
- shadcn/ui Tailwind v4 docs, CLI v4 changelog (2026-03), `shadcn apply` (2026-04), components.json reference
- Better Auth Next.js integration docs
- LogRocket: "Best auth library for Next.js in 2026", "What's new in Next.js 16"
- nuqs documentation

---

## 불확실한 항목 (구현 시점 재확인)

- `unstable_cache`가 17.x에서 export 유지될지는 미확정.
- `'use cache: private'` (사용자별 캐싱)와 Server Action 상호작용 — 공식 docs 재확인 권장.
- Standalone + Turbopack의 `serverExternalPackages` 누락 이슈는 16.3+에서 수정 가능성.
- Vitest의 async RSC 렌더링 지원이 향후 개선될 수 있음 — 현재는 E2E에 의존.
