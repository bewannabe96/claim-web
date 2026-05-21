/**
 * 서버 렌더 시점의 wall-clock — React 19 의 `react-hooks/purity` 룰이
 * 컴포넌트 본문에서 `Date.now()` 직접 호출을 금지하므로 외부 헬퍼로 분리.
 *
 * 호출 페이지는 dynamic 인디케이터 (`await cookies()` / `headers()` /
 * `connection()`) 를 먼저 호출해 prerender 단계에서 실행되지 않도록 보장해야 함
 * — cacheComponents=true 환경에서 prerender 에러 회피.
 */
export function nowMs(): number {
  return Date.now();
}
