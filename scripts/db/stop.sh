#!/usr/bin/env bash
# pnpm db:stop — 컨테이너만 정지 (볼륨 보존). 데이터 초기화는 db:reset.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/../db-env.sh"
docker compose stop postgres
echo "[db] Stopped $COMPOSE_PROJECT_NAME (data preserved)."
