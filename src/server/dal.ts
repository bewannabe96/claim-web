import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { prisma } from "@/server/db/prisma";
import { getSupabaseServerClient } from "@/server/supabase";

/**
 * Data Access Layer.
 *
 * 인증/세션의 단일 진입점.
 *
 * PRD 모델:
 * - 가입자: 계정 없음 (휴대폰 번호가 식별자) → DAL 미사용
 * - 설계사: 일회용 토큰 기반 (현재 MVP) → DAL 미사용. 실 인증 도입 시 여기에 추가.
 * - 어드민: Supabase Auth + admin_users 화이트리스트 → AdminSession
 *
 * Admin 식별 = 인증(authn, Supabase) + 권한(authz, admin_users) 2단계.
 * "Supabase 로그인 == admin" 은 위험 — 같은 auth.users 풀에 Partner 도 들어올 예정.
 */

export type AdminSession = { kind: "admin"; userId: string };

/**
 * React.cache 로 same-request dedupe — server action 이 호출한 결과를 후속 layout
 * 재렌더가 재사용해 `cookies()` 를 두 번 호출하지 않도록. Next 16 + cacheComponents
 * 환경에서 server action 응답 phase 의 layout 재렌더가 `cookies()` 를 다시 부르면
 * "Invariant: Received an underlying cookies object that does not match either
 * cookies or mutableCookies" 가 발생하므로 cache 로 두 번째 호출 자체를 회피.
 */
export const getOptionalAdminSession = cache(
  async (): Promise<AdminSession | null> => {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = await prisma.adminUser.findUnique({
      where: { id: user.id },
      select: { id: true, active: true },
    });
    if (!admin || !admin.active) return null;

    return { kind: "admin", userId: admin.id };
  },
);

export async function requireAdminSession(): Promise<AdminSession> {
  const s = await getOptionalAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}
