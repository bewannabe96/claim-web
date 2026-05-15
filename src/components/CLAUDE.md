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

// ✅ render prop으로 underlying element 교체 + nativeButton 비활성
<Button render={<Link href="/x" />} nativeButton={false}>Go</Button>
```

`nativeButton` 은 Base UI Button 의 default true 옵션 — native `<button>` 요소를
가정. anchor (Link) 를 render 로 끼울 땐 반드시 `nativeButton={false}` 로 꺼야
dev console 경고 (form/접근성 의미 손상) 가 사라짐.

**이 프로젝트는 `<Button render={...}>` 패턴으로 통일** — 라우트 이동 / 외부 링크 모두
Button 컴포넌트로 감싸 hover · radius · disabled 동작이 일관되게 유지됨.

`Link + buttonVariants()` 직접 합치는 대안은 사용 금지:
- 템플릿 리터럴 (`${buttonVariants()} my-class`) 로 합치면 cn() (tailwind-merge) 가
  안 끼어서 base 의 `rounded-lg` 와 추가한 `rounded-full` 이 둘 다 적용 → CSS source
  순서로 의도와 다른 radius 가 박힘. 같은 함정이 height/text-size 에도 발생.
- `[a]:hover:` 같은 anchor-only selector 로 인해 `<Button>` (button 요소) 과
  hover 동작이 달라져 시각적 이질감 발생.

**예외**: 외부 라이브러리 (next-intl 의 `Link`, framer 의 motion 컴포넌트 등) 와
조합할 때만 `Link href={...} className={cn(buttonVariants(), "...")}` 패턴 허용 —
반드시 `cn()` 으로 감쌀 것.

## 새 컴포넌트 추가 시 체크리스트

1. 정말 여러 라우트에서 쓰이나? 아니면 `_components/`로.
2. 도메인 색이 있나? 그러면 `features/<도메인>/ui/`로.
3. `'use client'` 필요한가? 인터랙션 없으면 빼기.
4. shadcn에 이미 있나? (`pnpm dlx shadcn@latest add` 검색)
