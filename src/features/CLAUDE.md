# features/ — 도메인 모듈

## 폴더 구조 (필수 표준)

각 feature 폴더는 다음 파일을 가집니다 (필요한 것만):

```
features/<도메인>/
├─ schema.ts        # zod 스키마. 서버/클라 공유. 타입 derive.
├─ queries.ts       # 'server-only' import. 읽기 전용.
├─ actions.ts       # 'use server' directive. 쓰기 작업 (mutation).
└─ ui/              # 도메인 색이 있는 공유 컴포넌트
   └─ <Component>.tsx
```

**규칙**:

1. **`schema.ts`** — zod 스키마와 `z.infer<typeof X>` 타입 export. **action/query/form이 모두 같은 스키마 재사용.**
2. **`queries.ts`** — 첫 줄 `import "server-only"`. Server Component / Server Action에서만 호출.
3. **`actions.ts`** — 첫 줄 `"use server"`. 모든 export 함수는 `(prevState, formData) => Promise<State>` 시그니처 (또는 직접 호출 가능한 일반 async).
4. **`ui/`** — 이 도메인의 카드/리스트 등. 다른 도메인에서 import해도 OK 단 cyclic 주의.

## 구체 예시

[features/proposals/](proposals/)
- `schema.ts` — `RequestProposalSchema` (zod) + `RequestProposalState` 타입
- `queries.ts` — `listProposalsForCustomer`, `getProposalById`
- `actions.ts` — `requestProposal` (Server Action)

## ❌ 안티패턴

- `queries.ts`에 `import 'server-only'` 빼먹기 — 클라이언트 번들 누출
- `actions.ts` 안에서 권한 검증 안 하기 — admin/partner 로그인 액션은 진입부에서 `requireAdminSession()` / `requirePartnerSession()` 호출, 가입자/토큰 기반 액션은 진입부에서 token → row 조회 + status 검증
- Server Action 내 검증을 zod 없이 수동 if 체크 — 항상 `Schema.safeParse()`
- 도메인 로직을 `app/<route>/_lib/`에 두기 — 한 라우트만 쓴다고 확신할 때만

## 새 도메인 추가 시

```bash
mkdir -p src/features/<name>
# schema.ts, queries.ts, actions.ts 생성
```

`types/index.ts`에 도메인 타입이 있다면, 그건 zod 스키마에 흡수시킬 후보. 새 타입이 zod 영역이면 schema.ts에서만 derive.
