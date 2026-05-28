#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash) — block `gh pr create` unless
# /pr-self-review has been run against the CURRENT HEAD.
#
# 정책:
# - `gh pr create` 외의 Bash 호출은 통과.
# - 마커 파일이 없거나, 마커의 SHA 가 현재 HEAD 와 다르면 차단.
# - 우회 없음 (강제 모드).
#
# Marker 파일: .claude/.pr-self-review-marker (단순 SHA 한 줄)
# 작성: scripts/hooks/mark-pr-self-review.sh (PostToolUse on Skill)

set +e

# jq 필수 — 없으면 fail-loud (silent 우회 방지).
if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<'EOF'
pr-self-review hook requires `jq` but it is not installed.
Install jq (`brew install jq`) so the gate can parse hook input.
EOF
  exit 2
fi

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# `gh pr create` 패턴이 아니면 통과. 단어 경계 매칭으로 우발적 substring 무시.
if ! printf '%s' "$command" | grep -qE '\bgh[[:space:]]+pr[[:space:]]+create\b'; then
  exit 0
fi

# git repo 가 아니면 통과 (희귀 케이스).
head=$(git rev-parse HEAD 2>/dev/null) || exit 0

marker_file=".claude/.pr-self-review-marker"

if [ ! -f "$marker_file" ]; then
  cat >&2 <<EOF
PR 생성 차단: 이 브랜치에 대해 /pr-self-review 가 실행되지 않았습니다.

먼저 /pr-self-review skill 을 호출해 최초 요청된 작업을 얼마나 잘 수행했는지
스스로 평가하세요. 평가가 끝나면 'gh pr create' 를 다시 시도하세요.

  Current HEAD: $head
EOF
  exit 2
fi

marker_sha=$(tr -d '[:space:]' < "$marker_file")

if [ "$marker_sha" != "$head" ]; then
  cat >&2 <<EOF
PR 생성 차단: /pr-self-review 가 stale 합니다.

  Reviewed HEAD: $marker_sha
  Current HEAD:  $head

리뷰 후 추가 커밋(또는 amend / rebase) 이 있었습니다.
/pr-self-review 를 현재 HEAD 에 대해 다시 실행한 뒤 'gh pr create' 를 시도하세요.
EOF
  exit 2
fi

exit 0
