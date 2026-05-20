/**
 * Budget 범위 라벨 — step1-wizard chip 과 admin pricing-form row 양쪽이 공유.
 *
 * (min, max) 의 양 끝 규칙:
 *   - min === 0       → "N만원 미만"
 *   - max >= 9_999_999 → "N만원 이상" (sentinel: "상한 없음" 표현)
 *   - 그 외            → "A~B만원"
 *
 * 만원 단위로 떨어지지 않는 값도 들어올 수 있어 KRW.format 으로 천단위 구분만.
 */
const KRW = new Intl.NumberFormat("ko-KR");

// schema.ts 의 BUDGET_BOUND.max 와 같은 값 — 마지막 tier 의 "이상" 표기 트리거.
const BUDGET_MAX_SENTINEL = 9_999_999;

export function formatBudgetRange(min: number, max: number): string {
  if (min === 0) return `${KRW.format(Math.ceil((max + 1) / 10_000))}만원 미만`;
  if (max >= BUDGET_MAX_SENTINEL) return `${KRW.format(min / 10_000)}만원 이상`;
  return `${KRW.format(min / 10_000)}~${KRW.format(max / 10_000)}만원`;
}
