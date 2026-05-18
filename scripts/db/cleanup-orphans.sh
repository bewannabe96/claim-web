#!/usr/bin/env bash
# pnpm db:cleanup-orphans — 메인 리포의 .claude/worktrees/ 에 없는 worktree 의
# claim_*_postgres 컨테이너 + pgdata 볼륨을 일괄 삭제. 확인 없이 진행.
#
# 메인 리포 / worktree 어디서 호출하든 동작.
# 안전 keep-list: .claude/worktrees/* 의 basename + 메인 리포 자체 basename.

set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "[cleanup] docker CLI not found." >&2
  exit 1
fi

# 메인 리포 root 찾기 (worktree 안에서 호출돼도 정확).
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$COMMON_DIR" ]; then
  echo "[cleanup] Not in a git repo." >&2
  exit 1
fi
MAIN_REPO="$(cd "$COMMON_DIR/.." && pwd)"
WORKTREES_DIR="$MAIN_REPO/.claude/worktrees"

# safe-name 변환은 db-env.sh 와 동일한 룰 유지 필수.
to_safe() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-'
}

# keep set: 메인 리포 + 모든 worktree 디렉토리의 safe-name.
keep=()
keep+=("$(to_safe "$(basename "$MAIN_REPO")")")
if [ -d "$WORKTREES_DIR" ]; then
  for d in "$WORKTREES_DIR"/*/; do
    [ -d "$d" ] || continue
    keep+=("$(to_safe "$(basename "$d")")")
  done
fi

removed=0
while IFS= read -r container; do
  [ -z "$container" ] && continue
  # claim_<safe>_postgres → <safe>.
  safe="${container#claim_}"
  safe="${safe%_postgres}"

  found=0
  for k in "${keep[@]}"; do
    if [ "$k" = "$safe" ]; then found=1; break; fi
  done

  if [ "$found" -eq 0 ]; then
    project="claim_${safe}"
    echo "[cleanup] Orphan: $container — removing container + ${project}_pgdata."
    docker rm -f "$container" >/dev/null 2>&1 || true
    docker volume rm "${project}_pgdata" >/dev/null 2>&1 || true
    removed=$((removed + 1))
  fi
done < <(docker ps -a --filter "name=^claim_.*_postgres$" --format '{{.Names}}')

echo "[cleanup] Removed $removed orphan(s)."
