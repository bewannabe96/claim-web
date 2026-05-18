#!/usr/bin/env bash
# Claude Code SessionEnd hook — worktree 한정 완전 정리.
#
# 절대 exit !=0 하지 않음 (세션 종료 차단 X).
# worktree 일 때만 동작 — 메인 리포에서는 silent skip.
# 동작: docker compose down -v (컨테이너 + 볼륨 완전 삭제).
# 다음 SessionStart 가 자동 풀 부트스트랩.

set +e

# worktree 판별 — git-dir != git-common-dir 이면 worktree.
GITDIR="$(git rev-parse --git-dir 2>/dev/null)"
COMMONDIR="$(git rev-parse --git-common-dir 2>/dev/null)"
[ -n "$GITDIR" ] && [ "$GITDIR" != "$COMMONDIR" ] || exit 0

command -v docker >/dev/null 2>&1 || exit 0
docker info >/dev/null 2>&1 || exit 0
[ -f docker-compose.yml ] || exit 0

# shellcheck disable=SC1091
source scripts/db-env.sh 2>/dev/null || exit 0
docker compose down -v >/dev/null 2>&1 || true

exit 0
