#!/usr/bin/env bash
# Claude Code SessionStart hook — silent best-effort.
#
# 절대 exit !=0 하지 않음 (세션 진입 막지 말 것).
# Docker daemon 미기동/CLI 없음/compose 파일 없음 모두 silent skip.
# 컨테이너만 띄움 — migration/seed 는 latency 큼 → pnpm db:start 에 위임.

set +e

command -v docker >/dev/null 2>&1 || exit 0
docker info >/dev/null 2>&1 || exit 0
[ -f docker-compose.yml ] || exit 0

# shellcheck disable=SC1091
source scripts/db-env.sh 2>/dev/null || exit 0
docker compose up -d postgres >/dev/null 2>&1 || true

exit 0
