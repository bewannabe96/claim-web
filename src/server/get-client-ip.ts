import "server-only";

import { headers } from "next/headers";

/**
 * Server Action / Route Handler 에서 호출자의 IP 를 best-effort 로 추출.
 *
 * 우선순위:
 *   1. `x-forwarded-for` 의 첫 IP (reverse proxy / Vercel / Cloudflare 가 채움)
 *   2. `x-real-ip` (일부 환경의 대체 헤더)
 *   3. "127.0.0.1" (로컬 dev fallback)
 *
 * 주의 — `x-forwarded-for` 는 클라가 임의로 보낼 수 있어 절대적 신뢰는 못 함.
 * MVP 의 IP 기반 레이트리밋은 best-effort. 강한 차단은 reverse proxy 단의
 * 보장된 헤더(예: Vercel `x-vercel-forwarded-for`, Cloudflare `cf-connecting-ip`)
 * 로 격상 가능.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "127.0.0.1";
}
