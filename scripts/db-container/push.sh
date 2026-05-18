#!/usr/bin/env bash
# pnpm db:push — schema.prisma → 로컬 격리 DB 직접 sync. Migration 생성 안 함.
#
# 일상적인 PR 작업의 표준 명령:
#   1. schema.prisma 편집
#   2. pnpm db:push     ← migration 없이 즉시 DB 반영
#   3. pnpm dev 로 작동 확인
#   4. PR 생성 — schema.prisma 만 commit (prisma/migrations/ 변경 금지, CI 가 차단)
#   5. develop merge 후 CI 가 자동으로 prisma migrate dev 호출해 정식 migration 생성
#
# Drift 우려 없음 — 격리 DB 라 reset 무손실.
# Migration 생성이 정말 필요한 경우 (data migration 등 manual SQL) 는 별도 절차.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/../set-workspace-env-vars.sh"

pnpm prisma db push --skip-generate
pnpm prisma generate
echo "[db] Pushed schema.prisma to local DB (no migration created)."
