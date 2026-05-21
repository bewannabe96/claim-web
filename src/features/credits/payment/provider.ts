import "server-only";

import { getRedis } from "@/server/redis";

import type { PortOneSdkPayload } from "./types";

/**
 * 결제 제공자 추상화 — 실 PG (PortOne / Toss) 와 dev Stub 의 공통 boundary.
 *
 * 책임 분리:
 *   - initiatePayment: 결제 개시.
 *     · "redirect" → 그대로 브라우저 navigate (stub).
 *     · "sdk"      → client component 가 PortOne.requestPayment() 에 그대로 전달 (portone).
 *   - verifyWebhook: 콜백 인증 + 정규화된 이벤트 추출. HMAC 검증은 실 구현체 책임.
 *   - fetchPaymentStatus (optional): client SDK 가 결제 성공 반환한 직후 즉시 잔액
 *     갱신용 — Server Action `acknowledgeTopup` 가 호출. Webhook 가 redundant safety net.
 *   - cancelPayment (optional): 어드민 환불 UI 가 PG 측 실 환불 + ledger 작성을
 *     한 액션으로 묶기 위해. webhook 의 Transaction.Cancelled 는 cancellationId 멱등으로 no-op.
 *
 * Stub 구현체는 dev 전용 — production NODE_ENV 에서 verifyWebhook 이 fail-closed.
 *
 * 실 PG 추가 시:
 *   - HMAC-SHA256 + timingSafeEqual 패턴은 src/app/api/webhooks/eightytwo-judge-analysis/route.ts
 *     의 검증 로직 참고. PortOne 은 @portone/server-sdk 의 Webhook.verify 사용 권장 (Standard Webhooks).
 *   - paymentId → (partnerId, amount) 매핑은 PortOne/Toss 둘 다 자체적으로 못 채워주므로
 *     initiatePayment 시 Redis stash (이 파일의 stashPendingTopup) 에 보관 + 콜백 시 조회.
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
  /**
   * 구매자 휴대폰. KG이니시스 V2 등 일부 PG 가 필수 — partner 는 invitation 단계부터
   * phone 이 식별자라 항상 set, admin 호출 가능성 대비 nullable.
   */
  userPhone: string | null;
  /** 주문자 이름 (구매자 표시). PG 별로 영수증 / 발송 SMS 에 사용. */
  userName: string | null;
};

export type PaymentInitResult =
  | {
      kind: "redirect";
      redirectUrl: string;
      providerName: string;
      providerRef: string | null;
    }
  | {
      kind: "sdk";
      sdkPayload: PortOneSdkPayload;
      providerName: string;
      providerRef: string | null;
    };

/**
 * verifyWebhook 가 정규화해서 돌려주는 이벤트.
 * - topup_completed: 결제 승인 (Paid) — route 가 confirmTopup 호출.
 * - refund: 전체/부분 취소 — route 가 applyLedger(type='refund', idempotencyKey=cancellation:X).
 * - ignored: 의미 없는 이벤트 (VirtualAccountIssued / Failed / Ready 등) — route 가 200 OK 만.
 */
export type VerifiedWebhookEvent =
  | {
      kind: "topup_completed";
      paymentId: string;
      partnerId: string;
      amount: number;
      providerRef: string | null;
    }
  | {
      kind: "refund";
      paymentId: string;
      cancellationId: string;
      partnerId: string;
      amount: number;
      reason: string | null;
    }
  | { kind: "ignored"; rawType: string };

export type WebhookVerifyResult =
  | { ok: true; event: VerifiedWebhookEvent }
  | { ok: false; reason: "invalid_signature" | "malformed" | "unknown_payment" };

export type FetchPaymentStatusResult =
  | {
      ok: true;
      partnerId: string;
      amount: number;
      providerRef: string | null;
    }
  | { ok: false; reason: string };

export type CancelPaymentInput = {
  paymentId: string;
  amount: number;
  reason: string;
};

export type CancelPaymentResult =
  | { ok: true; cancellationId: string }
  | { ok: false; reason: string };

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(input: PaymentInitInput): Promise<PaymentInitResult>;
  verifyWebhook(
    rawBody: string,
    headers: Headers,
    searchParams: URLSearchParams,
  ): Promise<WebhookVerifyResult>;
  /**
   * Client SDK 가 결제 성공 반환 직후 호출 (acknowledgeTopup server action).
   * Stub 등 미구현 시 webhook 만 신뢰.
   */
  fetchPaymentStatus?(paymentId: string): Promise<FetchPaymentStatusResult>;
  /**
   * 어드민 환불 UI 의 진입점 — PG 측 실 환불을 수행 후 cancellationId 반환.
   * 미구현 provider 의 경우 어드민 환불 액션은 PG 호출 없이 ledger 만 기록.
   */
  cancelPayment?(input: CancelPaymentInput): Promise<CancelPaymentResult>;
}

// ---------- Stub 구현체 ----------

/**
 * Dev 전용 stub — 실제 PG 위젯 없이 충전 플로우를 끝까지 시뮬레이션.
 *
 * initiatePayment: stash 에 (partnerId, amount) 저장 + paymentId 만 담은 webhook URL 반환.
 *   브라우저가 그 URL 로 redirect → webhook route 가 verifyWebhook 호출.
 *
 * verifyWebhook: production fail-closed. dev 에선 stash 조회 결과를 그대로 반환.
 *
 * fetchPaymentStatus / cancelPayment: 미구현 — webhook 만 ledger 작성, 환불은 ledger 만.
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
      kind: "redirect",
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
      event: {
        kind: "topup_completed",
        paymentId,
        partnerId: pending.partnerId,
        amount: pending.amount,
        providerRef: null,
      },
    };
  }
}
