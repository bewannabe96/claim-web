# scripts/ — 로컬 DB 관리 + Claude Code hook

worktree 격리 Docker Postgres 운영에 쓰이는 bash 스크립트 모음. 전체 워크플로우는 [docs/worktree-workflow.md](../docs/worktree-workflow.md) 참고.

## 호출 관계

```
db-env.sh ←─ source ─┬─ write-env-local.sh
                     ├─ db/start.sh ──→ write-env-local.sh
                     ├─ db/stop.sh
                     ├─ db/reset.sh
                     ├─ db/status.sh           (source 안 함 — claim_ prefix grep)
                     ├─ db/cleanup-orphans.sh  (source 안 함 — git-common-dir + 자체 to_safe)
                     ├─ db/psql.sh
                     ├─ db/logs.sh
                     ├─ db/push.sh
                     ├─ db/migrate-deploy.sh
                     ├─ hooks/session-start-db.sh   (백그라운드 db/start.sh 호출)
                     └─ hooks/session-end-db.sh     (worktree 한정 down -v)
```

`db-env.sh` 가 **단일 진실 공급원** — 다른 모든 스크립트가 source 해서 env 받아옴.

---

## scripts/db-env.sh

**무엇을**: worktree 디렉토리 이름을 sha256 hash 해서 결정론적 포트 + COMPOSE_PROJECT_NAME + DATABASE_URL 계산. export 만 하고 부작용 없음.

**source 전용** — 직접 실행하면 무의미. 다른 스크립트의 첫 줄에서 `source scripts/db-env.sh` 호출.

**export 되는 변수**:
- `WORKTREE_NAME` — `basename(pwd)`
- `COMPOSE_PROJECT_NAME` — `claim_<safe-name>` (Docker 격리 키)
- `POSTGRES_HOST_PORT` — `55000–55999` 범위 (sha256 첫 4 nibble mod 1000)
- `DATABASE_URL` / `DIRECT_URL` — `postgresql://postgres:postgres@127.0.0.1:<port>/postgres?schema=claim` (로컬은 pooler 없으므로 양쪽 동일)

**가정**: 항상 worktree root 에서 호출됨. `pnpm db:*` 스크립트가 cwd 를 강제하므로 자동 만족.

---

## scripts/write-env-local.sh

**무엇을**: `.env.local` 의 `DATABASE_URL` / `DIRECT_URL` 두 줄만 갱신. 다른 키 (사용자가 추가한 로컬 override 등) 는 보존.

**언제**: `db/start.sh` 가 호출. 컨테이너 기동 직후, migration 적용 전.

**왜 .env.local**: Next.js 의 env 우선순위 (`.env.local` > `.env.development` > `.env`) 를 이용해 `.env` 의 원격 URL 을 가린다. Prisma CLI 는 `.env` 만 읽으므로 prisma 호출 시점엔 db-env.sh 가 export 한 env 가 직접 사용됨.

**보존 매커니즘**: `grep -vE '^(DATABASE_URL|DIRECT_URL)=|^# AUTO-GENERATED|^# Worktree:'` 로 우리 키 + 헤더만 제거 후 새 값 append.

---

## scripts/db/start.sh — `pnpm db:start`

**무엇을**: worktree 의 로컬 DB 환경 전체를 한 번에 준비. 멱등 — 매번 호출해도 안전.

**시퀀스**:
1. worktree 에 `.env` 없으면 메인 리포의 `.env` 자동 복사 (git common-dir 로 메인 리포 위치 추론). 메인 리포에도 없으면 WARN 후 계속.
2. `docker info` 체크 (daemon 없으면 명확한 ERROR 후 exit 1).
3. `node_modules` 또는 `node_modules/.bin/prisma` 없으면 `pnpm install` 자동 호출 (이후 prisma 단계에 필요). 이미 설치되어 있으면 skip.
4. `docker compose up -d postgres` (이미 떠 있으면 no-op).
5. `pg_isready` healthcheck 대기 (최대 ~60 초).
6. `write-env-local.sh` 호출 → `.env.local` 갱신.
7. `pnpm prisma migrate deploy` → `prisma/migrations/` 의 모든 migration 적용.
8. `pnpm prisma db push --skip-generate --accept-data-loss` → schema.prisma 와 reconcile. feature 브랜치 중에는 schema.prisma 가 마이그레이션 폴더보다 앞설 수 있어 (마이그레이션은 develop merge 후 CI 단일 writer) 매 부트스트랩 시 schema 정렬. 차이 없으면 no-op.
9. `pnpm prisma generate` → Prisma Client 재생성.
10. `pnpm prisma db seed` → `app_settings('app')` + `admin(본인)` + dev `partner_invitation` upsert/insert.

**언제 호출**:
- 수동 호출 거의 필요 없음 — SessionStart hook 이 컨테이너 없을 때 자동으로 백그라운드 호출.
- `pnpm db:reset` 직후 명시 호출.
- hook 백그라운드 진행 중인데 latency 가 거슬릴 때 foreground 로 재호출.

---

## scripts/db/push.sh — `pnpm db:push`

**무엇을**: `prisma db push --skip-generate` + `prisma generate`. `schema.prisma` 의 현재 상태를 로컬 격리 DB 에 즉시 sync. **Migration 파일을 만들지 않음.**

**언제**: 일상 작업의 표준 명령. `schema.prisma` 편집 후 `pnpm dev` 띄우기 전.

**왜 push 인가**: schema-first 워크플로우 — PR 에 migration 포함 금지 (CI 가 차단). 정식 migration 은 develop merge 후 GHA `auto-migration.yml` 가 단일 writer 로 생성. worktree 의 로컬 작업은 단순 schema sync 만 필요.

---

## scripts/db/migrate-deploy.sh — `pnpm db:migrate:deploy`

**무엇을**: `prisma migrate deploy` + `prisma generate`. `prisma/migrations/` 의 미적용 migration 을 로컬 DB 에 순차 적용.

**언제**: `git pull` 로 develop 의 새 migration (GHA `auto-migration.yml` 가 생성한 것) 을 받았을 때.

**`db:start` 와의 차이**: `db:start` 는 컨테이너 기동 + seed 까지 풀 셋업. `db:migrate:deploy` 는 schema 동기화만 — 컨테이너 이미 떠있고 데이터 보존 원할 때.

---

## scripts/db/stop.sh — `pnpm db:stop`

**무엇을**: `docker compose stop postgres`. 컨테이너 정지, 볼륨 보존 (데이터 유지).

**언제**: 디스크/RAM 회수 원할 때. 평소엔 `restart: unless-stopped` 로 자동 재시작되므로 호출 거의 없음.

---

## scripts/db/reset.sh — `pnpm db:reset`

**무엇을**: `docker compose down -v`. 컨테이너 + 볼륨 완전 삭제. 데이터/스키마 모두 날아감.

**언제**:
- Drift 발생 시 (이전 흐름의 잔재로 로컬 DB 와 `prisma/migrations/` 불일치).
- 깨끗하게 다시 시작하고 싶을 때.

다음 `pnpm db:start` 가 빈 컨테이너부터 새로 빌드 + seed.

---

## scripts/db/status.sh — `pnpm db:status`

**무엇을**: `docker ps --filter "name=^claim_.*_postgres$"`. 모든 worktree 의 postgres 컨테이너를 한 화면.

**언제**: 디버깅. 여러 worktree 가 떠있을 때 각자 포트/상태 확인.

`db-env.sh` source 안 함 — 모든 worktree 가 `claim_` prefix 컨테이너명을 갖는다는 컨벤션에 의존.

---

## scripts/db/cleanup-orphans.sh — `pnpm db:cleanup-orphans`

**무엇을**: `.claude/worktrees/` 에 더 이상 디렉토리가 없는 worktree 의 `claim_*_postgres` 컨테이너 + `claim_*_pgdata` 볼륨을 일괄 삭제. 확인 프롬프트 없음.

**언제**:
- `git worktree remove` 직후 (정상적으로 SessionEnd hook 이 down -v 했으면 잡을 게 없지만, 외부에서 worktree 디렉토리 강제 삭제 시 잔존 컨테이너 정리).
- 옛 흐름에서 남은 잔재 일괄 정리.
- `pnpm db:status` 가 모르는 컨테이너로 차 있을 때.

**Keep 룰**: 메인 리포 basename + `.claude/worktrees/*/` 의 basename — `db-env.sh` 와 동일한 safe-name 변환 적용. 이 두 룰 중 하나에 매칭되는 컨테이너는 보존.

**메인 리포 / worktree 어디서든 호출 가능**: `git rev-parse --git-common-dir` 로 메인 리포 root 추론.

---

## scripts/db/psql.sh — `pnpm db:psql [...args]`

**무엇을**: `docker compose exec postgres psql -U postgres -d postgres "$@"`. 컨테이너 안 psql shell. 인자가 그대로 전달됨.

**사용 예**:
- `pnpm db:psql` — 인터랙티브 shell
- `pnpm db:psql -c "SELECT id FROM claim.app_settings;"` — 1 회성 쿼리

**언제**: 디버깅. Prisma Studio 대신 raw SQL 검사.

---

## scripts/db/logs.sh — `pnpm db:logs`

**무엇을**: `docker compose logs -f postgres`. 컨테이너 로그 follow.

**언제**: 디버깅. connection 실패, 쿼리 에러 등 추적.

---

## scripts/hooks/session-start-db.sh

**무엇을**: Claude Code 의 `SessionStart` hook. 컨테이너 running 이면 no-op, 없거나 정지면 **백그라운드 풀 부트스트랩** (`bash scripts/db/start.sh`).

**시퀀스** (모두 fail-soft):
1. `docker` CLI / daemon / `docker-compose.yml` 없음 → exit 0
2. `db-env.sh` source
3. `${COMPOSE_PROJECT_NAME}_postgres` 가 `docker ps` 에 있음 → exit 0 (latency 절약)
4. 없음 → `nohup bash scripts/db/start.sh >.claude/db-bootstrap.log 2>&1 & disown`
5. exit 0

**왜 백그라운드**:
- SessionStart hook 은 사용자 프롬프트 받기 전에 실행됨. blocking 으로 30~60초 기다리면 UX 망함.
- 부트스트랩 중에 사용자/AI 가 DB 를 치면 prisma 명령이 잠시 실패할 수 있음 → `tail -f .claude/db-bootstrap.log` 로 진행 확인.
- 정 latency 가 거슬리면 foreground `pnpm db:start` 명시 호출.

**SessionEnd 가 down -v 하므로 매 세션마다 트리거**: 컨테이너 + 볼륨 완전 삭제 → 다음 SessionStart 가 자동 재구축.

**등록 위치**: [.claude/settings.json](../../.claude/settings.json) 의 `hooks.SessionStart` (matcher: `startup|resume|clear`).

---

## scripts/hooks/session-end-db.sh

**무엇을**: Claude Code 의 `SessionEnd` hook. **worktree 한정** 으로 `docker compose down -v` 호출 (컨테이너 + 볼륨 완전 삭제).

**시퀀스** (모두 fail-soft):
1. `git-dir != git-common-dir` 체크 — 메인 리포면 exit 0 (worktree 만 정리).
2. `docker` CLI / daemon / `docker-compose.yml` 없음 → exit 0
3. `db-env.sh` source
4. `docker compose down -v >/dev/null 2>&1 || true`
5. exit 0

**의도**:
- 세션 종료 = 그 worktree 작업 흐름 종료라고 가정 → 자원 회수.
- 다음에 같은 worktree 로 돌아와도 SessionStart 가 자동 풀 부트스트랩하므로 사용자 경험 끊김 없음 (latency 외).
- 메인 리포에서는 동작 안 함 (개인 작업 + 다른 worktree 컨테이너 영향 X).

**등록 위치**: [.claude/settings.json](../../.claude/settings.json) 의 `hooks.SessionEnd` (matcher: `*`, timeout: 30s).
