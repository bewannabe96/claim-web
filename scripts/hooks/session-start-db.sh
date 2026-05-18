#!/usr/bin/env bash
# Claude Code SessionStart hook — silent best-effort.
#
# 절대 exit !=0 하지 않음 (세션 진입 차단 X).
# 컨테이너 running 이면 no-op.
# 아니면 백그라운드로 풀 부트스트랩 (compose up + migration + seed). 로그는 .claude/db-bootstrap.log.

set +e

command -v docker >/dev/null 2>&1 || exit 0
docker info >/dev/null 2>&1 || exit 0
[ -f docker-compose.yml ] || exit 0

# shellcheck disable=SC1091
source scripts/db-env.sh 2>/dev/null || exit 0

# 컨테이너 이미 떠 있으면 latency 절약.
if docker ps --format '{{.Names}}' | grep -q "^${COMPOSE_PROJECT_NAME}_postgres$"; then
  exit 0
fi

# 없거나 stopped → 백그라운드 풀 부트스트랩. SessionStart 가 프롬프트 가리지 않도록 nohup + disown.
mkdir -p .claude
nohup bash scripts/db/start.sh >.claude/db-bootstrap.log 2>&1 &
disown

exit 0
