# types/ — 도메인 타입

## 무엇이 들어가나

- **zod 스키마에서 derive할 수 없는** 도메인 타입 (예: union literal, enum 라벨 매핑).
- 여러 feature가 공유하는 작은 공통 타입.

## 무엇이 안 들어가나

- **zod 스키마가 정의하는 타입** → 그건 `features/<x>/schema.ts`에서 `z.infer<typeof X>`로 derive.
- **컴포넌트 props 타입** → 컴포넌트 파일 내에서 정의.
- **API 응답 타입** → 외부 API면 zod로 검증 후 derive.

## 현재 보유

- `Agent`, `Proposal`, `Customer` — MVP 단계 도메인 타입. **DB 도입 시 ORM이 생성하는 타입으로 교체** (drizzle: `InferSelectModel`, prisma: `Prisma.AgentGetPayload<...>`).
- `InsuranceCategory` (union literal) + `INSURANCE_CATEGORY_LABEL` (라벨 매핑) — UI 전반에 사용.

## ❌ 흔한 실수

- 한 타입을 zod와 TypeScript에서 **이중 정의**. 하나만 진실 공급원으로.
- `types/` 안에서 server-only 모듈 import — `types/`는 양쪽 호환 유지.
- 거대 union/discriminated union을 여기 두기 — feature 색이 강하면 `features/<x>/types.ts`로.
