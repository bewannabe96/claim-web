#!/usr/bin/env bash
# pnpm db:start — Docker postgres 기동 + .env.local 생성 + migration 적용 + seed.
# 멱등. 컨테이너가 이미 떠 있어도 안전 (docker compose up -d 는 no-op).
set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/../db-env.sh"

echo "[db] Worktree: $WORKTREE_NAME"
echo "[db] Project:  $COMPOSE_PROJECT_NAME"
echo "[db] Port:     $POSTGRES_HOST_PORT"

if ! command -v docker >/dev/null 2>&1; then
  echo "[db] ERROR: docker CLI not found. Install Docker Desktop or colima." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "[db] ERROR: Docker daemon not running. Start Docker Desktop / 'colima start' first." >&2
  exit 1
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
echo "[db] Generating Prisma Client..."
pnpm prisma generate >/dev/null
echo "[db] Seeding..."
pnpm prisma db seed

echo
echo "[db] Ready. DATABASE_URL=$DATABASE_URL"
echo "[db] If 'pnpm dev' was already running, restart it to pick up new DATABASE_URL."
