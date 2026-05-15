import "server-only";

import { MOCK_PLAN_REQUESTS } from "@/mocks/requests";

import { ACTIVE_STATUSES, type PlanRequest } from "./schema";

export async function getRequestById(id: string): Promise<PlanRequest | null> {
  return MOCK_PLAN_REQUESTS.find((r) => r.id === id) ?? null;
}

export async function getRequestByResultToken(
  token: string,
): Promise<PlanRequest | null> {
  return MOCK_PLAN_REQUESTS.find((r) => r.resultToken === token) ?? null;
}

/**
 * 같은 번호로 이미 dispatched 된 요청이 있는지 확인 — 중복 송부 차단용.
 * 휴대폰 번호는 OTP 단계에서 step3 와 함께 수집되므로 step3.phone 기준으로 확인.
 *
 * 현재 진행 중인 본 요청은 자기 자신이므로 excludeRequestId 로 제외.
 */
export async function hasActiveRequestForPhone(
  phone: string,
  excludeRequestId?: string,
): Promise<boolean> {
  return MOCK_PLAN_REQUESTS.some(
    (r) =>
      r.id !== excludeRequestId &&
      r.step3?.phone === phone &&
      ACTIVE_STATUSES.includes(r.status),
  );
}

/** 어드민 — 모니터링 */
export async function listAllRequests(): Promise<PlanRequest[]> {
  return [...MOCK_PLAN_REQUESTS].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
