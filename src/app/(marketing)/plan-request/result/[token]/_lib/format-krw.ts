/**
 * 원 → "5,000만원" / "1억 2,000만원" / "1억원" 형태로 표시.
 * 결과 페이지 전반의 한국 원화 표기 유틸 — adapter / CoveragePanel 공유.
 *
 * 정책:
 *   - 0 → "0원"
 *   - 1만 미만 → "N원" (드물지만 가능)
 *   - 만 / 억 단위 끊고 0 인 단위는 생략
 */
export function formatKRW(n: number): string {
  if (n === 0) return "0원";
  const oku = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  const won = n % 10_000;
  const parts: string[] = [];
  if (oku > 0) parts.push(`${oku.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (won > 0) parts.push(`${won.toLocaleString("ko-KR")}`);
  return `${parts.join(" ")}원`;
}
