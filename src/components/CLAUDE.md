# components/ — 라우트 횡단 공유 UI

## 무엇이 들어가나

- **`ui/`** — shadcn 생성 프리미티브 (button, card, input...). **수동 편집 금지** — `pnpm dlx shadcn@latest add <component>`로 추가하거나 `shadcn apply`로 재적용.
- 그 외 `components/` 직속 — 진짜로 여러 라우트가 공유하는 컴포넌트 (예: `Logo`, `EmptyState`, `PageHeader` 같은 일반 UI).

## 무엇이 안 들어가나

- **특정 라우트에서만 쓰는 컴포넌트** → `app/<route>/_components/`로.
- **도메인 로직이 묶인 컴포넌트** (예: `<ProposalCard>`) → `features/proposals/ui/`로.
- **서버 전용 로직** → 절대 여기 두지 말 것 (`server/` 또는 `features/<x>/queries.ts`).

## shadcn Nova 주의

Nova preset은 **Base UI** 기반 (Radix 아님). 가장 큰 차이:

```tsx
// ❌ asChild는 없음 (옛 Radix 패턴)
<Button asChild><Link href="/x">Go</Link></Button>

// ✅ render prop, 또는 buttonVariants() 직접 사용
<Button render={<Link href="/x" />}>Go</Button>
<Link href="/x" className={buttonVariants()}>Go</Link>
```

이 프로젝트는 **buttonVariants() 패턴 통일**. 이미 [src/app/(marketing)/page.tsx](../app/(marketing)/page.tsx)에서 사용.

## 새 컴포넌트 추가 시 체크리스트

1. 정말 여러 라우트에서 쓰이나? 아니면 `_components/`로.
2. 도메인 색이 있나? 그러면 `features/<도메인>/ui/`로.
3. `'use client'` 필요한가? 인터랙션 없으면 빼기.
4. shadcn에 이미 있나? (`pnpm dlx shadcn@latest add` 검색)
