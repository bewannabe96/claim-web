# mocks/ — MVP 임시 데이터

## 존재 이유

DB 도입 전까지 [features/*/queries.ts](../features/) 가 읽을 데이터 소스. **DB 추가되면 이 폴더 통째로 삭제.**

## 절대 규칙

1. **mocks는 features의 queries.ts/actions.ts에서만 import.** 페이지/컴포넌트가 직접 mocks를 import하지 말 것 — 그러면 DB 교체 시 호출부 전부 수정해야 함.
2. **export하는 데이터의 타입은 [src/types/](../types/) 또는 [features/*/schema.ts](../features/)에서.** mock 전용 타입 만들지 말 것.
3. **변경 가능 (mutable) 사용 시 명시.** `MOCK_PROPOSALS`는 Server Action이 push함 — dev 서버 내에서만 유효, 재시작하면 초기 상태.

## DB 교체 절차

1. `pnpm add drizzle-orm postgres` (또는 prisma).
2. `src/server/db.ts` + `src/db/schema.ts` 작성.
3. `features/*/queries.ts`의 mock import를 db로 교체.
4. `features/*/actions.ts`의 `MOCK_X.push()` 등을 db.insert로 교체.
5. 이 폴더 통째로 삭제.

호출부 (page.tsx 등) 무수정.

## ❌ 안 되는 것

- mocks를 features 외부에서 import (page, component, lib)
- mocks 안에서 server/dal.ts 호출 (반대 방향)
- mocks 데이터 형태가 schema.ts와 어긋남 — 추가 시 schema 먼저 확인
