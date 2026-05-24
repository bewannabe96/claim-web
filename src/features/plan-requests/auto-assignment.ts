/**
 * 후보 풀에서 selectLimit 명을 seed(=요청서 id) 기준으로 결정적으로 추출.
 *
 * 같은 seed 면 새로고침/뒤로가기로 재진입해도 항상 같은 조합 — 무작위가 아니라
 * seed 에 대해 결정적. 요청서마다는 다른 조합이 나온다.
 *
 * **사용 위치**:
 *  - [src/app/(marketing)/plan-request/[id]/candidates/page.tsx](../../app/(marketing)/plan-request/[id]/candidates/page.tsx) —
 *    설계사 선택 단계 frontend skip (develop #125).
 *  - [src/features/plan-requests/actions.ts](actions.ts) `autoSelectAndAdvance` —
 *    랜딩 챗봇 변형 v4 가 사용자에게 후보 단계를 노출하지 않고 백그라운드로 자동
 *    배정 + status='confirming' 까지 진행하기 위해 호출.
 *
 * 두 호출처가 같은 seed(=requestId) 로 같은 후보 풀에 대해 호출하면 동일 조합을
 * 반환 — 한 사용자가 챗봇으로 진행하다 새로고침해 candidates URL 로 떨어져도
 * 후보가 안 바뀐다. (현재 챗봇 흐름은 그 URL 을 거치지 않지만 결정성은 안전망.)
 */

/** PartnerCard 의 id 만 의존 — 순환 import 회피 위해 좁힌 타입. */
type Pickable = { readonly id: string };

export function pickAssignedPartners<T extends Pickable>(
  items: readonly T[],
  count: number,
  seed: string,
): T[] {
  return [...items]
    .map((item) => ({ item, key: hashSeed(seed + item.id) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((entry) => entry.item);
}

/** 문자열 → 32bit 부호없는 해시 (FNV-1a). pickAssignedPartners 의 정렬 키. */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
