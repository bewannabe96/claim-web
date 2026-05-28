# ADR-0002: PR 품질 게이트 — lint/build CI + pr-self-review hook

**Status**: Accepted  
**Date**: 2026-05-28  
**Supersedes**: -  
**Superseded by**: -

## Context

24/7 AI 개발 팀 도입 (여러 Claude 가 동시에 worktree 에서 작업, 사용자가 잠든 동안에도 PR 이 쌓임) 을 결정한 시점에서, 품질 검수 체계의 갭이 드러남:

- 자동 검수 워크플로우는 [check-no-migrations.yml](../../.github/workflows/check-no-migrations.yml) 하나 — `prisma/migrations/` 차단만.
- lint / build / typecheck 가 PR 시점에 자동 실행되지 않음 → 빌드 깨진 PR 이 머지될 수 있음.
- 사용자가 직접 `/pr-self-review` skill 을 PR 전에 돌리고 있었으나, AI 가 비대면으로 PR 만들면 이 단계 누락.

→ 사람 리뷰가 유일한 방어선. 여러 worktree 가 동시 PR 을 쌓는 환경에서 병목.

## Decision

품질 검수를 **두 층**으로 나눠 자동화:

### 1. 서버측 — lint + build CI

[.github/workflows/ci.yml](../../.github/workflows/ci.yml) 가 PR 진입 시 `pnpm lint` + `pnpm build` 자동 실행. fail 시 GitHub UI 에서 차단.

### 2. 로컬측 — `/pr-self-review` SHA-pinned 게이트

PreToolUse hook ([scripts/hooks/require-pr-self-review.sh](../../scripts/hooks/require-pr-self-review.sh)) 가 `gh pr create` 호출 직전에 가로채:
- `.claude/.pr-self-review-marker` 파일 부재 → 차단
- 마커의 SHA != 현재 HEAD → stale 판정, 차단

PostToolUse hook ([mark-pr-self-review.sh](../../scripts/hooks/mark-pr-self-review.sh)) 가 `/pr-self-review` skill 완료 시 현재 HEAD SHA 를 마커에 기록.

### 3. Findings 자동 수렴 루프

[CLAUDE.md "PR 만들기 전 필수 절차"](../../CLAUDE.md) 정책:
- finding 은 Claude 가 적극 자체 처리 (stale 주석, 일관성, over-engineering, 누락 가드 등)
- 요구사항 해석/도메인 판단/합리적 해결책 분기는 사용자 확인
- 처리 후 커밋 → 마커 stale → `/pr-self-review` 자동 재실행
- 루프 상한 3회 — 초과 시 사용자에게 잔여 finding 공유 후 중단

우회 수단 없음 (`SKIP_=1` 같은 escape hatch 미제공).

## Consequences

### 긍정
- PR 머지 전 lint/build 무조건 통과 — 빌드 깨진 머지 방지
- AI 가 만든 PR 도 최소한 한 번은 자가 평가 + finding 처리 거침
- SHA 마커가 review-after-commit 함정을 차단 — stale 리뷰 통과 불가
- 자동 수렴 루프로 사용자 개입 빈도 ↓ → 24/7 흐름에 맞음

### 트레이드오프
- tiny doc fix 도 동일하게 `/pr-self-review` 거쳐야 함 — 정책상 의도
- jq 가 시스템에 설치되어 있어야 hook 동작 (fail-loud)
- CI build 가 모든 PR 에 ~3분 소요 — GitHub Actions 분 소모

### 후속 영향
- 사용자가 [CLAUDE.md "PR 만들기 전 필수 절차"](../../CLAUDE.md) 를 변경하면 정책 표류 위험 → ADR 갱신 의무
- 향후 테스트 러너 도입 시 ci.yml 에 추가 단계 (현재 테스트 코드 없음)
- 향후 자격증명 vault 분리 ([P1 로드맵](#)) 시 lint/build 의 dummy env 도 일관성 검토

## Alternatives considered

| 대안 | 왜 안 골랐는가 |
|---|---|
| `/pr-self-review` 도 GitHub Action 으로 옮김 | Skill 은 Claude 가 직접 호출해야 — Actions 에서 띄우려면 Claude API 별도 호출, 환경 복잡, 자가 평가 의미 약화 |
| timestamp 기반 마커 (5분/30분 윈도우) | 리뷰 후 커밋 함정 — stale 리뷰가 통과 |
| escape hatch (`SKIP_PR_SELF_REVIEW=1`) | 정책 자체 우회 가능 — 강제력 약화 |
| 마커에 finding 결과까지 인코딩 | skill 출력이 구조화되지 않아 파싱 취약, 복잡도 ↑ |
| 사람 리뷰만 유지 | 24/7 흐름에서 사람이 병목 — 정책 목적과 정면 충돌 |

## References

- 워크플로우: [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- Hook 스크립트: [scripts/hooks/require-pr-self-review.sh](../../scripts/hooks/require-pr-self-review.sh), [scripts/hooks/mark-pr-self-review.sh](../../scripts/hooks/mark-pr-self-review.sh)
- Hook 등록: [.claude/settings.json](../../.claude/settings.json) `hooks.PreToolUse` / `hooks.PostToolUse`
- 정책 문서: [CLAUDE.md "PR 만들기 전 필수 절차"](../../CLAUDE.md), [scripts/CLAUDE.md](../../scripts/CLAUDE.md)
- 사상적 배경: <https://www.anthropic.com/engineering/managed-agents>
