# ADR-0004: DAL 이 진짜 인증 boundary, middleware 는 optimistic-only

**Status**: Accepted  
**Date**: 2026-05-28 (backfill — 실제 도입은 그 이전)  
**Supersedes**: -  
**Superseded by**: -

## Context

Next.js 의 전형적 패턴은 `middleware.ts` 가 인증 boundary — 비로그인 요청을 진입 단계에서 리다이렉트. 이 프로젝트에서 그게 안 되는 이유 두 가지:

1. **Next 16 + Turbopack dev 에서 middleware 가 실행되지 않을 수 있음** (메모리: [project_middleware_not_run_in_turbopack_dev]). dev 환경에서 false confidence — 보안 boundary 가 실제로 안 도는데 돌고 있다고 착각.
2. **Server Actions 는 middleware 를 거치지 않음** — middleware 만 의존하면 actions 호출 시점에 인증이 검증되지 않음. 클라이언트가 직접 form action 을 호출하면 우회.

또한 `layout.tsx` 의 인증 체크도 actions 에는 적용 안 됨 — RSC layout 는 페이지 렌더 전 한 번만 실행되고, 그 후 발생하는 server action 호출은 별도 요청.

## Decision

**인증 boundary 는 DAL** ([src/server/dal.ts](../../src/server/dal.ts)). middleware 는 optimistic UX 기능만.

### DAL 의 책임 (진짜 boundary)

- `requireAdminSession()` / `requirePartnerSession()` — 인증 실패 시 throw / redirect
- `getOptionalAdminSession()` / `getOptionalPartnerSession()` — null 허용 조회
- `getOptionalUser()` — React.cache 로 same-request dedup
- **모든 server action 진입부에서 명시 호출 필수** — actions 가 호출되는 모든 경로 (form, fetch, RSC) 에 대해 단일 게이트

### Middleware 의 책임 ([middleware.ts](../../middleware.ts))

- **Optimistic 리다이렉트** — 쿠키 없으면 로그인 페이지로 (UX, 보안 아님)
- **Knock 게이트** — `/admin/*` 진입 전 obscurity path 방문 + 30일 쿠키
- **`X-Robots-Tag`** — admin + non-production 환경에서 색인 방지
- **Stale auth cookie 정리** — refresh 실패 시 명시 청소
- **Partner 공개 경로 carve-out** — `/partner/login`, `/partner/plan-request-assignments/*` 등

명시적으로 *하지 않는* 것: **권한 검증**. middleware 가 통과시켜도 DAL 이 거부하면 차단.

### 검증의 보강

- TypeScript 강제 못함 — `requireAdminSession()` 호출 빼먹어도 컴파일 통과. ESLint custom rule 없음.
- 약한 강제 메커니즘: 모든 server action 첫 줄에 DAL 호출이라는 패턴, [src/features/CLAUDE.md](../../src/features/CLAUDE.md) 가 명문화.

## Consequences

### 긍정
- dev/prod 환경 동일 보안 — middleware 가 안 도는 turbopack dev 에서도 DAL 은 매 호출 실행
- Server Action 우회 불가 — actions 호출 시점에 무조건 검증
- React.cache 로 same-request dedup — n+1 인증 쿼리 없음
- DAL 이 user + extension (Partner/Admin) 을 한 곳에서 조립 — 권한 모델 변경 시 단일 변경점

### 트레이드오프
- **개발자 (사람/AI) 가 매번 명시 호출** — 빼먹으면 무방비. 컴파일러가 못 잡음.
- middleware 가 보안 안 한다는 사실이 직관에 반함 — 새 Claude 가 옛 튜토리얼 따라 middleware 에 인증 로직 넣을 위험 (CLAUDE.md 에 명시했지만 약한 가드)
- Action 별로 어떤 DAL 함수를 부를지 매번 판단 (admin? partner? both?)

### 후속 영향
- [src/server/CLAUDE.md](../../src/server/CLAUDE.md) 와 [src/features/CLAUDE.md](../../src/features/CLAUDE.md) 에 "actions 진입부에서 DAL 호출 필수" 명문화 유지
- `/pr-self-review` 가 새 server action 에서 DAL 호출 누락을 finding 으로 잡도록 정책 ([CLAUDE.md "PR 만들기 전 필수 절차"](../../CLAUDE.md))
- 향후 ESLint custom rule 또는 codemod 도입 시 ADR 갱신
- 향후 middleware 가 turbopack dev 에서도 안정 실행되면 ([Next 16.2.4 + turbopack 회귀 이슈](#)) 일부 책임 위임 검토 — 새 ADR 로

## Alternatives considered

| 대안 | 왜 안 골랐는가 |
|---|---|
| middleware 기반 boundary (전통 Next 패턴) | Turbopack dev 에서 실행 안 됨 → false confidence. Server Actions 우회 가능. |
| layout 기반 boundary | Actions 는 layout 의 인증 체크 거치지 않음 — 우회 가능 |
| API route 만 사용하고 middleware 로 보호 | Server Actions / Server Components 의 RSC 흐름 포기 — Next 16 사상과 충돌 |
| HOC 패턴 (`withAuth(action)`) | 가능하지만 모든 action import 가 wrap 필요 — 한 줄 호출보다 무거움. 추가로 React.cache 와 조합 어려움. |
| Supabase RLS 만으로 처리 | 모든 쿼리가 RLS 통과 가정 가능하지만 — Prisma 직결 모델 (Auth 만 Supabase) 에서는 SQL 레벨 RLS 가 적용 안 되는 쿼리 다수 |

## References

- DAL 구현: [src/server/dal.ts](../../src/server/dal.ts)
- Middleware 구현: [middleware.ts](../../middleware.ts)
- 정책 문서: [src/server/CLAUDE.md](../../src/server/CLAUDE.md), [src/features/CLAUDE.md](../../src/features/CLAUDE.md)
- Admin 관련 추가 정책: [src/app/admin/CLAUDE.md](../../src/app/admin/CLAUDE.md)
- 관련 메모리: `[[project_middleware_not_run_in_turbopack_dev]]`
- 관련 ADR: [[0002-pr-quality-gate]] — finding 으로 누락 탐지
