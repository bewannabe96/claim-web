#!/usr/bin/env bash
# pnpm db:status — 모든 worktree 의 postgres 컨테이너를 한 화면에.
# COMPOSE_PROJECT_NAME 이 항상 claim_ prefix 라서 필터로 잡힘.
set -euo pipefail
docker ps -a --filter "name=^claim_.*_postgres$" \
  --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
