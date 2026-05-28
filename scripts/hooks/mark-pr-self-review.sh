#!/usr/bin/env bash
# Claude Code PostToolUse hook (matcher: Skill) — /pr-self-review 가 끝나면
# 현재 HEAD SHA 를 마커 파일에 기록.
#
# 이 마커를 require-pr-self-review.sh 가 PreToolUse(Bash on `gh pr create`) 시점에
# 현재 HEAD 와 비교해서 stale 여부 판단.
#
# 다른 skill 호출에는 no-op.

set +e

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

input=$(cat)
skill=$(printf '%s' "$input" | jq -r '.tool_input.skill // ""')

# anthropic-skills 플러그인 네임스페이스 와 bare 이름 둘 다 수용.
case "$skill" in
  pr-self-review|*:pr-self-review) ;;
  *) exit 0 ;;
esac

head=$(git rev-parse HEAD 2>/dev/null) || exit 0

mkdir -p .claude
printf '%s\n' "$head" > .claude/.pr-self-review-marker
exit 0
