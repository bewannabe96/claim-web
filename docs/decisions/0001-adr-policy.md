# ADR-0001: ADR 정책

**Status**: Accepted  
**Date**: 2026-05-28  
**Supersedes**: -  
**Superseded by**: -

## Context

24시간 돌아가는 AI 개발 팀 (여러 Claude 세션이 시차 두고 같은 코드베이스를 만짐) 을 도입하면서, **결정의 *이유*** 가 어디에도 영속화되지 않는 갭이 드러남:

- **커밋 메시지**: *무엇을* 했는지만 적음. *왜* 그 방향이었는지는 빠짐.
- **CLAUDE.md / docs/**: *현재* 규칙은 적혀 있지만, 옛날 어떤 대안이 검토됐고 왜 거부됐는지는 없음.
- **세션 컨텍스트**: Claude 의 thinking trace 는 세션 종료와 함께 휘발.

→ 6개월 뒤 다른 Claude 가 "이 패턴 이상하다, 리팩토링" 하다가 의도된 결정을 뒤집을 위험.

Anthropic 의 [Managed Agents 블로그](https://www.anthropic.com/engineering/managed-agents) 가 강조한 **"세션 ≠ 컨텍스트 윈도우, 세션은 외재화된 객체"** 와 결을 같이함 — ADR 은 결정 단위의 외재화된 세션 메모리.

## Decision

`docs/decisions/` 에 numbered ADR 을 작성한다. 다음 다섯 트리거 중 하나라도 해당하면 **ADR 작성 의무**:

1. **새 아키텍처 선택** — 새 디렉토리/모듈/추상화/외부 라이브러리 도입
2. **트레이드오프 판단** — 둘 이상의 합리적 대안 중 하나 선택
3. **옛 결정 번복** — 이전 ADR 또는 패턴을 뒤집음 (`Superseded by` 명시)
4. **외부 의존성 입출** — 신규 SaaS / API / SDK 도입 또는 제거
5. **코드 자체로 설명 안 되는 관습** — 명명 정책, 금지 규칙, 우회 패턴

### 형식

- 파일명: `NNNN-kebab-case-title.md` (4자리 zero-pad, 번호 재사용 금지)
- 본문: [`_template.md`](_template.md) 따름 — Status / Date / Context / Decision / Consequences / Alternatives / References
- 상태: `Proposed → Accepted → (Deprecated | Superseded by ADR-XXXX)`
- 길이: 짧게. 50~150 줄 권장. 길어지면 README/docs/ 로 분리 후 ADR 은 결정 요약 + 링크.

### 워크플로우

ADR 은 **PR 디프와 함께 들어옴**. 별도 승인 절차 없음 — 코드 리뷰 시 함께 검토. 큰 결정은 사용자에게 명시 확인 (ADR 작성 자체가 [CLAUDE.md "PR 만들기 전 필수 절차"](../../CLAUDE.md) 의 "사용자 확인" 카테고리에 해당).

번복 시: 기존 ADR 의 `Status` 를 `Superseded by ADR-NNNN` 으로 바꾸고, 새 ADR 에 `Supersedes: ADR-MMMM` 추가. 옛 ADR 삭제하지 않음 — 결정 이력 보존.

### 관련 문서와의 역할 분담

| 문서 | 역할 |
|---|---|
| `CLAUDE.md`, `src/**/CLAUDE.md` | *현재* 규칙. "이렇게 해라". |
| `docs/architecture.md`, `docs/*.md` | *현재* 구조와 흐름 설명. |
| `docs/decisions/NNNN-*.md` | *결정의 이유*. "왜 그렇게 했는가". |

규칙을 바꿀 때는 CLAUDE.md 갱신 + 새 ADR. 둘은 보완 관계.

## Consequences

### 긍정
- 24/7 AI 팀이 결정 이력을 공유 — 한 Claude 가 다른 Claude 의 의도를 거스르지 않음
- `/pr-self-review` 가 "새 아키텍처 도입인데 ADR 없음" 을 finding 으로 잡을 수 있게 됨
- 사용자가 잠든 동안 만들어진 결정도 사후에 추적 가능
- 옛 결정을 번복할 때 *왜* 옛것이 거부되는지 명시되어 같은 함정 재진입 방지

### 트레이드오프
- 작성 비용 — 가벼운 결정에는 오버헤드
- 작성/미작성의 경계가 주관적 — 트리거 5개는 가이드, 판단은 여전히 필요
- ADR 자체가 stale 될 위험 — 정기 정리 필요 (deprecate / supersede)

### 후속 영향
- [CLAUDE.md "PR 만들기 전 필수 절차"](../../CLAUDE.md) 가 ADR 트리거를 finding 으로 잡도록 정책 갱신
- 기존 핵심 결정 5개 backfill ([ADR-0002](0002-pr-quality-gate.md), [0003](0003-worktree-session-isolation.md), [0004](0004-dal-as-auth-boundary.md), [0005](0005-prisma-db-push-only.md))

## Alternatives considered

| 대안 | 왜 안 골랐는가 |
|---|---|
| ADR 없이 PR description 에 결정 로그 | PR 단위 — 코드 검색은 쉬워도, "이 결정의 ADR 어디?" 추적이 어려움. 머지된 PR 본문 변경 추적도 git 밖. |
| 모든 결정 ADR 의무 (트리거 없이) | 노이즈. typo 수정에도 ADR 쓰면 신호 묻힘. |
| ADR 없이 단일 `decisions.md` 누적 | 결정별 라이프사이클 (supersede / deprecate) 추적 불가, 머지 충돌 심함. |
| docs/adr/ 폴더명 | `decisions` 가 한국어 컨텍스트에서 더 읽기 쉽고, 약어 노출 안 함. |

## References

- 인덱스: [README](README.md)
- 템플릿: [_template.md](_template.md)
- Anthropic blog: <https://www.anthropic.com/engineering/managed-agents> — 세션 외재화의 사상적 출처
- Michael Nygard, "Documenting Architecture Decisions" — ADR 포맷 원형
