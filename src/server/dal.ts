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
 * 사용자 모델:
 *   - User (claim.user) — 모든 사용자 공통. id=nanoid, authId=auth.users.id (UUID).
 *   - Partner (claim.partner) — partner 추가 정보. id=User.id 공유.
 *   - Admin (claim.admin) — admin 추가 정보. id=User.id 공유.
 *
 * 역할 판단 = Partner / Admin extension row 존재(+active). 한 사용자가 둘 다 가질 수
 * 있음 — 각 require*Session() 은 해당 extension 만 확인. "Supabase 로그인 == 권한"
 * 이 아니라 매 요청마다 extension active 까지 확인해야 통과.
 *
 * 첫 로그인 시 User.authId 가 null → callback/action 이 email 로 lookup 후 authId 채움
 * (claim). 이후 로그인은 authId 로 직접 조회 (빠른 path).
 */

export type SessionUser = {
  id: string;          // nanoid (도메인 식별자)
  authId: string;      // UUID (= auth.users.id) — claim 완료된 사용자만 세션 발급
  email: string;
  name: string;
  phone: string | null;
};

export type PartnerSession = { kind: "partner"; user: SessionUser; partnerId: string };
export type AdminSession = { kind: "admin"; user: SessionUser; adminId: string };

/**
 * React.cache 로 same-request dedupe — server action 이 호출한 결과를 후속 layout
 * 재렌더가 재사용해 `cookies()` 를 두 번 호출하지 않도록. Next 16 + cacheComponents
 * 환경에서 server action 응답 phase 의 layout 재렌더가 `cookies()` 를 다시 부르면
 * "Invariant: Received an underlying cookies object that does not match either
 * cookies or mutableCookies" 가 발생하므로 cache 로 두 번째 호출 자체를 회피.
 */
export const getOptionalUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = getSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: {
      id: true,
      authId: true,
      email: true,
      name: true,
      phone: true,
    },
  });
  if (!user || !user.authId) return null;

  return {
    id: user.id,
    authId: user.authId,
    email: user.email,
    name: user.name,
    phone: user.phone,
  };
});

export async function getOptionalAdminSession(): Promise<AdminSession | null> {
  const user = await getOptionalUser();
  if (!user) return null;

  const admin = await prisma.admin.findUnique({
    where: { id: user.id },
    select: { id: true, active: true },
  });
  if (!admin || !admin.active) return null;

  return { kind: "admin", user, adminId: admin.id };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const s = await getOptionalAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}

export async function getOptionalPartnerSession(): Promise<PartnerSession | null> {
  const user = await getOptionalUser();
  if (!user) return null;

  const partner = await prisma.partner.findUnique({
    where: { id: user.id },
    select: { id: true, active: true },
  });
  if (!partner || !partner.active) return null;

  return { kind: "partner", user, partnerId: partner.id };
}

export async function requirePartnerSession(): Promise<PartnerSession> {
  const s = await getOptionalPartnerSession();
  if (!s) redirect("/partner/login");
  return s;
}
