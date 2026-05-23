/**
 * 랜딩 페이지 (LP) 변형 실험 — 공유 상수 + 순수 검증.
 *
 * 같은 URL (`/`) 에서 서버가 device 마다 변형을 라운드로빈으로 배정 →
 * 쿠키로 sticky → 모든 변형의 성과를 PostHog 의 `lp_variant` super-property
 * 로 자동 비교한다. 흐름 전체는 [src/server/lp-variant.ts](../server/lp-variant.ts)
 * 의 모듈 헤더 + [src/app/(marketing)/CLAUDE.md](../app/(marketing)/CLAUDE.md)
 * 의 "랜딩 변형 (A/B)" 섹션 참조.
 *
 * 이 파일은 **순수 모듈** — server/client 양쪽이 import. Redis / cookie API
 * 같은 사이드 이펙트는 [src/server/lp-variant.ts](../server/lp-variant.ts) 가
 * 책임.
 *
 * # 실험 EPOCH
 *
 * Redis 카운터 키 / 쿠키 이름 / PostHog 변형 값에 `EXPERIMENT_EPOCH` 가 prefix
 * 되어 있다. 실험 자체를 갈아끼울 때 epoch 값만 올리면:
 *  - 새 카운터 (`lp:counter:<epoch>`) 가 0 부터 시작 → 라운드로빈 깨끗하게 리셋
 *  - 옛 쿠키 (`lp_v_<old>`) 는 자연 만료, 새 쿠키 이름 (`lp_v_<new>`) 로 재배정
 *  - PostHog 의 변형 값에도 epoch 가 박혀 옛/새 실험 데이터가 안 섞임 (예:
 *    `e1_v1` vs `e2_v1` — 같은 v1 이라도 다른 실험)
 *
 * # 변형 추가/제거
 *
 * `VARIANT_IDS` 한 줄만 갱신. 디스패처 ([landing-variant.tsx](../app/(marketing)/_components/landing-variant.tsx))
 * 의 switch 가 exhaustive 라 타입체크가 미커버 변형을 잡는다. 변형이 늘면
 * Redis modulo 가 자동으로 균등 분배.
 */

/**
 * 현재 활성 변형 ID 목록. **순서가 modulo 결과를 결정**하므로 중간 삽입 금지 —
 * 항상 끝에 push 하거나, 실험 자체를 epoch 올려 리셋할 것.
 *
 * v1 은 항상 control (현재 운영 중인 랜딩). v2+ 는 새 디자인.
 *
 * **현재 v2 비활성** — VariantV2 컴포넌트와 디렉토리 (`_components/variants/v2/`)
 * 는 보존되어 있고, dispatcher 에서만 빠져 있다. 다시 켜려면:
 *   1. 아래 배열에 `"v2"` 다시 추가
 *   2. [landing-variant.tsx](../app/(marketing)/_components/landing-variant.tsx)
 *      에 `import { VariantV2 }` + `case "v2"` 복구
 *   3. 옛 v2 쿠키와 카운터를 깨끗하게 분리하고 싶으면 EXPERIMENT_EPOCH 올림.
 *
 * 비활성 중 이미 v2 쿠키를 들고 있는 사용자는 isValidVariant 가 false 처리 →
 * 신규 배정 흐름을 다시 타고 v1 로 흘러간다 (modulo 가 v1 단일).
 */
export const VARIANT_IDS = ["v1"] as const;

export type VariantId = (typeof VARIANT_IDS)[number];

/**
 * 실험 epoch — 카운터/쿠키/PostHog 값에 prefix. 실험 리셋 시 올림 (e1 → e2).
 * 옛 epoch 의 쿠키를 들고 들어온 사용자는 신규로 간주되어 재배정된다.
 */
export const EXPERIMENT_EPOCH = "e1" as const;

/** Redis 카운터 키. INCR 의 단일 진입점. */
export const LP_COUNTER_KEY = `lp:counter:${EXPERIMENT_EPOCH}` as const;

/** 쿠키 이름. epoch 가 박혀 있어 실험 갈아끼울 때 옛 쿠키 자동 무효화. */
export const LP_COOKIE_NAME = `lp_v_${EXPERIMENT_EPOCH}` as const;

/**
 * 쿠키 수명 (초). 90일 — PostHog device cookie (기본 365일) 보다 짧게 잡아,
 * 분석 식별자가 살아있는 동안엔 변형 배정도 안정적이도록. 너무 길면 실험을
 * 종료해도 옛 쿠키가 오래 남고, 너무 짧으면 funnel 도중 재배정 위험.
 */
export const LP_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * QA / 스테이크홀더 데모용 강제 변형 query param. 쿠키 무시 + 휘발성 (쿠키
 * 안 박음). 운영 트래픽에 영향 안 주려고 underscore prefix.
 *
 * 사용 예: `/?_lp=v2` — 데모 중 변형 비교
 */
export const LP_FORCE_QUERY_PARAM = "_lp" as const;

/** runtime narrowing helper. Cookie / query param 의 임의 문자열을 좁힘. */
export function isValidVariant(value: unknown): value is VariantId {
  return (
    typeof value === "string" &&
    (VARIANT_IDS as readonly string[]).includes(value)
  );
}

/** modulo 기반 변형 선택. 카운터가 음수일 일 없지만 방어적으로 abs. */
export function variantFromCounter(counter: number): VariantId {
  const idx = Math.abs(Math.trunc(counter)) % VARIANT_IDS.length;
  return VARIANT_IDS[idx]!;
}
