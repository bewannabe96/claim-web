import "server-only";

import { redirect } from "next/navigation";

/**
 * Data Access Layer.
 *
 * 인증/세션의 단일 진입점.
 *
 * PRD 모델:
 * - 가입자: 계정 없음 (휴대폰 번호가 식별자) → DAL 미사용
 * - 설계사: 이메일/비번 로그인 → AgentSession
 * - 어드민: 단일 계정 → AdminSession
 *
 * MVP는 데모 세션 반환. 실제 인증 도입 시 호출부 무수정.
 */

export type AdminSession = { kind: "admin"; userId: string };
export type AgentSession = { kind: "agent"; userId: string; agentId: string };

const DEMO_ADMIN: AdminSession = { kind: "admin", userId: "admin-demo" };
const DEMO_AGENT: AgentSession = {
  kind: "agent",
  userId: "agent-user-demo",
  agentId: "agent-001",
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

export async function getOptionalAgentSession(): Promise<AgentSession | null> {
  // TODO(auth): 실제 설계사 인증
  return DEMO_AGENT;
}

export async function requireAgentSession(): Promise<AgentSession> {
  const s = await getOptionalAgentSession();
  if (!s) redirect("/agent/login");
  return s;
}
