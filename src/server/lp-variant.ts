import "server-only";

import { cookies, headers } from "next/headers";

import {
  EXPERIMENT_EPOCH,
  isValidVariant,
  LP_COOKIE_NAME,
  LP_COUNTER_KEY,
  LP_FORCE_QUERY_PARAM,
  VARIANT_IDS,
  variantFromCounter,
  type VariantId,
} from "@/lib/lp-variant";

import { getRedis } from "./redis";

/**
 * 랜딩 페이지 변형 (A/B) 서버측 배정 — Redis INCR 로 라운드로빈, 쿠키로 sticky.
 *
 * # 책임
 *
 * - `resolveLpVariant()` — Server Component 가 호출. 우선순위는 [§ 우선순위] 참조.
 *   결과는 `{ variant, justAssigned, fromForce }` 트리플 — page.tsx 가 받아
 *   dispatch + cookie write + exposure 발화에 사용.
 *
 * - `assignLpVariant()` — Redis INCR + modulo. 봇 / Redis 장애 시엔 control
 *   변형으로 fallback (실험 모집단을 오염시키지 않음).
 *
 * # 우선순위 (resolveLpVariant)
 *
 *   1. `?_lp=v2` 쿼리 (QA / 데모 강제) — 쿠키 안 박음, justAssigned=false
 *   2. `lp_v_<epoch>` 쿠키 — 있으면 그 값 그대로
 *   3. assignLpVariant() — Redis 라운드로빈으로 새 배정, justAssigned=true
 *
 * # 쿠키 write 책임 분리
 *
 * 서버는 쿠키를 **읽기만** 한다 (Server Component 의 render 중엔 쿠키 write
 * 불가). 첫 배정 시 page.tsx 가 `<CookieSetter />` (client leaf) 를 함께
 * 렌더해 `document.cookie` 로 박는다.
 *
 *   - 장점: middleware 의존 0 → Turbopack dev 에서도 동일 흐름
 *           (`middleware.ts` 는 Turbopack 16.2.4 dev 에서 실행 안 됨)
 *   - 트레이드오프: 첫 SSR 응답 ~ 클라 hydration 사이 1회는 쿠키 미적용 →
 *                 같은 device 가 동시에 두 탭을 열면 둘 다 신규로 인식돼 각자
 *                 다른 변형을 받을 수 있다. 첫 탭이 쿠키 박은 뒤 두 번째 탭은
 *                 이미 SSR 끝나 있어 못 봄. 저트래픽 / 보통 한 탭 사용 기준
 *                 무시 가능한 케이스. 일관 보장 필요해지면 middleware 로 격상.
 *
 * # 봇 가드
 *
 * 크롤러가 라운드로빈에 끼면:
 *  - Redis 카운터가 사람-아닌 트래픽으로 오염 → 실제 사용자 분배가 비대칭
 *  - 검색엔진이 한 변형만 색인 → SEO 일관성 손상
 *
 * 따라서 UA 기반으로 봇은 control (v1) 고정 + INCR / 쿠키 스킵.
 * 검출은 [BOT_UA_REGEX] 의 헐겁고 안전한 패턴 — 잘 알려진 크롤러만 잡고
 * 의심스러우면 사람으로 분류 (false negative 가 false positive 보다 안전:
 * 카운터 오염이 SEO 누락보다 회복하기 어렵다).
 *
 * # Redis 장애 fallback
 *
 * Redis 다운 / 타임아웃이 랜딩 렌더를 막으면 conversion 자체가 죽는다. INCR
 * 실패 시 catch → control (v1) 변형 + 쿠키 안 박음 + `console.error` 만.
 * 후속 방문 때 Redis 회복되면 정상 배정 재개.
 */

/**
 * 잘 알려진 크롤러만 잡는 헐거운 정규식. 새 크롤러는 등장할 때 추가.
 * `i` 플래그로 대소문자 무시.
 */
const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bing|baidu|yandex|duckduck|facebookexternalhit|whatsapp|telegram|twitterbot|linkedinbot|kakaotalk-scrap|googlebot|adsbot|mediapartners|google-inspectiontool|gptbot|claudebot|anthropic|ccbot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|sitebulb/i;

function isLikelyBot(ua: string | null): boolean {
  if (!ua) return true; // UA 없는 요청은 안전하게 봇으로 분류 (legit 브라우저는 항상 보냄)
  return BOT_UA_REGEX.test(ua);
}

export type ResolvedLpVariant = {
  variant: VariantId;
  /** 이번 요청이 첫 배정인가 (=쿠키 신규 생성 + lp_exposure 발화 대상). */
  justAssigned: boolean;
  /** `?_lp=` 강제 override 인가 (=쿠키 안 박고 PostHog exposure 도 안 발화). */
  fromForce: boolean;
};

/**
 * page.tsx 의 단일 진입점. searchParams 는 Next 16 에서 async — 호출자가
 * 미리 `await` 한 값(또는 그대로 Promise 의 resolved record) 을 넘긴다.
 *
 * @param searchParams page 의 awaited searchParams (없으면 빈 객체)
 */
export async function resolveLpVariant(
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<ResolvedLpVariant> {
  // 1. 강제 override (QA / 데모). 쿠키 안 박음.
  const forced = pickFirstSearchParam(searchParams[LP_FORCE_QUERY_PARAM]);
  if (forced && isValidVariant(forced)) {
    return { variant: forced, justAssigned: false, fromForce: true };
  }

  // 2. 기존 쿠키.
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LP_COOKIE_NAME)?.value;
  if (isValidVariant(fromCookie)) {
    return { variant: fromCookie, justAssigned: false, fromForce: false };
  }

  // 3. 신규 배정.
  const variant = await assignLpVariant();
  return { variant, justAssigned: true, fromForce: false };
}

/**
 * Redis INCR 로 라운드로빈 배정. 봇 / Redis 장애 시 control (첫 번째 변형)
 * fallback. 호출자는 결과 변형을 쿠키로 박을 책임이 있다 (CookieSetter).
 *
 * **봇 / fallback 시에도 같은 control 을 반환** — 호출자가 "이게 신규 배정인지"
 * 알 필요 없음. 단, 봇/fallback 케이스에선 쿠키 write 도 의미 없으므로
 * `<CookieSetter />` 의 client 측 가드 (UA 검사) 가 한 번 더 무시할 수 있게
 * 한다 — 봇은 어차피 JS 실행 안 하니 자동 스킵.
 *
 * 외부 호출 없음 — `resolveLpVariant()` 의 내부 helper. 단위 테스트 시점에
 * export 풀 것.
 */
async function assignLpVariant(): Promise<VariantId> {
  const h = await headers();
  const ua = h.get("user-agent");
  if (isLikelyBot(ua)) {
    return VARIANT_IDS[0]; // control. 카운터 안 건드림.
  }

  try {
    const counter = await getRedis().incr(LP_COUNTER_KEY);
    return variantFromCounter(counter);
  } catch (err) {
    console.error("[lp-variant] redis incr failed; falling back to control", {
      epoch: EXPERIMENT_EPOCH,
      err,
    });
    return VARIANT_IDS[0];
  }
}

function pickFirstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
