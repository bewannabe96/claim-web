# src/app/ — App Router

## 절대 규칙

1. **`params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`는 모두 Promise.** 반드시 `await`. 동기 사용은 런타임 throw.
2. **모든 컴포넌트는 기본 Server Component.** 인터랙션 필요한 leaf만 `'use client'`.
3. **데이터 fetch는 서버에서.** 클라이언트에서 fetch해서 lift-up 하지 않음.
4. **인증 검사는 layout/page/action에서 DAL(`requireAdminSession()` / `requirePartnerSession()`) 호출로.** middleware (`middleware.ts`) 는 optimistic redirect 전용. 특히 server action 은 layout 게이트 통과 안 하므로 함수 진입부에서 직접 DAL 호출 필수.
5. **`<Link href>`는 typedRoutes 검증.** 동적 쿼리스트링은 URL 객체 형식: `href={{ pathname: "/partners", query: { category } }}`.

## 최상위 영역 분리

- `(marketing)/` — 비인증. 가입자 wizard (`request/new`, `request/[id]/...`) + 결과 (`result/[token]`) + 랜딩. `'use cache'` 적극 활용 가능.
- `partner/` — 설계사. 두 진입 흐름이 공존: 알림톡 토큰 (`assignments/[token]`, 로그인 불필요) + 카카오 OAuth (`(dashboard)/`, `requirePartnerSession()` 가드).
- `admin/` — 운영자. login 페이지만 그룹 밖, `(dashboard)/` 안에서 `requireAdminSession()` 가 boundary. 자세히는 [admin/CLAUDE.md](admin/CLAUDE.md).

새 페이지 만들 때: 가입자/공개 → `(marketing)/`, 설계사 → `partner/(dashboard)/` (또는 토큰 진입은 `partner/` 직속), 운영자 → `admin/(dashboard)/`.

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
- Server Action 안에서 `requireAdminSession()` / `requirePartnerSession()` 호출 누락 — layout 게이트는 페이지 렌더에만 적용되고 action 직접 호출에는 안 적용됨. **모든 admin/partner action 함수 진입부에서 명시적 호출 필수.** (토큰 기반 가입자/설계사 액션은 token → row 조회 + status 검증이 같은 역할 — features/proposals/actions.ts 참조.)
