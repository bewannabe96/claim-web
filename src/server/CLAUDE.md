# server/ — 서버 전용 모듈

## 절대 규칙

1. **모든 파일 첫 줄에 `import "server-only"`.** 클라이언트 번들에 실수로 포함되면 빌드가 실패하도록 강제. 빠뜨리지 말 것.
2. **클라이언트에서 절대 import 금지.** Server Component / Server Action / Route Handler에서만.
3. **`server/`에서 client 모듈을 import하지 말 것** (cyclic, 의미 없음).

## 무엇이 들어가나

- `dal.ts` — Data Access Layer. **모든 인증 검사의 단일 진입점.**
- `auth.ts` (TODO) — 인증 인스턴스 (Supabase Auth 등). 인증 도입 시 추가.
- `db/` — DB 클라이언트 + 자동 생성 타입 + env 검증.
  - `db/supabase.ts` — service_role 키 기반 server 클라이언트 싱글톤.
  - `db/types.ts` — Supabase 가 자동 생성한 `Database` 타입. **수동 편집 금지** —
    스키마 바뀔 때마다 `mcp__plugin_supabase_supabase__generate_typescript_types` 또는
    `supabase gen types typescript` 로 재생성.
  - `db/env.ts` — 서버 환경 변수 zod 검증. `process.env` 직접 접근 금지.

## DB 컨벤션

- **모든 PK 는 app-side nanoid(16)** — 컬럼은 `id text primary key` (DB DEFAULT
  없음). INSERT 직전에 `newId()` (`@/lib/id`) 로 생성해 명시적으로 전달.
  - 16자 / 96비트 entropy / URL-safe alphabet (`a-zA-Z0-9_-`). 충돌 확률 사실상 0.
  - **타입 안전성**: 자동 생성 타입 의 `Insert` 가 `id: string` (필수) — 누락 시
    컴파일 에러. DB DEFAULT 가 있으면 `id?: string` 으로 약화돼 누락 가능.
  - **부모/자식 동시 build**: 부모 id 미리 생성 → 자식들 같은 id 로 build →
    한꺼번에 INSERT. RETURNING 라운드트립 불필요.
- **토큰 (result_token, OTP 등)** 은 더 긴 entropy 필요 → `newToken()` (32자, 192비트).
- **value/format/range 검증은 zod (앱 레이어) 단일 진실 공급원.** DB 의 CHECK
  제약은 추가하지 않음 — 스키마 변경 시 두 곳 동기화 부담 회피.
- **DB 는 구조 무결성만 책임** — PK / FK / NOT NULL / UNIQUE / RLS / DEFAULT.
- **race-safe 제약은 UNIQUE 인덱스로 표현** — 동시성 시점 이슈는 앱 레이어
  단독으론 못 막으므로 partial unique index 등으로 DB 레벨 백업 (예: phone
  중복 송부 방지, result_token 충돌 방지).
- **모든 테이블 RLS enabled + 정책 0** = anon/authenticated deny-by-default.
  REST API endpoint 는 살림 — 추후 client-side 가 필요해지면 정책만 추가.
  service_role 은 RLS bypass.

## DB 호출 패턴

```ts
// features/<x>/queries.ts
import "server-only";
import { supabase } from "@/server/db/supabase";

export async function getMatchRequestById(id: string) {
  const { data, error } = await supabase
    .from("match_request")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toMatchRequest(data) : null; // DB row → 도메인 타입 매핑 함수
}
```

**경계**: DB row 타입(snake_case)은 features/<x>/queries.ts 내부에 머물고, 페이지/
액션이 받는 건 항상 도메인 타입 (camelCase, zod 추론). 이 매핑 함수가 provider
교체 시 격리 지점.

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
