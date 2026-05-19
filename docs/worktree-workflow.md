# Worktree 개발 워크플로우

여러 AI 에이전트 / 개발자가 동시에 한 프로젝트를 진행할 수 있도록 worktree 마다 격리된 Docker Postgres + Redis 를 띄우는 로컬 개발 셋업.

## 핵심 모델

```
┌──────────────────────────────────────────────────────────────────┐
│ worktree 격리 Docker Postgres + Redis                            │
│   - worktree 마다 별개 컨테이너 / 포트 / 볼륨                       │
│   - schema.prisma 변경은 `pnpm db:push` 로 즉시 sync (no migration)│
│   - Redis 는 OTP 코드 + IP 레이트리밋 보관처 (TTL 만으로 관리)        │
│   - 일상 작업은 전부 여기서 일어남                                  │
└──────────────────────────────────────────────────────────────────┘
```

**무엇이 격리되고 무엇이 공유되는가**

| 항목 | 위치 |
|---|---|
| Postgres / Redis 인스턴스 + 데이터 | 격리 — worktree 마다 별개 컨테이너 |
| `schema.prisma` | 공유 — 모든 worktree 가 같은 source 봐야 함 (develop 으로 수렴) |
| `prisma/migrations/*` | 공유 — 현재 read-only. PR 에서 변경 시도하면 `check-no-migrations.yml` 가 차단. |

---

## 일상 작업 흐름

### 새 worktree 생성

```bash
git worktree add .claude/worktrees/<new-name> -b <branch-name> develop
cd .claude/worktrees/<new-name>
# 이제 cd 만 하면 끝 — Claude Code 세션 진입 시 SessionStart hook 이
# 백그라운드로 .env 복사 + pnpm install + Docker 기동 + migration + seed 일괄 수행.
# 명시적으로 foreground 로 끝내려면:
pnpm workspace:setup   # 멱등 — install / docker / migration / seed 전부 알아서 처리
```

### `.env` 셋업 (메인 리포에 한 번만, worktree 들이 자동 상속)

메인 리포 (`.claude/worktrees/` 의 부모) 에서 `.env` 를 한 번 만들어두면 `pnpm workspace:setup` 이 새 worktree 마다 자동 복사. 이후 worktree 작업은 `.env` 신경 안 써도 됨.

```bash
cd <main-repo-root>
cp .env.example .env
# 아래 값 채우기
```

채울 값:
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — 원격 dev Supabase project
- `LOCAL_DEV_ADMIN_USER_ID`, `LOCAL_DEV_ADMIN_EMAIL` — 본인 admin UUID/email (Dashboard → Authentication → Users)
- `AWS_*`, `S3_BUCKET_PROPOSALS`, `SQS_ANALYSIS_QUEUE_URL` — 제안서/분석 쓸 때만
- `ADMIN_KNOCK_PATH` — admin URL obfuscation (선택)

**`DATABASE_URL`, `DIRECT_URL` 은 비워둘 것** — `pnpm workspace:setup` 이 `.env.local` 에 자동 생성 (worktree 별 포트로 override).

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

### 다른 worktree 의 schema 변경 받기

```bash
git pull              # develop 의 schema.prisma 변경 수신
pnpm db:push          # 격리 DB 에 즉시 sync (migration 안 만듦)
```

---

## 명령어 카탈로그

| 명령 | 용도 |
|---|---|
| `pnpm workspace:setup` | 첫 진입 시. Docker 기동 + migration 적용 + seed. 멱등. SessionStart hook 이 자동 호출. |
| `pnpm db:push` | 일상. schema.prisma → 로컬 격리 DB 즉시 sync. Migration 안 만듦. |
| `pnpm db:migrate:deploy` | `prisma/migrations/` 의 기존 migration 들을 로컬 격리 DB 에 적용 (legacy 검증용). |
| `pnpm db:reset` | 컨테이너 + 볼륨 완전 삭제. 다음 setup 에서 깨끗하게. |
| `pnpm cleanup:orphan-db-containers` | 사라진 worktree 의 고아 컨테이너 + 볼륨 일괄 삭제 (확인 없음). |
| `pnpm db:seed` | `app_settings` + (env 있으면) `user`+`admin` upsert. `workspace:setup` 이 호출. |

**`pnpm prisma migrate dev` 직접 호출 금지** — `prisma/migrations/` 를 사람이 손대지 않는다. PR CI (`check-no-migrations.yml`) 가 차단.

---

## Claude Code 라이프사이클 hook (worktree 한정)

worktree 의 Docker 컨테이너 라이프사이클 ↔ Claude Code 세션 1:1 매핑.

| Hook | 스크립트 | 동작 |
|---|---|---|
| `SessionStart` | [scripts/hooks/worktree-session-start.sh](../scripts/hooks/worktree-session-start.sh) | 컨테이너 running 이면 no-op. 없거나 정지면 백그라운드로 `pnpm workspace:setup` 풀 부트스트랩 (.env 복사 + install + compose up + migration + seed). 로그 `.claude/workspace-bootstrap.log`. |
| `SessionEnd` | [scripts/hooks/worktree-session-end.sh](../scripts/hooks/worktree-session-end.sh) | worktree 한정 `docker compose down -v` — 컨테이너 + 볼륨 완전 삭제. |

등록: [.claude/settings.json](../.claude/settings.json).

**메인 리포 세션은 영향 없음** — `git rev-parse --git-dir != --git-common-dir` 일 때만 SessionEnd 가 동작. 메인 리포에서는 SessionStart 도 사실상 no-op (`docker-compose.yml` 은 있지만 메인 리포 컨테이너를 일부러 띄우지 않는 한 매칭 안 됨).

**모든 hook 은 fail-soft** — Docker 미설치/미기동이어도 세션 진입/종료 차단 X.

**부트스트랩 race 주의**: SessionStart 직후 30~60초 안에 사용자/AI 가 DB 를 치면 prisma 명령이 실패할 수 있음. `tail -f .claude/workspace-bootstrap.log` 로 진행 확인하거나, foreground `pnpm workspace:setup` 재실행 후 재시도.

## 고아 컨테이너 정리

SessionEnd hook 이 정상 작동하면 worktree 종료 시 자동 정리되지만, 다음 케이스에서는 고아가 남는다:
- `git worktree remove` 를 다른 세션에서 외부 실행 (해당 worktree 세션이 안 떠있어 hook 트리거 안 됨).
- Docker daemon 이 죽어있던 상태에서 SessionEnd 가 silent skip.

이 때 메인 리포 (또는 다른 worktree) 에서 한 방으로 정리:

```bash
pnpm cleanup:orphan-db-containers
```

`.claude/worktrees/` 에 디렉토리가 없는 모든 `claim_*_{postgres,redis}` 컨테이너 + `_pgdata` / `_redisdata` 볼륨 즉시 삭제. 확인 프롬프트 없음. 메인 리포 basename 은 keep 룰에 포함되어 보호.

---

## 격리 매커니즘 (한 줄)

worktree 디렉토리 이름을 sha256 hash → 결정론적 포트 (Postgres 55000–55999 / Redis 56000–56999) + Docker compose project name + 볼륨. 같은 이름이면 같은 컨테이너, 다른 이름이면 완전 별개.

계산 로직: [scripts/set-workspace-env-vars.sh](../scripts/set-workspace-env-vars.sh).

```
worktree: blissful-bhabha-60bef4
  → COMPOSE_PROJECT_NAME = claim_blissful-bhabha-60bef4
  → Postgres port        = 55012
  → Redis port           = 56012
  → DATABASE_URL         = postgresql://postgres:postgres@127.0.0.1:55012/postgres?schema=claim
  → REDIS_URL            = redis://127.0.0.1:56012
```

---

## 트러블슈팅

### `pnpm dev` 가 원격 Supabase 로 붙는다
`.env.local` 이 없거나 `DATABASE_URL` 줄이 빠짐. `pnpm workspace:setup` 재실행.

### `pnpm workspace:setup` 후에도 `pnpm dev` 가 옛 DB 로 붙는다
Next.js dev server 가 환경변수를 시작 시점에만 읽음. 재시작 필수.

### 포트 충돌 (`bind: address already in use`)
다른 프로세스가 hash 잡은 포트 사용 중. worktree 이름 한 글자 변경하면 새 hash → 새 포트.

### Docker daemon 안 떠있음
```
ERROR: Docker daemon not running. Start Docker Desktop / 'colima start' first.
```
Docker Desktop 또는 `colima start` 후 재시도. SessionStart hook 은 daemon 없으면 silent skip.

### Admin 화이트리스트 통과 안 됨 (/admin 진입 → /admin/login)
`.env` 에 `LOCAL_DEV_ADMIN_USER_ID` 가 비었거나 잘못된 UUID. Supabase Dashboard 에서 본인 UUID 확인 후 `pnpm db:seed` 재실행. seed 가 `claim.user` + `claim.admin` 두 row 모두 upsert 함 (둘 다 있어야 DAL 통과).

### Drift detected
격리 DB 라 무손실 — `pnpm db:reset && pnpm workspace:setup` 으로 깨끗하게 재구축.

### Worktree 정리
```bash
# 1) 해당 worktree 세션을 정상 종료하면 SessionEnd hook 이 자동 down -v.
#    이미 컨테이너 죽어있으면 1단계 건너뜀.
cd ../../..
git worktree remove .claude/worktrees/<name>
git branch -D <branch-name>

# 2) hook 이 못 챙긴 잔재가 있다면 (다른 세션에서 worktree 강제 삭제 등) 한 방 정리:
pnpm cleanup:orphan-db-containers
```

---

## 파일 책임 요약

| 경로 | 역할 |
|---|---|
| [docker-compose.yml](../docker-compose.yml) | postgres:16-alpine 단일 서비스. env 격리. |
| [scripts/set-workspace-env-vars.sh](../scripts/set-workspace-env-vars.sh) | worktree-name → PORT / URL 계산. source 전용. |
| [scripts/write-env-local.sh](../scripts/write-env-local.sh) | `.env.local` 의 DB URL 만 갱신. |
| [scripts/setup-workspace-env.sh](../scripts/setup-workspace-env.sh) | workspace 전체 부트스트랩 (.env 복사 → install → compose up → write .env.local → migrate deploy → db push → generate → seed). 멱등. |
| [scripts/db-container/push.sh](../scripts/db-container/push.sh) | `prisma db push` — 일상 schema sync. |
| [scripts/db-container/migrate-deploy.sh](../scripts/db-container/migrate-deploy.sh) | `prisma migrate deploy` — 기존 migration 적용. |
| [scripts/db-container/reset.sh](../scripts/db-container/reset.sh) | `docker compose down -v`. |
| [scripts/db-container/cleanup-orphans.sh](../scripts/db-container/cleanup-orphans.sh) | 사라진 worktree 의 컨테이너 + 볼륨 일괄 삭제. |
| [scripts/hooks/worktree-session-start.sh](../scripts/hooks/worktree-session-start.sh) | Claude Code SessionStart — 컨테이너 없으면 백그라운드 풀 부트스트랩. |
| [scripts/hooks/worktree-session-end.sh](../scripts/hooks/worktree-session-end.sh) | Claude Code SessionEnd — worktree 한정 down -v. |
| [prisma/seed.ts](../prisma/seed.ts) | `app_settings` + (env 있으면) `user`+`admin` upsert. |
| [.github/workflows/check-no-migrations.yml](../.github/workflows/check-no-migrations.yml) | PR 에 `prisma/migrations/` 변경 차단. |
