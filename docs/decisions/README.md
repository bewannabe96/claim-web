# Architecture Decision Records (ADR)

이 폴더는 **"왜 그렇게 했는가"** 의 단일 진실 공급원.

- **CLAUDE.md / docs/architecture.md** → *현재* 규칙과 구조
- **docs/decisions/** → 그 규칙이 *왜* 그렇게 되었는지, 어떤 대안이 있었는지, 어떤 트레이드오프를 받아들였는지

새 Claude 세션이나 6개월 뒤 본인이 코드를 봤을 때 "왜 이렇게 했지?" 를 추적할 수 있도록.

## 정책

전체 정책은 [ADR-0001](0001-adr-policy.md) 참조. 요약:

- **트리거**: (1) 새 아키텍처 선택, (2) 트레이드오프 판단, (3) 옛 결정 번복, (4) 외부 의존성 입출, (5) 코드 자체로 설명 안 되는 관습 — 중 하나면 ADR 의무.
- **작성 주체**: Claude 또는 사용자. PR 디프와 함께 리뷰.
- **상태 흐름**: `Proposed → Accepted → (Deprecated | Superseded by ADR-XXXX)`.
- **번호**: zero-padded 4자리 (`0001`), 순차 부여, 재사용 금지.

## 인덱스

| # | 제목 | 상태 | 날짜 |
|---|---|---|---|
| [0001](0001-adr-policy.md) | ADR 정책 | Accepted | 2026-05-28 |
| [0002](0002-pr-quality-gate.md) | PR 품질 게이트 — lint/build CI + pr-self-review hook | Accepted | 2026-05-28 |
| [0003](0003-worktree-session-isolation.md) | Worktree 단위 Docker 격리 | Accepted | 2026-05-28 |
| [0004](0004-dal-as-auth-boundary.md) | DAL 이 진짜 인증 boundary, middleware 는 optimistic | Accepted | 2026-05-28 |
| [0005](0005-prisma-db-push-only.md) | Prisma db push 만 사용, migrate dev 금지 | Accepted | 2026-05-28 |

## 새 ADR 작성

1. 다음 번호로 파일 생성: `cp _template.md NNNN-kebab-case-title.md`
2. 본문 채우기.
3. 위 인덱스 표에 한 줄 추가.
4. 관련 CLAUDE.md / docs 에 `[ADR-NNNN](docs/decisions/NNNN-...)` 역참조 추가.
5. PR 디프에 포함 — 다른 코드 변경과 함께 리뷰.
