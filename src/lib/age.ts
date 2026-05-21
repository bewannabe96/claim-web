/**
 * 만 나이 계산 — 생년월일(yyyy-mm-dd) + 기준 시각 → 완료된 햇수.
 *
 * 2023년 만 나이 통일법 이후 모든 행정·계약 연령 표기는 만 나이.
 * 보험 가입 나이도 이 기준이라 결과 페이지의 "현재 나이"·"가입 나이"는 동일값.
 *
 * 기준 캘린더는 KST — birthDate 자체가 한국 주민번호에서 derive 된 한국 날짜고,
 * 사용자는 모두 한국 거주자. UTC 직접 비교하면 한국 자정~오전 9시 구간에
 * 생일 판정이 하루 늦게 적용되는 버그.
 *
 * 잘못된 입력(빈 문자열, 형식 위반, 캘린더상 invalid date)은 null.
 */
export function computeAge(birthDate: string, asOf: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const birthUtc = Date.UTC(y, m - 1, d);
  if (Number.isNaN(birthUtc)) return null;
  // overflow (예: 2024-02-31) reject
  const verify = new Date(birthUtc);
  if (
    verify.getUTCFullYear() !== y ||
    verify.getUTCMonth() !== m - 1 ||
    verify.getUTCDate() !== d
  ) {
    return null;
  }

  // KST = UTC + 9h. asOf 에 offset 더한 뒤 UTC getter 로 KST 캘린더 일자 추출.
  const kst = new Date(asOf.getTime() + 9 * 60 * 60 * 1000);
  const ny = kst.getUTCFullYear();
  const nm = kst.getUTCMonth();
  const nd = kst.getUTCDate();
  let age = ny - y;
  if (nm < m - 1 || (nm === m - 1 && nd < d)) age -= 1;
  return age < 0 ? 0 : age;
}
