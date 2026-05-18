#!/usr/bin/env bash
# pnpm db:logs — postgres 컨테이너 로그 follow.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/../db-env.sh"
docker compose logs -f postgres
