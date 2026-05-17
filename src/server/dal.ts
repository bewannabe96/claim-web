import "server-only";

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
 * - 설계사: 이메일/비번 로그인 → PartnerSession
 * - 어드민: Supabase Auth + admin_users 화이트리스트 → AdminSession
 *
 * Admin 식별 = 인증(authn, Supabase) + 권한(authz, admin_users) 2단계.
 * "Supabase 로그인 == admin" 은 위험 — 같은 auth.users 풀에 Partner 도 들어옴.
 */

export type AdminSession = { kind: "admin"; userId: string };
export type PartnerSession = { kind: "partner"; userId: string; partnerId: string };

const DEMO_PARTNER: PartnerSession = {
  kind: "partner",
  userId: "partner-user-demo",
  partnerId: "partner-001",
};

export async function getOptionalAdminSession(): Promise<AdminSession | null> {
  const supabase = await getSupabaseServerClient();
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
}

export async function requireAdminSession(): Promise<AdminSession> {
  const s = await getOptionalAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}

export async function getOptionalPartnerSession(): Promise<PartnerSession | null> {
  // TODO(auth): 실제 설계사 인증
  return DEMO_PARTNER;
}

export async function requirePartnerSession(): Promise<PartnerSession> {
  const s = await getOptionalPartnerSession();
  if (!s) redirect("/partner/login");
  return s;
}
