/**
 * 어드민 화면 공용 포맷 유틸. 페이지마다 흩어져 있던 동일 로직을 한 곳에서 관리.
 *
 * datetime 은 전부 KST(Asia/Seoul) 고정 — `getKstParts` 경유. 어드민은 단순
 * 숫자 포맷을 쓰지만 타임존은 가입자 화면과 동일하게 한국시간이어야 한다.
 */

import { getKstParts } from "@/lib/datetime";

/** YYYY-MM-DD HH:mm — 어드민 화면 datetime 표준. */
export function formatDateTime(input: string | Date): string {
  const { year, month, day, hour, minute } = getKstParts(input);
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatPhone(p: string): string {
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}
