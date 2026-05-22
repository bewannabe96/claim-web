/**
 * 표시용 날짜·시각 포맷터 — 전부 KST(Asia/Seoul) 고정.
 *
 * 서버 런타임은 UTC(Vercel 기본)라 `Date` 의 `getHours()` / `getMonth()` 같은
 * 로컬 게터나 `timeZone` 없는 `Intl.DateTimeFormat` 을 그대로 쓰면 UTC 시각이
 * 노출된다. 화면에 보이는 모든 datetime 은 이 모듈을 거쳐 `Asia/Seoul` 로 강제한다.
 *
 * - 가입자/설계사 화면 → `formatDateTime` (한국어 친화 포맷)
 * - 어드민 화면 → `src/app/admin/(dashboard)/_lib/format.ts` 가 `getKstParts` 로
 *   단순 숫자 포맷을 조립 (역시 KST 고정).
 */

const TIME_ZONE = "Asia/Seoul";

function toDate(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

const DATE_TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "2025년 5월 22일 오후 2:30" — 가입자/설계사 화면 datetime 표준. */
export function formatDateTime(input: string | Date): string {
  return DATE_TIME_FMT.format(toDate(input));
}

const KST_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface KstParts {
  /** 4자리 연도 — "2025" */
  year: string;
  /** 2자리 월 — "05" */
  month: string;
  /** 2자리 일 — "22" */
  day: string;
  /** 2자리 시, 00–23 — "14" */
  hour: string;
  /** 2자리 분 — "30" */
  minute: string;
}

/** KST 기준 연·월·일·시·분 숫자 파트. 어드민 단순 포맷 등 커스텀 조립용. */
export function getKstParts(input: string | Date): KstParts {
  const parts = KST_PARTS_FMT.formatToParts(toDate(input));
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
}
