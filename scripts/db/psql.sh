#!/usr/bin/env bash
# pnpm db:psql — 컨테이너 안 psql shell.
# 인자 전달: pnpm db:psql -c "SELECT 1"
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/../db-env.sh"
docker compose exec postgres psql -U postgres -d postgres "$@"
