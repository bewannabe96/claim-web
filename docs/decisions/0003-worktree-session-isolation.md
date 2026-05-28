# ADR-0003: Worktree 단위 Docker 격리

**Status**: Accepted  
**Date**: 2026-05-28 (backfill — 실제 도입은 그 이전)  
**Supersedes**: -  
**Superseded by**: -

## Context

여러 작업 흐름 (사용자 + 여러 Claude 세션) 이 같은 코드베이스를 동시에 만지는 환경. branch-only 격리로는 다음이 막힐 수 없음:

- `schema.prisma` 변경 중 다른 흐름이 같은 DB 로 `prisma db push` → schema drift
- Redis 키 충돌 (OTP 코드, IP 레이트리밋 카운터 등 — 작업 격리 의도 깨짐)
- dev 서버 포트 / Prisma client 캐시 충돌
- 한 흐름이 만든 seed 데이터가 다른 흐름의 가정 깨뜨림

24/7 AI 팀 비전 (여러 Claude 가 시차 두고 또는 동시에 작업) 에서는 이 충돌이 빈번해질 것이 자명.

## Decision

**Worktree 단위로 Docker postgres + redis 컨테이너를 격리** 한다.

- [scripts/set-workspace-env-vars.sh](../../scripts/set-workspace-env-vars.sh) 가 worktree 디렉토리명을 sha256 해시해 결정론적 포트 (postgres 55000–55999, redis 56000–56999) + `COMPOSE_PROJECT_NAME` 산출
- [scripts/setup-workspace-env.sh](../../scripts/setup-workspace-env.sh) (= `pnpm workspace:setup`) 가 멱등 부트스트랩: install → compose up → write .env.local → migrate deploy → db push → seed
- [SessionStart hook](../../scripts/hooks/worktree-session-start.sh) 이 Claude Code 세션 시작 시 컨테이너 부재면 백그라운드 부트스트랩 (latency 흡수)
- [SessionEnd hook](../../scripts/hooks/worktree-session-end.sh) 이 세션 종료 시 `docker compose down -v` (컨테이너 + 볼륨 완전 삭제 — cattle 패턴)
- [cleanup-orphans.sh](../../scripts/db-container/cleanup-orphans.sh) 가 사라진 worktree 의 잔존 컨테이너 회수

### 격리 경계

| 자원 | 공유 / 격리 |
|---|---|
| `schema.prisma` | 공유 (git 관리) |
| `prisma/migrations/` | 공유 (읽기 전용) |
| Postgres / Redis 컨테이너 | **worktree 별 격리** |
| `.env.local` | worktree 별 (DATABASE_URL 만 다르게) |

## Consequences

### 긍정
- Claude 세션끼리 schema/data 가 절대 부딪히지 않음 → 24/7 AI 팀 전제 조건
- Anthropic Managed Agents 의 "cattle 컨테이너" 패턴 그대로 구현 — 컨테이너 사망 = 폐기 → 재구축
- SessionEnd 가 down -v 하므로 다음 세션은 항상 깨끗한 DB 에서 시작 → 우발적 잔존 데이터로 인한 디버깅 함정 회피

### 트레이드오프
- Docker 의존 — Docker 없으면 dev 환경 불가 (fail-soft hook 가 silent skip 하지만 dev 서버는 DB 못 잡음)
- 첫 부트스트랩 시간 — 백그라운드라도 첫 명령이 DB 를 치면 wait 필요
- 디스크 사용 — worktree 수만큼 postgres 데이터 볼륨
- macOS Docker Desktop 의 IO 성능이 prod 환경과 다름 → 성능 디버깅 어려움

### 후속 영향
- 자격증명 격리도 비슷한 패턴으로 가야 함 ([P1 로드맵](#)) — 현재 `.env.local` 이 worktree 안에 평문 존재, Managed Agents 의 "샌드박스 밖 vault" 모델과 불일치
- 새 외부 의존성 (예: 향후 MinIO, ClickHouse 등) 추가 시 docker-compose.yml 에 같이 묶어 worktree 격리 유지

## Alternatives considered

| 대안 | 왜 안 골랐는가 |
|---|---|
| Branch-only 격리 (공유 DB) | schema/data 충돌 — 24/7 전제 깨짐 |
| 공유 Postgres + 워크트리별 schema namespace | Prisma 가 schema 동적 전환 안 지원 — 매번 generate 필요, 운영 환경과 path 다름 |
| In-memory SQLite | Postgres-only 기능 (jsonb, partial index, RLS 등) 사용 못함 → prod 와 환경 불일치 |
| Docker 대신 host-installed Postgres | 버전 고정 어려움, 포트/사용자 충돌, 정리 어려움 (down -v 같은 깔끔한 폐기 없음) |
| Vercel preview DB | preview 마다 띄우는 비용 + latency, 로컬 dev 흐름과 분리됨 |

## References

- 부트스트랩 스크립트: [scripts/](../../scripts/), [scripts/CLAUDE.md](../../scripts/CLAUDE.md)
- 환경변수 계산: [scripts/set-workspace-env-vars.sh](../../scripts/set-workspace-env-vars.sh)
- Compose 정의: [docker-compose.yml](../../docker-compose.yml)
- Hook 등록: [.claude/settings.json](../../.claude/settings.json)
- 워크플로우 전체 흐름: [docs/worktree-workflow.md](../worktree-workflow.md)
- 사상적 출처: <https://www.anthropic.com/engineering/managed-agents> — "cattle" 컨테이너 패턴
- 관련 ADR: [[0005-prisma-db-push-only]] — schema-first 정책의 짝
