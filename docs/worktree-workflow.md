# Worktree 개발 워크플로우

여러 AI 에이전트 / 개발자가 동시에 한 프로젝트를 진행하면서도 DB migration 충돌을 0으로 만드는 schema-first 워크플로우.

## 핵심 모델 — 3단 계층

```
┌──────────────────────────────────────────────────────────────────┐
│ worktree 격리 Docker Postgres                                    │
│   - worktree 마다 별개 컨테이너/포트/볼륨                          │
│   - schema.prisma 변경은 `pnpm db:push` 로 즉시 sync (no migration)│
│   - 일상 작업의 거의 전부가 여기서 일어남                          │
└──────────────────────────────────────────────────────────────────┘
                           │  PR (schema.prisma 만)
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ develop dev DB = 원격 dev Supabase project                       │
│   - develop merge → GitHub Actions 가 prisma migrate dev 자동 호출 │
│   - 누적 schema diff 한 개로 1 개 migration 생성                   │
│   - migration 파일을 develop 에 commit/push                       │
└──────────────────────────────────────────────────────────────────┘
                           │  develop → master merge
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ 운영 Supabase prod project                                       │
│   - master push (prisma/migrations/ 변경 포함) → GitHub Actions   │
│     `deploy-migrations.yml` 이 prisma migrate deploy 자동 적용     │
│   - Vercel build 는 코드만 빌드 (migrate 와 분리)                  │
└──────────────────────────────────────────────────────────────────┘
```

**무엇이 격리되고 무엇이 공유되는가**

| 항목 | 위치 |
|---|---|
| DB 인스턴스 + 데이터 | 격리 — worktree 마다 별개 컨테이너 |
| `schema.prisma` | 공유 — 모든 worktree 가 같은 source 봐야 함 (develop 으로 수렴) |
| `prisma/migrations/*` | 공유 — develop 의 CI 가 단일 writer, worktree 는 read-only |

---

## 일상 작업 흐름 (90% 케이스)

### 새 worktree 생성

```bash
git worktree add .claude/worktrees/<new-name> -b <branch-name> develop
cd .claude/worktrees/<new-name>
pnpm install
cp .env.example .env  # 채울 값은 아래 참고
pnpm db:start         # Docker 기동 + 기존 migration 적용 + seed
```

### .env 에 채울 값 (한 번만, worktree 공통)

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — 원격 dev Supabase project
- `LOCAL_DEV_ADMIN_USER_ID`, `LOCAL_DEV_ADMIN_EMAIL` — 본인 admin UUID/email (Dashboard → Authentication → Users)
- `AWS_*`, `S3_BUCKET_PROPOSALS`, `SQS_ANALYSIS_QUEUE_URL` — 제안서/분석 쓸 때만
- `ADMIN_KNOCK_PATH` — admin URL obfuscation (선택)

**`DATABASE_URL`, `DIRECT_URL` 은 비워둘 것** — `pnpm db:start` 가 `.env.local` 에 자동 생성.

### schema 변경 작업

```bash
# 1. schema.prisma 편집
# 2. 로컬 격리 DB 에 즉시 sync (migration 안 만듦)
pnpm db:push
# 3. 작동 확인
pnpm dev
# 4. PR commit — schema.prisma 만. prisma/migrations/ 변경 금지 (CI 차단).
git add prisma/schema.prisma src/...
git commit -m "..."
git push
```

### PR 머지 후 일어나는 일 (자동)

1. develop merge 시점에 `.github/workflows/auto-migration.yml` 발동.
2. CI 가 원격 dev Supabase 에 기존 migration 적용 → schema.prisma 와 diff → 새 migration 1 개 생성 + dev DB 적용.
3. CI 가 `prisma/migrations/<timestamp>_auto_<...>/` 를 develop 에 commit + push.
4. develop → master merge → `.github/workflows/deploy-migrations.yml` 이 운영 Supabase 에 `prisma migrate deploy` 자동 적용. Vercel build (코드 deploy) 와 분리.

### 다른 worktree 의 schema 변경 받기

```bash
git pull                  # develop 의 새 migration 들이 prisma/migrations/ 에 들어옴
pnpm db:migrate:deploy    # worktree 격리 DB 에 적용
```

---

## 명령어 카탈로그

| 명령 | 용도 |
|---|---|
| `pnpm db:start` | 첫 진입 시. Docker 기동 + migration 적용 + seed. 멱등. |
| `pnpm db:push` | 일상. schema.prisma → 로컬 격리 DB 즉시 sync. Migration 안 만듦. |
| `pnpm db:migrate:deploy` | `git pull` 로 받은 migration 을 로컬 격리 DB 에 적용. |
| `pnpm db:reset` | 컨테이너 + 볼륨 완전 삭제. 다음 start 에서 깨끗하게. |
| `pnpm db:status` | 모든 worktree 의 컨테이너 한 화면. |
| `pnpm db:psql [-c "..."]` | 컨테이너 안 psql. |
| `pnpm db:logs` | 컨테이너 로그 follow. |
| `pnpm db:stop` | 컨테이너 정지 (데이터 보존). |
| `pnpm db:seed` | `app_settings` + `admin_users` upsert. `db:start` 가 호출. |
| `pnpm db:seed:fixtures` | Partner 8명 등 매칭 흐름 테스트용. |

**`pnpm db:migrate` (= `prisma migrate dev`) 는 의도적으로 없음** — 사람이 호출하지 말 것. develop merge 후 CI 가 단일 호출.

---

## Schema-first 설계의 이유 — 충돌 0 보장

이 흐름이 해결하는 충돌:

| 충돌 종류 | 기존 흐름 | schema-first |
|---|---|---|
| Migration timestamp 충돌 | 같은 초 생성 시 발생 | ❌ CI 1개만 생성 → 발생 불가 |
| 폐기 PR 의 migration drift | PR closed 후 로컬 DB 와 git 불일치 | ❌ PR 에 migration 없음 → drift 자체가 없음 |
| 의미적 충돌 (같은 컬럼 다른 정의) | 두 migration 이 모두 적용되며 fail | ✅ git merge 단계에서 schema.prisma 텍스트 conflict — 표준 해결 |
| 순서 의존성 (B 가 A 의 컬럼 사용) | A 머지 전 B 머지되면 fail | ✅ CI 가 develop 누적 schema 기준 diff 생성 — 자동 순서 보장 |
| 운영 timestamp 역전 drift | 운영 적용 후 timestamp 빠른 새 migration | ❌ 단일 CI 가 매 머지마다 단조 증가 timestamp 생성 |

남는 충돌: schema.prisma 텍스트 자체의 git conflict. 이건 일반 git merge resolve.

---

## Custom SQL 이 필요한 경우 (드물게)

자동 `migrate dev` 가 생성하는 SQL 이 부족한 경우:
- 컬럼 rename (Prisma 는 DROP+ADD → 데이터 손실. 보존하려면 `ALTER TABLE ... RENAME COLUMN` 수동).
- Data migration (기존 row 변환).
- Enum 값 변경, 복잡한 인덱스 등.

이 경우 흐름:
1. PR 에 `manual-migration` label 추가 → `check-no-migrations.yml` skip.
2. PR 작성자가 직접 `prisma/migrations/<timestamp>_<name>/migration.sql` 작성 (+ schema.prisma 변경).
3. 로컬에서 `pnpm db:reset && pnpm db:start` 로 적용 검증.
4. PR 머지 시 CI 는 추가 migration 생성 안 함 (이미 schema 와 일치하면 "Already in sync" 종료).

드물게만 사용.

---

## SessionStart 자동 기동 (Claude Code)

worktree 진입 시점에 컨테이너만 silent 기동:
- Hook 등록: [.claude/settings.json](../.claude/settings.json)
- 스크립트: [scripts/hooks/session-start-db.sh](../scripts/hooks/session-start-db.sh)
- 동작: `docker compose up -d postgres` (이미 떠있으면 no-op). Migration/seed 안 함.
- 실패 시 `exit 0` — Docker 미설치/미기동이어도 세션 진입 차단 X.

처음 한 번은 명시적 `pnpm db:start` 필요 (`.env.local` 생성 + migration + seed). 이후엔 hook 이 챙김.

---

## 격리 매커니즘 (한 줄)

worktree 디렉토리 이름을 sha256 hash → 결정론적 포트 (55000–55999) + Docker compose project name + 볼륨. 같은 이름이면 같은 컨테이너, 다른 이름이면 완전 별개.

계산 로직: [scripts/db-env.sh](../scripts/db-env.sh).

```
worktree: blissful-bhabha-60bef4
  → COMPOSE_PROJECT_NAME = claim_blissful-bhabha-60bef4
  → host port            = 55012
  → DATABASE_URL         = postgresql://postgres:postgres@127.0.0.1:55012/postgres?schema=claim
```

---

## 트러블슈팅

### `pnpm dev` 가 원격 Supabase 로 붙는다
`.env.local` 이 없거나 `DATABASE_URL` 줄이 빠짐. `pnpm db:start` 재실행.

### `pnpm db:start` 후에도 `pnpm dev` 가 옛 DB 로 붙는다
Next.js dev server 가 환경변수를 시작 시점에만 읽음. 재시작 필수.

### 포트 충돌 (`bind: address already in use`)
다른 프로세스가 hash 잡은 포트 사용 중. worktree 이름 한 글자 변경하면 새 hash → 새 포트.

### Docker daemon 안 떠있음
```
ERROR: Docker daemon not running. Start Docker Desktop / 'colima start' first.
```
Docker Desktop 또는 `colima start` 후 재시도. SessionStart hook 은 daemon 없으면 silent skip.

### `admin_users` 화이트리스트 통과 안 됨 (/admin 진입 404)
`.env` 에 `LOCAL_DEV_ADMIN_USER_ID` 가 비었거나 잘못된 UUID. Supabase Dashboard 에서 본인 UUID 확인 후 `pnpm db:seed` 재실행.

### Drift detected (이전 흐름의 잔재)
schema-first 흐름에서는 거의 발생 안 함. 옛 worktree 에 남은 잔재라면 `pnpm db:reset && pnpm db:start`. 격리 DB 라 무손실.

### Worktree 정리
```bash
pnpm db:reset                                       # 컨테이너 + 볼륨 삭제
cd ../../..
git worktree remove .claude/worktrees/<name>
git branch -D <branch-name>
```

---

## 파일 책임 요약

| 경로 | 역할 |
|---|---|
| [docker-compose.yml](../docker-compose.yml) | postgres:16-alpine 단일 서비스. env 격리. |
| [scripts/db-env.sh](../scripts/db-env.sh) | worktree-name → PORT / URL 계산. source 전용. |
| [scripts/write-env-local.sh](../scripts/write-env-local.sh) | `.env.local` 의 DB URL 만 갱신. |
| [scripts/db/start.sh](../scripts/db/start.sh) | compose up → migrate deploy → seed. |
| [scripts/db/push.sh](../scripts/db/push.sh) | `prisma db push` — 일상 schema sync. |
| [scripts/db/migrate-deploy.sh](../scripts/db/migrate-deploy.sh) | `prisma migrate deploy` — git pull 후 동기. |
| [scripts/db/reset.sh](../scripts/db/reset.sh) | `docker compose down -v`. |
| [scripts/db/status.sh](../scripts/db/status.sh) | 모든 `claim_*` 컨테이너. |
| [scripts/db/{psql,logs,stop}.sh](../scripts/db/) | 일반 도구. |
| [scripts/hooks/session-start-db.sh](../scripts/hooks/session-start-db.sh) | Claude Code SessionStart 자동 기동. |
| [prisma/seed.ts](../prisma/seed.ts) | `app_settings` + `admin_users` upsert. |
| [prisma/fixtures.ts](../prisma/fixtures.ts) | Partner 8명 등 매칭 테스트 더미. |
| [.github/workflows/check-no-migrations.yml](../.github/workflows/check-no-migrations.yml) | PR 에 `prisma/migrations/` 변경 차단. |
| [.github/workflows/auto-migration.yml](../.github/workflows/auto-migration.yml) | develop push → dev Supabase 에 자동 migration 생성 + commit. |
| [.github/workflows/deploy-migrations.yml](../.github/workflows/deploy-migrations.yml) | master push (migrations/ 변경) → 운영 Supabase 에 `prisma migrate deploy`. |
