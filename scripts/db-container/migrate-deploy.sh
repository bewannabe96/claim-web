#!/usr/bin/env bash
# pnpm db:migrate:deploy — 기존 migrations/ 폴더의 모든 마이그레이션을 적용.
# 사용 시점: git pull 로 다른 worktree 에서 만든 migration 을 받았을 때.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/../set-workspace-env-vars.sh"
pnpm prisma migrate deploy
pnpm prisma generate
