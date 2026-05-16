# Next.js 16 아키텍처 가이드

> Next.js 16 + React 19 + App Router + Turbopack + Tailwind v4 + shadcn/ui (Nova) + pnpm 기준의 권장 아키텍처.
> 이 프로젝트(보험 가입자 ↔ 설계사 매칭 MVP)에 적용할 표준 패턴을 정리합니다.

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
├─ proxy.ts                      # Next 16에서 middleware.ts 대체
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

## 7. Middleware → Proxy & 인증

### 7.1 `proxy.ts` (Next 16 신규)

`middleware.ts`는 **deprecated**, `proxy.ts`로 이름 변경. **Node.js 런타임 전용** (Edge 불가). geo redirect, A/B 라우팅, rewrite 같은 애플리케이션 레벨 관심사용.

```ts
// proxy.ts
import { NextRequest, NextResponse } from 'next/server'

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/old') {
    return NextResponse.redirect(new URL('/new', req.url))
  }
  return NextResponse.next()
}
export const config = { matcher: ['/((?!_next/|api/|favicon.ico).*)'] }
```

### 7.2 ⚠️ proxy를 인증 boundary로 쓰지 말 것

공식 가이드: proxy는 **optimistic redirect** (명백히 비로그인 사용자 튕기기) 용도. 실제 권한 검사는 **Server Component / Layout / Server Action에서 DAL 호출**로 수행. 이렇게 안 하면 "edge가 인가된 응답을 캐시한" 류의 보안 사고가 남.

### 7.3 인증 라이브러리 (2026 권장)

생태계가 크게 정리됨:

- **Lucia**: 2025-03 deprecated.
- **NextAuth/Auth.js**: 2025-09 Better Auth 팀이 메인테인 인계받음. 공식 가이드도 신규 프로젝트에 Better Auth 권장.
- **Better Auth** ✅ — TypeScript 추론 세션, DB 기반(즉시 invalidation), Next 16 `proxy.ts` 공식 지원. **자체 호스팅 신규 프로젝트의 디폴트.**
- **Clerk** — 호스티드, 한국어 친화 UI 컴포넌트 제공. MAU 단가 감수 가능하면.
- **Supabase Auth** — Supabase 쓰면 RLS와 통합.

이 프로젝트(데이터 소유 + 비용 예측 우선): **Better Auth** 추천.

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
| `middleware.ts` (Edge) | **`proxy.ts`** (Node 전용) |
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
