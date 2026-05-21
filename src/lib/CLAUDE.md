# lib/ — 순수 유틸리티

## 무엇이 들어가나

- **순수 함수만.** 사이드 이펙트 없음, 외부 의존성 없음(또는 npm 라이브러리만).
- 서버/클라이언트 양쪽에서 import 가능해야 함.
- 예: `cn()` (className merge), `formatCurrency()`, `parseQueryString()`, `dateRange()`.

## 무엇이 안 들어가나

- **서버 전용 코드** (DB, 세션 등) → `server/`
- **도메인 로직** (plan-proposals/partners 관련) → `features/<x>/`
- **React 컴포넌트** → `components/` 또는 `features/<x>/ui/`

## ❌ 흔한 실수

- `'server-only'` 또는 `'use client'` directive 추가 — `lib/`는 양쪽 호환이 원칙. 한쪽만 가능하면 잘못된 위치.
- `lib/api.ts`처럼 fetch 래퍼 만들기 — Server Component면 직접 fetch, Server Action이면 직접 호출. 추상화 레이어 추가하지 말 것.
- `lib/constants.ts`에 도메인 상수 (예: insurance category) 모으기 — 도메인 상수는 `types/` 또는 `features/<x>/`로.

## 새 유틸 추가 시

1. **이미 lodash/date-fns/zod에 있는 것 아닌가?** 있으면 그걸 import.
2. **두 곳 이상에서 진짜로 쓰이나?** 아니면 호출부에 인라인.
3. 파일 한 개에 한 함수 강제 X — 관련 함수 묶어도 OK (예: `format.ts`에 `formatCurrency`, `formatDate`).
