#!/usr/bin/env bash
# pnpm db:reset — 컨테이너 + 볼륨 완전 삭제. 데이터/스키마 모두 날아감.
# 다음 db:start 에서 깨끗하게 재구축.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/../db-env.sh"
docker compose down -v
echo "[db] Removed container and volume for $COMPOSE_PROJECT_NAME."
echo "[db] Run 'pnpm db:start' to rebuild."
