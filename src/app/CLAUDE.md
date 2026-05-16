# src/app/ — App Router

## 절대 규칙

1. **`params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`는 모두 Promise.** 반드시 `await`. 동기 사용은 런타임 throw.
2. **모든 컴포넌트는 기본 Server Component.** 인터랙션 필요한 leaf만 `'use client'`.
3. **데이터 fetch는 서버에서.** 클라이언트에서 fetch해서 lift-up 하지 않음.
4. **인증 검사는 layout/page/action에서 DAL(`requireSession()`) 호출로.** `proxy.ts`에 의존하지 않음.
5. **`<Link href>`는 typedRoutes 검증.** 동적 쿼리스트링은 URL 객체 형식: `href={{ pathname: "/partners", query: { category } }}`.

## 라우트 그룹 분리

- `(marketing)/` — 비인증 영역. 누구나 접근. 캐싱 적극 활용 가능.
- `(app)/` — 인증 영역. layout이 `requireSession()` 호출, 자식은 신뢰.
- `(auth)/` — 로그인/회원가입.

새 페이지 만들 때: 인증 필요 → `(app)/`, 그 외 → `(marketing)/`.

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
- middleware.ts 신규 생성 (→ `proxy.ts`, 그러나 인증 boundary로 쓰지 말 것)
