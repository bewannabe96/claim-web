# src/app/ — App Router

## 절대 규칙

1. **`params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`는 모두 Promise.** 반드시 `await`. 동기 사용은 런타임 throw.
2. **모든 컴포넌트는 기본 Server Component.** 인터랙션 필요한 leaf만 `'use client'`.
3. **데이터 fetch는 서버에서.** 클라이언트에서 fetch해서 lift-up 하지 않음.
4. **Admin 인증 검사는 layout/page/action에서 DAL `requireAdminSession()` 호출로.** middleware (`middleware.ts`) 는 optimistic redirect 전용. 특히 server action 은 layout 게이트 통과 안 하므로 함수 진입부에서 직접 DAL 호출 필수. 가입자/설계사는 token 기반 — DAL 미사용, 액션이 `token → row` 조회 + status 검증으로 권한 판정.
5. **`<Link href>`는 typedRoutes 검증.** 동적 쿼리스트링은 URL 객체 형식: `href={{ pathname: "/partners", query: { category } }}`.

## 최상위 영역 분리

- `(marketing)/` — 비인증 영역. 가입자 흐름 (`request/new`, `request/[id]/...`, `result/[token]`) + 랜딩. 누구나 접근, `'use cache'` 적극 활용 가능.
- `partner/` — 설계사 영역. 현재 token 기반 (`assignments/[token]`) — 알림톡 일회용 토큰으로 진입. 별도 layout. (실 인증 도입 시 supabase auth + DAL 추가 예정.)
- `admin/` — 운영자 영역. `(dashboard)` route group 안에서 `requireAdminSession()` 가 boundary. login 페이지만 그룹 밖. 자세히는 [admin/CLAUDE.md](admin/CLAUDE.md).

새 페이지 만들 때: 가입자/공개 → `(marketing)/`, 설계사 → `partner/`, 운영자 → `admin/(dashboard)/`.

## 파일 컨벤션

| 파일 | 용도 | 주의 |
|---|---|---|
| `page.tsx` | 라우트 진입 | async 가능 |
| `layout.tsx` | 자식 wrap | 네비 시 unmount 안 됨 |
| `loading.tsx` | Suspense fallback | **cacheComponents 켜져있어 동적 페이지엔 사실상 필수** |
| `error.tsx` | error boundary | **`'use client'` 필수** |
| `not-found.tsx` | 404 | `notFound()` 호출 시 |
| `default.tsx` | parallel slot fallback | **모든 @slot에 필수, 빠지면 빌드 실패** |
| `route.ts` | REST 핸들러 | 외부 호출자(웹훅 등)용. 우리 앱 내부는 Server Action |
| `template.tsx` | re-mount 필요 시만 | 거의 안 씀 |

## 라우트 전용 코드 콜로케이션

- `_components/` — 이 라우트에서만 쓰는 클라이언트/서버 컴포넌트.
- `_lib/` — 이 라우트에서만 쓰는 헬퍼/쿼리.
- 언더스코어 prefix가 라우팅 시스템에서 제외시킴. **라우트 폴더 안에 다른 이름의 폴더(`utils/`, `helpers/`) 만들지 말 것.**

여러 라우트가 공유하면 `features/<도메인>/`로 옮길 것.

## ❌ 흔한 실수

- `params`, `searchParams`를 `await` 없이 구조분해
- Server Component를 Client Component에 import (반대로 `children` prop으로 주입은 OK)
- Server → Client 경계로 함수/클래스/Date 객체 전달
- `<Image priority>` (deprecated → `preload`), `images.domains` (→ `remotePatterns`)
- middleware/proxy 를 인증 boundary 로 사용 — DAL 이 진짜 boundary. middleware 는 optimistic 차단 + knock + X-Robots-Tag 만. (Next 16 공식 이름은 `proxy.ts` 지만 16.2.4 + Turbopack 버그로 현재 `middleware.ts` 사용)
- Server Action 안에서 `requireAdminSession()` 호출 누락 — layout 게이트는 페이지 렌더에만 적용되고 action 직접 호출에는 안 적용됨. **모든 admin action 함수 진입부에서 명시적 호출 필수.** (가입자/설계사 token 기반 액션은 진입부에서 token → row + status 검증이 같은 역할.)
