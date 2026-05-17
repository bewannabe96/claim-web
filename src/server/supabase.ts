import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase 서버 클라이언트.
 *
 * @supabase/ssr 의 cookie-based 세션 패턴. anon/publishable key 사용 — service_role
 * 이 아니므로 RLS 적용을 받음. Auth flow (signIn/signOut/getUser) 는 이걸 사용.
 *
 * Server Component 같은 read-only 컨텍스트에서는 cookieStore.set 이 throw 할 수
 * 있어 try/catch 로 감쌈. proxy.ts 와 server action 안에서는 정상적으로 세션
 * cookie 갱신이 이뤄짐.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component 에서는 set 호출 불가 — proxy.ts 가 cookie 갱신 담당.
          }
        },
      },
    },
  );
}
