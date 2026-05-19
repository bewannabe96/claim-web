import "server-only";

import { getRedis } from "@/server/redis";

/**
 * 결제 제공자 추상화 — 실 PG 연동 (PortOne / Toss) 전에 인터페이스만 확정.
 *
 * 책임 분리:
 *   - initiatePayment: 결제 개시 → PG 위젯/리다이렉트 URL 반환. ledger 미작성.
 *   - verifyWebhook: 콜백 인증 + 정규화된 페이로드 추출. HMAC 검증은 실 구현체 책임.
 *
 * Stub 구현체는 dev 전용 — production NODE_ENV 에선 verifyWebhook 이 fail-closed.
 *
 * 실 PG 추가 시 (후속 PR):
 *   - HMAC-SHA256 + timingSafeEqual 패턴은 src/app/api/webhooks/eightytwo-judge-analysis/route.ts
 *     의 검증 로직 재사용.
 *   - paymentId → (partnerId, amount) 매핑은 PortOne/Toss 둘 다 자체적으로 못 채워주므로
 *     initiatePayment 시 Redis stash (이 파일의 stashPendingTopup) 에 보관 + verifyWebhook
 *     에서 조회.
 */

const PENDING_TOPUP_KEY_PREFIX = "topup:pending:";
const PENDING_TOPUP_TTL_SECONDS = 3600; // 1시간 — PG 위젯이 그 안에 콜백 보내야 함.

export type PendingTopup = {
  partnerId: string;
  amount: number;
};

/** PG 콜백이 paymentId 만 들고 와도 partnerId/amount 를 신뢰 가능하게. */
export async function stashPendingTopup(
  paymentId: string,
  payload: PendingTopup,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    PENDING_TOPUP_KEY_PREFIX + paymentId,
    JSON.stringify(payload),
    { ex: PENDING_TOPUP_TTL_SECONDS },
  );
}

export async function readPendingTopup(
  paymentId: string,
): Promise<PendingTopup | null> {
  const redis = getRedis();
  const raw = await redis.get(PENDING_TOPUP_KEY_PREFIX + paymentId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingTopup;
    if (
      typeof parsed?.partnerId !== "string" ||
      typeof parsed?.amount !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingTopup(paymentId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(PENDING_TOPUP_KEY_PREFIX + paymentId);
}

// ---------- 추상 인터페이스 ----------

export type PaymentInitInput = {
  partnerId: string;
  paymentId: string;
  amount: number;
  userEmail: string;
};

export type PaymentInitResult = {
  redirectUrl: string;
  providerName: string;
  providerRef?: string | null;
};

export type WebhookVerifyResult =
  | {
      ok: true;
      paymentId: string;
      partnerId: string;
      amount: number;
      providerRef: string | null;
    }
  | { ok: false; reason: "invalid_signature" | "malformed" | "unknown_payment" };

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(input: PaymentInitInput): Promise<PaymentInitResult>;
  verifyWebhook(
    rawBody: string,
    headers: Headers,
    searchParams: URLSearchParams,
  ): Promise<WebhookVerifyResult>;
}

// ---------- Stub 구현체 ----------

/**
 * Dev 전용 stub — 실제 PG 위젯 없이 충전 플로우를 끝까지 시뮬레이션.
 *
 * initiatePayment: stash 에 (partnerId, amount) 저장 + paymentId 만 담은 webhook URL 반환.
 *   브라우저가 그 URL 로 redirect → webhook route 가 verifyWebhook 호출.
 *
 * verifyWebhook: production fail-closed. dev 에선 stash 조회 결과를 그대로 반환.
 */
export class StubPaymentProvider implements PaymentProvider {
  readonly name = "stub";

  async initiatePayment(input: PaymentInitInput): Promise<PaymentInitResult> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "StubPaymentProvider 는 production 에서 사용할 수 없습니다. 실 PG 구현체를 설정하세요.",
      );
    }

    await stashPendingTopup(input.paymentId, {
      partnerId: input.partnerId,
      amount: input.amount,
    });

    // 브라우저 redirect → 같은 호스트의 webhook route 가 받음.
    const params = new URLSearchParams({ paymentId: input.paymentId });
    return {
      redirectUrl: `/api/webhooks/credits/stub?${params.toString()}`,
      providerName: this.name,
      providerRef: null,
    };
  }

  async verifyWebhook(
    _rawBody: string,
    _headers: Headers,
    searchParams: URLSearchParams,
  ): Promise<WebhookVerifyResult> {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "invalid_signature" };
    }

    const paymentId = searchParams.get("paymentId");
    if (!paymentId) {
      return { ok: false, reason: "malformed" };
    }

    const pending = await readPendingTopup(paymentId);
    if (!pending) {
      return { ok: false, reason: "unknown_payment" };
    }

    return {
      ok: true,
      paymentId,
      partnerId: pending.partnerId,
      amount: pending.amount,
      providerRef: null,
    };
  }
}
