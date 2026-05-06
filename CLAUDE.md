# Agent Match MVP

보험 가입자 ↔ 설계사 매칭 + 제안서 수신 MVP. Next.js 16 + React 19 + App Router 기반.

## ⚠️ 작업 시작 전 반드시 읽을 것

이 프로젝트의 Next.js는 학습 데이터(14/15)와 **API/컨벤션/파일 구조가 다릅니다.** 코드 작성 전에:

1. **[docs/architecture.md](docs/architecture.md)** — 채택한 아키텍처와 Next 16 변경점 정리. 특히 섹션 14 (옛 튜토리얼 경계 리스트).
2. **작업할 디렉토리의 `CLAUDE.md`** — 디렉토리별 로컬 규칙. [src/CLAUDE.md](src/CLAUDE.md)에서 시작해 트리 따라 내려갈 것.
3. 의심나면 `node_modules/next/dist/docs/`로 직접 확인.

## 가장 자주 틀리는 항목

- `params`, `searchParams`, `cookies()`, `headers()` **모두 async** — `await` 필요.
- `cacheComponents: true` 활성 — `fetch()` 기본 캐시 안 됨, **`'use cache'`로 명시 opt-in**.
- 동적 데이터 쓰는 페이지는 **`loading.tsx` 또는 `<Suspense>` 필수** (cacheComponents 강제).
- `middleware.ts` deprecated → **`proxy.ts`** (Node 전용). 인증 boundary로 쓰지 말 것 — DAL이 진짜 boundary.
- shadcn Nova preset = Base UI 기반. **`asChild` 없음**, `render` prop 또는 `buttonVariants()` 직접.
- `<Image priority>` → **`preload`**, `quality` 필수, `images.domains` → `remotePatterns`.
- Parallel route 슬롯에 **`default.tsx` 없으면 빌드 실패**.
- `<Link href>`는 typedRoutes 검증 — 동적 쿼리는 `href={{ pathname, query }}` 객체 형식.

## 디렉토리 책임

```
src/
├─ app/               # 라우팅 (App Router)
│  ├─ (marketing)/    # 비인증 영역
│  ├─ (app)/          # 인증 영역 (layout이 requireSession)
│  └─ (auth)/         # 로그인/회원가입
├─ components/ui/     # shadcn 프리미티브 (수동 편집 X)
├─ features/          # 도메인 모듈 (schema/queries/actions/ui)
│  ├─ agents/
│  └─ proposals/
├─ server/            # 'server-only'. DAL, auth, db
├─ lib/               # 순수 유틸
├─ types/             # 도메인 타입
└─ mocks/             # MVP 임시 데이터 (DB 도입 시 폐기)
```

각 디렉토리에 CLAUDE.md가 있음 — 그 디렉토리에서 작업할 때 먼저 읽을 것.

## 명령어

```bash
pnpm dev       # 개발 서버
pnpm build     # 프로덕션 빌드 + 타입 체크
pnpm lint      # ESLint
```

## 새 기능 추가 워크플로우

1. **위치 결정** — 인증? `(app)/` : `(marketing)/`. 도메인 로직? `features/<도메인>/`.
2. **schema 먼저** — `features/<x>/schema.ts`에 zod로 입력/상태 정의.
3. **데이터 접근** — `features/<x>/queries.ts` (`'server-only'`).
4. **mutation** — `features/<x>/actions.ts` (`'use server'`), `requireSession()` 호출.
5. **페이지** — Server Component 기본, 인터랙션은 `_components/`의 leaf client.
6. **`pnpm build` 통과 확인** (typedRoutes/cacheComponents가 잡아주는 것 많음).

deprecation 경고는 무시하지 않고 즉시 새 API로 마이그레이션.
