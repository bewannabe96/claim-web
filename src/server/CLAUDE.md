# server/ — 서버 전용 모듈

## 절대 규칙

1. **모든 파일 첫 줄에 `import "server-only"`.** 클라이언트 번들에 실수로 포함되면 빌드가 실패하도록 강제. 빠뜨리지 말 것.
2. **클라이언트에서 절대 import 금지.** Server Component / Server Action / Route Handler에서만.
3. **`server/`에서 client 모듈을 import하지 말 것** (cyclic, 의미 없음).

## 무엇이 들어가나

- `dal.ts` — Data Access Layer. **모든 인증 검사의 단일 진입점.**
- `auth.ts` (TODO) — 인증 인스턴스 (Better Auth 등). 인증 도입 시 추가.
- `db.ts` (TODO) — ORM 클라이언트 (drizzle/prisma). DB 도입 시 추가.

## DAL 사용 패턴

```ts
// 인증 필수 — 비로그인 시 자동 redirect
const session = await requireSession()

// 인증 선택 — 비로그인 시 null
const session = await getOptionalSession()
```

**모든 인증 검사는 DAL 호출로 통일.** `cookies().get('session')` 같은 raw 코드를 페이지/액션에서 직접 쓰지 말 것 — DAL이 추상화 boundary.

## features/<x>/queries.ts와의 관계

- `server/`는 **횡단 관심사** (auth, db client).
- `features/<x>/queries.ts`는 **도메인 쿼리** (특정 테이블/리소스).
- 도메인 쿼리도 `import "server-only"` 필수. server/와 동일한 보호.

## ❌ 안티패턴

- `server/queries.ts`라는 거대 파일 — 도메인별로 `features/<x>/queries.ts`에 분산.
- DAL을 우회해 raw cookies/headers 직접 읽기 — 보안 일관성 깨짐.
- DAL 함수가 throw 안 하고 boolean 반환 — 호출부에서 if 까먹으면 인증 없이 통과. **redirect/throw가 안전.**

## 인증 도입 시 (Better Auth 권장)

1. `pnpm add better-auth`
2. `server/auth.ts` 작성 (DB 연결 후).
3. `server/dal.ts`의 `getOptionalSession`이 `auth.api.getSession()` 호출하도록 교체.
4. 호출부 무수정 — 시그니처 동일.
