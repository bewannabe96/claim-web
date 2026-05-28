# ADR-0005: Prisma db push 만 사용, migrate dev 금지

**Status**: Accepted  
**Date**: 2026-05-28 (backfill — 실제 도입은 그 이전)  
**Supersedes**: -  
**Superseded by**: -

## Context

여러 worktree 가 결정론적 hash 로 격리된 Postgres 컨테이너를 갖는 환경 ([ADR-0003](0003-worktree-session-isolation.md)) 에서, Prisma 의 전통적 `prisma migrate dev` 흐름이 다음 문제를 일으킴:

- 각 worktree 가 자기 격리 DB 를 갖고 있어서, `migrate dev` 가 worktree 별 별개 migration 파일을 생성
- 두 worktree 가 다른 시점에 schema.prisma 를 수정 → 각자 다른 `YYYYMMDDHHMMSS_xxx` migration → 머지 시 동일 컬럼에 대해 conflict
- migration 파일이 사람 작업의 산물이 됨 → 머지 충돌 / 순서 의존 / squashing 필요
- 24/7 AI 팀에서는 충돌이 일상화 → 개발 흐름 막힘

추가 맥락:
- 운영 환경 (Vercel) 은 별도 배포-타임 마이그레이션 흐름 — 로컬 dev 의 migration 파일과 실제 prod schema 가 직접 일치할 필요 없음
- `schema.prisma` 자체가 이미 단일 진실 공급원

## Decision

**`schema.prisma` 만 commit 한다. `prisma/migrations/` 는 사람이 안 건드린다.**

### 일상 작업 흐름

```bash
# schema.prisma 편집 후
pnpm db:push        # = prisma db push --skip-generate + prisma generate
                    # 로컬 격리 DB 에 즉시 sync. migration 파일 없음.
```

### 금지 사항

- `pnpm prisma migrate dev` 직접 호출 금지
- `prisma/migrations/` 수동 편집 금지
- 위 둘은 PR CI ([.github/workflows/check-no-migrations.yml](../../.github/workflows/check-no-migrations.yml)) 가 차단

### 운영 환경 적용

운영 schema 적용은 별도 배포-타임 단계 (Vercel deploy hook / 운영자 직접 실행). 로컬 dev 흐름과 분리.

### 예외 — data migration

순수 schema 변경이 아닌 데이터 변환 (column 분할/병합, 값 정규화 등) 이 필요한 경우:
- PR 에 `manual-migration` 라벨 추가
- CI 가 라벨 감지하면 차단 skip
- `prisma/migrations/` 에 수동 SQL migration 작성 허용 (rare)

## Consequences

### 긍정
- worktree 간 migration 머지 충돌 0 — schema.prisma 만 머지하면 됨
- AI 팀 흐름에 부합 — Claude 가 schema 만 편집, migration 생성에 신경 안 씀
- schema-first — 의도가 한 곳에 집중, "왜 이 migration 이 있지" 추적 불필요
- worktree 격리와 자연스럽게 결합 — `pnpm db:push` 로 즉시 sync

### 트레이드오프
- 운영 환경 schema 적용 흐름이 로컬과 다름 — 별도 배포-타임 단계 필요. Vercel deploy hook 또는 운영자 수동 실행.
- 운영 schema 히스토리가 git 에 없음 — schema 의 시간순 변천 추적은 git log 의 schema.prisma 변경으로만
- data migration 은 예외 흐름 (manual-migration 라벨) — 흐름 두 개라 컨텍스트 전환 필요
- `prisma db push --accept-data-loss` 가 column drop / type change 시 데이터 손실 — 로컬에선 무해, 운영에선 안전망 필요

### 후속 영향
- [scripts/db-container/push.sh](../../scripts/db-container/push.sh) 와 [setup-workspace-env.sh](../../scripts/setup-workspace-env.sh) 가 정책 구현체 — 변경 시 ADR 갱신
- 운영 schema 적용 흐름이 정립되면 별도 ADR 작성 (현재 임시 운영자 흐름)
- `manual-migration` 라벨 사용 빈도가 잦아지면 정책 재검토 — data migration 흐름 자동화 검토

## Alternatives considered

| 대안 | 왜 안 골랐는가 |
|---|---|
| 표준 `prisma migrate dev` 흐름 | worktree 간 migration 충돌 일상화 — 24/7 AI 팀에서 막힘 |
| Squash migration on merge | 머지 자동화 복잡, conflict 해결을 자동화로 미루는 거지 없애는 게 아님 |
| Schema-only commit + 머지 시 운영자 수동 squash | 머지 시 사람 개입 필수 → 자동화 흐름 깨짐 |
| Atlas / dbmate 같은 별도 migration 도구 | 도입 비용, Prisma client 와 별도 동기화 필요, 학습 곡선 |
| Drizzle / Kysely 등 다른 ORM | ORM 전환은 별개 결정 — db push 정책 자체는 ORM 독립 |

## References

- 정책 구현: [scripts/db-container/push.sh](../../scripts/db-container/push.sh)
- CI 가드: [.github/workflows/check-no-migrations.yml](../../.github/workflows/check-no-migrations.yml)
- 부트스트랩: [scripts/setup-workspace-env.sh](../../scripts/setup-workspace-env.sh)
- 정책 문서: [CLAUDE.md "로컬 인프라" 섹션](../../CLAUDE.md), [scripts/CLAUDE.md](../../scripts/CLAUDE.md)
- 관련 ADR: [[0003-worktree-session-isolation]] — 격리가 이 정책의 전제
