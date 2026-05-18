import "server-only";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase 서버 클라이언트.
 *
 * @supabase/ssr 의 cookie-based 세션 패턴. anon/publishable key 사용 — service_role
 * 이 아니므로 RLS 적용을 받음. Auth flow (signIn/signOut/getUser) 는 이걸 사용.
 *
 * 읽기/쓰기 비대칭:
 * - 읽기 (getAll): `headers()` 의 raw `Cookie` 헤더를 직접 파싱. Next 16 의
 *   `cookies()` API 는 server action → revalidate → layout 재렌더 흐름에서
 *   "Invariant: Received an underlying cookies object that does not match either
 *   cookies or mutableCookies" 를 throw 하지만, headers 기반 read 는 영향 없음.
 * - 쓰기 (setAll): mutable context (middleware / server action / route handler)
 *   에서만 동작. Server Component / 재렌더 컨텍스트에서는 throw 하므로 silent
 *   skip. 토큰 silent refresh 는 middleware 가 매 요청 담당하므로 누락 없음.
 */
export function getSupabaseServerClient() {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: async () => parseCookieHeader((await headers()).get("cookie")),
        setAll: async (toSet) => {
          try {
            const store = await cookies();
            for (const { name, value, options } of toSet) {
              store.set(name, value, options);
            }
          } catch {
            // Read-only context — middleware 가 cookie 갱신 담당.
          }
        },
      },
    },
  );
}

/** `Cookie` 헤더 (RFC 6265) → @supabase/ssr 이 기대하는 `{name, value}[]` */
function parseCookieHeader(
  header: string | null,
): { name: string; value: string }[] {
  if (!header) return [];
  return header
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return { name: pair, value: "" };
      return {
        name: pair.slice(0, eq),
        value: decodeURIComponent(pair.slice(eq + 1)),
      };
    });
}
