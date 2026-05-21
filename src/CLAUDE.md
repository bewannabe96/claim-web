# src/ — 코드 루트

이 트리의 **모든 디렉토리는 자체 CLAUDE.md를 가집니다.** 해당 디렉토리에서 작업하기 전에 그 CLAUDE.md를 먼저 읽으세요.

## 전체 아키텍처

진실 공급원: [docs/architecture.md](../docs/architecture.md). 새 패턴을 도입하기 전에 거기에 이미 정의돼 있는지 확인.

도메인 엔티티 이름 / 어휘 / 명명 컨벤션은 [docs/domain-glossary.md](../docs/domain-glossary.md) — 새 모델 / 라우트 / features 폴더 만들기 전에 확인.

## 디렉토리 책임 분리

| 디렉토리 | 책임 |
|---|---|
| [app/](app/CLAUDE.md) | 라우팅 (App Router). 페이지/레이아웃/route handler |
| [components/](components/CLAUDE.md) | 라우트 횡단(cross-route) 공유 UI. shadcn primitive는 `ui/` |
| [features/](features/CLAUDE.md) | 도메인 모듈 — schema(zod) + queries('server-only') + actions('use server') + ui |
| [server/](server/CLAUDE.md) | 서버 전용. DAL, 세션, DB 클라이언트. 모든 파일 `import 'server-only'` |
| [lib/](lib/CLAUDE.md) | 순수 유틸리티 (서버/클라 양쪽 사용 가능) |
| [types/](types/CLAUDE.md) | 도메인 타입 (zod에서 derive 못 하는 것만) |

## 어디에 새 코드를 둘까 — 의사결정 트리

1. **특정 라우트에서만 쓰는 컴포넌트?** → 그 라우트 폴더 안 `_components/` (private folder)
2. **여러 라우트에서 쓰는 도메인 로직(예: plan_proposal 검증/조회)?** → `features/<도메인>/`
3. **서버에서만 실행되는 데이터 접근?** → `server/` 또는 `features/<x>/queries.ts`, 첫 줄 `import 'server-only'`
4. **여러 도메인이 공유하는 UI 프리미티브?** → `components/ui/` (shadcn) 또는 `components/`
5. **어디에도 안 맞는 순수 함수?** → `lib/`

라우트 폴더에 `lib/`, `helpers/` 같은 임의 폴더를 만들지 말 것 — `_lib/` 또는 `_components/`만 사용.
