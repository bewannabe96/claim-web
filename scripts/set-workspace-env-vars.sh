#!/usr/bin/env bash
# scripts/set-workspace-env-vars.sh — source 전용. 직접 실행하지 말 것.
#
# 호출자에 다음 환경변수 export:
#   WORKTREE_NAME           = basename(현재 디렉토리)
#   COMPOSE_PROJECT_NAME    = claim_<worktree-safe>          (docker compose 격리 키)
#   POSTGRES_HOST_PORT      = 55000..55999                    (worktree 이름 해시)
#   REDIS_HOST_PORT         = 56000..56999                    (worktree 이름 해시, postgres 와 다른 base)
#   DATABASE_URL            = postgresql://...:PORT/postgres?schema=claim
#   DIRECT_URL              = (DATABASE_URL 과 동일 — 로컬은 pooler 없음)
#   REDIS_URL               = redis://127.0.0.1:PORT
#
# 의도적 가정:
#   - 항상 worktree root 에서 호출됨 (pnpm scripts 가 cwd 보장).
#   - macOS / Linux 의 bash + shasum + zsh 호환.

set -euo pipefail

WORKTREE_NAME="$(basename "$(pwd)")"

# Docker 의 project name 규약: lowercase + [a-z0-9_-]. 그 외 문자는 '-' 로 치환.
SAFE_NAME="$(printf '%s' "$WORKTREE_NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')"
export WORKTREE_NAME
export COMPOSE_PROJECT_NAME="claim_${SAFE_NAME}"

# 결정론적 포트. sha256 의 앞 4 nibble 을 mod 1000. Postgres / Redis 가 같은 worktree
# 안에서 충돌하지 않도록 base 만 다르게 분리. 다른 worktree 와는 hash 가 달라 충돌 X.
HASH_HEX="$(printf '%s' "$WORKTREE_NAME" | shasum -a 256 | cut -c1-4)"
HASH_DEC=$((16#${HASH_HEX}))
export POSTGRES_HOST_PORT=$((55000 + HASH_DEC % 1000))
export REDIS_HOST_PORT=$((56000 + HASH_DEC % 1000))

LOCAL_URL="postgresql://postgres:postgres@127.0.0.1:${POSTGRES_HOST_PORT}/postgres?schema=claim"
export DATABASE_URL="$LOCAL_URL"
export DIRECT_URL="$LOCAL_URL"
export REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}"
