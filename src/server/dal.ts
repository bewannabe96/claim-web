import "server-only";

import { redirect } from "next/navigation";

/**
 * Data Access Layer.
 *
 * 인증/세션의 단일 진입점.
 *
 * PRD 모델:
 * - 가입자: 계정 없음 (휴대폰 번호가 식별자) → DAL 미사용
 * - 설계사: 이메일/비번 로그인 → PartnerSession
 * - 어드민: 단일 계정 → AdminSession
 *
 * MVP는 데모 세션 반환. 실제 인증 도입 시 호출부 무수정.
 */

export type AdminSession = { kind: "admin"; userId: string };
export type PartnerSession = { kind: "partner"; userId: string; partnerId: string };

const DEMO_ADMIN: AdminSession = { kind: "admin", userId: "admin-demo" };
const DEMO_PARTNER: PartnerSession = {
  kind: "partner",
  userId: "partner-user-demo",
  partnerId: "partner-001",
};

export async function getOptionalAdminSession(): Promise<AdminSession | null> {
  // TODO(auth): 실제 어드민 인증
  return DEMO_ADMIN;
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
