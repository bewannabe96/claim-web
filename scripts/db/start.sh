#!/usr/bin/env bash
# pnpm db:start — Docker postgres 기동 + .env.local 생성 + migration 적용 + seed.
# 멱등. 컨테이너가 이미 떠 있어도 안전 (docker compose up -d 는 no-op).
set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/../db-env.sh"

echo "[db] Worktree: $WORKTREE_NAME"
echo "[db] Project:  $COMPOSE_PROJECT_NAME"
echo "[db] Port:     $POSTGRES_HOST_PORT"

# worktree 에 .env 가 없으면 메인 리포의 .env 를 한 번 복사.
# 메인 리포 자체에서 실행 시엔 자기 자신 복사 회피.
if [ ! -f .env ]; then
  COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$COMMON_DIR" ]; then
    MAIN_REPO="$(cd "$COMMON_DIR/.." && pwd)"
    if [ "$MAIN_REPO" != "$(pwd)" ] && [ -f "$MAIN_REPO/.env" ]; then
      cp "$MAIN_REPO/.env" .env
      echo "[db] Copied .env from main repo: $MAIN_REPO/.env"
    else
      echo "[db] WARN: no .env found. Copy .env.example to .env and fill values."
      echo "[db]       (Set up .env in main repo once; future worktrees will inherit it.)"
    fi
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[db] ERROR: docker CLI not found. Install Docker Desktop or colima." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "[db] ERROR: Docker daemon not running. Start Docker Desktop / 'colima start' first." >&2
  exit 1
fi

# node_modules 없으면 install 먼저 — 이후 prisma 호출에 필요. 멱등.
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/prisma ]; then
  echo "[db] Installing dependencies..."
  pnpm install
fi

docker compose up -d postgres

# healthcheck 대기 (최대 ~60s)
echo -n "[db] Waiting for postgres"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  echo -n "."
  sleep 2
done

bash "$(dirname "$0")/../write-env-local.sh"

# Prisma 마이그레이션 — DIRECT_URL 사용 (datasource.directUrl).
echo "[db] Applying migrations..."
pnpm prisma migrate deploy
# Feature 브랜치 동안에는 schema.prisma 가 prisma/migrations/ 보다 앞서 있을 수 있음
# (마이그레이션은 develop merge 후 CI 가 단일 writer). 매 SessionStart 마다 컨테이너
# 가 새로 부트스트랩되면 옛 init migration 만 적용되므로, 여기서 schema.prisma 와
# 한 번 더 reconcile 해 dev DB 가 항상 코드와 일치하도록 함.
# 격리 Docker DB 이므로 --accept-data-loss 는 안전 (개발자가 의도한 schema 변경 반영).
# 차이가 없으면 no-op.
echo "[db] Reconciling schema.prisma → DB (db push)..."
pnpm prisma db push --skip-generate --accept-data-loss
echo "[db] Generating Prisma Client..."
pnpm prisma generate >/dev/null
echo "[db] Seeding..."
pnpm prisma db seed

echo
echo "[db] Ready. DATABASE_URL=$DATABASE_URL"
echo "[db] If 'pnpm dev' was already running, restart it to pick up new DATABASE_URL."
