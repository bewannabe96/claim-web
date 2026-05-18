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
- Next 16 공식 이름은 **`proxy.ts`** 지만, 16.2.4 + Turbopack 에서 인식 안 됨 → 현재 **`middleware.ts`** (legacy 이름) 사용. 인증 boundary 로 쓰지 말 것 — DAL 이 진짜 boundary. middleware 는 optimistic 차단 + knock 게이트 + X-Robots-Tag 만 (자세한 건 [src/app/admin/CLAUDE.md](src/app/admin/CLAUDE.md)).
- shadcn Nova preset = Base UI 기반. **`asChild` 없음**, `render` prop 또는 `buttonVariants()` 직접.
- `<Image priority>` → **`preload`**, `quality` 필수, `images.domains` → `remotePatterns`.
- Parallel route 슬롯에 **`default.tsx` 없으면 빌드 실패**.
- `<Link href>`는 typedRoutes 검증 — 동적 쿼리는 `href={{ pathname, query }}` 객체 형식.
- **Client Component `useState` 는 Router Cache 가 보존** — soft nav 후 같은 라우트에 재진입하면 떠날 때 state 그대로 복원됨. fresh state 원하면 navigate 직전 명시적 reset (예: [step1-wizard.tsx](src/app/(marketing)/request/new/_components/step1-wizard.tsx)).

## 디렉토리 책임

```
middleware.ts        # /admin/* 전용 — knock + optimistic auth + X-Robots-Tag.
                     #   인증 boundary 아님 (DAL이 진짜). 루트에 위치.
src/
├─ app/               # 라우팅 (App Router)
│  ├─ (marketing)/    # 비인증 영역
│  ├─ admin/          # 운영자 (Supabase + admin_users + knock 게이트)
│  ├─ partner/        # 설계사 (token-based + 향후 supabase auth)
│  └─ request/        # 가입자 (계정 없음)
├─ components/ui/     # shadcn 프리미티브 (수동 편집 X)
├─ features/          # 도메인 모듈 (schema/queries/actions/ui)
│  ├─ admin/  partners/  proposals/  requests/
├─ server/            # 'server-only'. DAL, Supabase, prisma, S3
│  ├─ dal.ts          #   모든 인증 검사 단일 진입점
│  ├─ supabase.ts     #   @supabase/ssr 서버 클라이언트
│  └─ db/prisma.ts
├─ lib/               # 순수 유틸
└─ types/             # 도메인 타입
```

각 디렉토리에 CLAUDE.md가 있음 — 그 디렉토리에서 작업할 때 먼저 읽을 것.

## 명령어

```bash
pnpm dev       # 개발 서버
pnpm build     # 프로덕션 빌드 + 타입 체크
pnpm lint      # ESLint
```

## 로컬 DB — schema-first 워크플로우

- **worktree 격리 Docker Postgres** — 일상 작업. `pnpm db:push` 로 schema.prisma → 로컬 즉시 sync (migration 안 만듦).
- **develop dev DB** = 원격 Supabase dev project. develop merge 후 CI 가 누적 schema diff 로 migration 1 개 자동 생성/적용.
- **운영 Supabase** — master merge → GitHub Actions `deploy-migrations.yml` 가 `prisma migrate deploy` 자동 적용 (Vercel build 와 분리 — observability + 직렬화).

전체 흐름과 충돌 카탈로그: **[docs/worktree-workflow.md](docs/worktree-workflow.md)**.

```bash
pnpm db:start            # 첫 진입: Docker 기동 + migration deploy + seed (멱등)
pnpm db:push             # 일상: schema.prisma 변경 후 로컬 격리 DB 즉시 sync
pnpm db:migrate:deploy   # git pull 로 받은 migration 을 로컬에 적용
pnpm db:reset            # 볼륨 삭제 → 다음 start 에서 깨끗하게
pnpm db:status           # 모든 worktree 의 컨테이너 한 화면
pnpm db:cleanup-orphans  # 사라진 worktree 의 고아 컨테이너 + 볼륨 일괄 삭제 (메인 리포에서 호출)
pnpm db:psql / db:logs / db:stop / db:seed
```

**금지**: `pnpm prisma migrate dev` 직접 호출 / `prisma/migrations/` 수동 편집. develop CI 가 단일 writer (PR 단계에서 CI 가 차단). 데이터 마이그레이션 등 수동 SQL 필요 시는 PR `manual-migration` label.

**Claude Code 라이프사이클 hook (worktree 한정)**:
- **SessionStart** → 컨테이너 없거나 정지면 백그라운드 풀 부트스트랩 (compose up + migration + seed). 로그 `.claude/db-bootstrap.log`. 첫 명령이 DB 를 친다면 `tail -f .claude/db-bootstrap.log` 로 진행 확인.
- **SessionEnd** → `docker compose down -v` (컨테이너 + 볼륨 완전 삭제). 다음 SessionStart 가 자동 재구축.
- 메인 리포 세션에서는 hook 동작 안 함 (worktree 만).

## 새 기능 추가 워크플로우

1. **위치 결정** — 가입자/공개 → `(marketing)/`, 설계사 → `partner/`, 운영자 → `admin/(dashboard)/`. 도메인 로직? `features/<도메인>/`.
2. **schema 먼저** — `features/<x>/schema.ts`에 zod로 입력/상태 정의.
3. **데이터 접근** — `features/<x>/queries.ts` (`'server-only'`).
4. **mutation** — `features/<x>/actions.ts` (`'use server'`), admin 액션은 함수 진입부에서 `requireAdminSession()` 호출 (layout 게이트는 server action 에 적용 안 됨 — features/CLAUDE.md 참조). 가입자/설계사는 현재 token 기반 — 액션 진입부에서 `token → row` 조회 + status 검증으로 권한 판정 (features/proposals/actions.ts 참조).
5. **페이지** — Server Component 기본, 인터랙션은 `_components/`의 leaf client.
6. **`pnpm build` 통과 확인** (typedRoutes/cacheComponents가 잡아주는 것 많음).

deprecation 경고는 무시하지 않고 즉시 새 API로 마이그레이션.
