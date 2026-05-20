import "server-only";

import * as PortOne from "@portone/server-sdk";
import type { Webhook as PortOneWebhook } from "@portone/server-sdk/webhook";

/**
 * `getPayment` 가 던지는 GetPaymentError 중 PAYMENT_NOT_FOUND 만 격리 식별.
 * SDK 가 PortOne.Payment.GetPaymentError 클래스를 노출하지만 import path 안정성을 위해
 * 구조 기반 체크 — `RestError` 후손 + `data.type === "PAYMENT_NOT_FOUND"`.
 */
function isPaymentNotFoundError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "data" in e &&
    typeof (e as { data: unknown }).data === "object" &&
    (e as { data: { type?: string } }).data?.type === "PAYMENT_NOT_FOUND"
  );
}

import { resolveOrigin } from "@/server/origin";
import {
  getPortOneChannelKey,
  getPortOneClient,
  getPortOneStoreId,
  getPortOneWebhookSecret,
} from "@/server/portone";

import {
  type CancelPaymentInput,
  type CancelPaymentResult,
  type FetchPaymentStatusResult,
  type PaymentInitInput,
  type PaymentInitResult,
  type PaymentProvider,
  readPendingTopup,
  stashPendingTopup,
  type WebhookVerifyResult,
} from "./provider";

/**
 * PortOne v2 PaymentProvider 구현.
 *
 * 흐름 한 줄 요약:
 *   1. initiatePayment → Redis stash + 브라우저 SDK 페이로드 반환 (TopupAmountForm 가 PortOne.requestPayment 호출).
 *   2. acknowledgeTopup (server action) → fetchPaymentStatus → confirmTopup (즉시 잔액 갱신).
 *   3. Webhook (Transaction.Paid) → verifyWebhook → confirmTopup. paymentId idempotency 로 (2) 와 충돌 무해.
 *   4. 환불: 어드민 UI → cancelPayment (PG 측 실 환불) → applyLedger(idempotencyKey=cancellation:X).
 *           webhook (Transaction.Cancelled) 는 같은 cancellationId 로 alreadyApplied no-op.
 *           외부 콘솔 환불은 webhook 만으로 ledger 작성 (createdById=null).
 *
 * partnerId 신뢰원:
 *   - 1순위: Redis stash (1시간 TTL).
 *   - 2순위: PortOne customData 필드 (initiatePayment 가 JSON.stringify 로 넣음, getPayment 응답이 string 으로 회수).
 *   두 값 모두 우리가 채우므로 위변조 가능성은 PortOne 서버 신뢰 모델에 위탁.
 */

const CUSTOM_DATA_VERSION = 1;

type CustomData = {
  v: 1;
  partnerId: string;
};

/**
 * 비대칭 직렬화 — browser-sdk 는 Record<string, any> 받음, server-sdk 의 Payment
 * 응답은 string 으로 회수. 우리는 항상 같은 구조 (`{ v, partnerId }`) 만 사용.
 */
function buildCustomData(partnerId: string): Record<string, unknown> {
  return { v: CUSTOM_DATA_VERSION, partnerId } satisfies CustomData;
}

function decodeCustomData(raw: string | undefined): CustomData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CustomData>;
    if (parsed?.v !== CUSTOM_DATA_VERSION || typeof parsed.partnerId !== "string") {
      return null;
    }
    return parsed as CustomData;
  } catch {
    return null;
  }
}

export class PortOnePaymentProvider implements PaymentProvider {
  readonly name = "portone";

  async initiatePayment(input: PaymentInitInput): Promise<PaymentInitResult> {
    // partnerId/amount 를 Redis 에 stash — webhook 도착 시 검증 + customData 의 backup.
    await stashPendingTopup(input.paymentId, {
      partnerId: input.partnerId,
      amount: input.amount,
    });

    // redirectUrl 은 사용자 브라우저가 deep-link 후 navigate 할 곳 — 같은 host 라 OK.
    // noticeUrls 는 PortOne 서버 → 우리 서버 호출 — localhost 면 PortOne 도달 불가라
    // 의도적으로 미지정. 콘솔에 등록된 webhook URL 만 사용 (환경별 분리는 콘솔 multi-webhook).
    const origin = await resolveOrigin();

    return {
      kind: "sdk",
      providerName: this.name,
      providerRef: null,
      sdkPayload: {
        storeId: getPortOneStoreId(),
        channelKey: getPortOneChannelKey(),
        paymentId: input.paymentId,
        orderName: `크레딧 충전 ${input.amount.toLocaleString("ko-KR")}원`,
        totalAmount: input.amount,
        currency: "KRW",
        payMethod: "CARD",
        customer: {
          customerId: input.partnerId,
          email: input.userEmail,
          // KG이니시스 V2 일반 결제는 phoneNumber 필수. 다른 PG 도 권장. partner 는
          // invitation 단계부터 phone 이 식별자라 항상 set — null 인 케이스는 정책 위반.
          ...(input.userPhone ? { phoneNumber: input.userPhone } : {}),
          ...(input.userName ? { fullName: input.userName } : {}),
        },
        customData: buildCustomData(input.partnerId),
        // 모바일 SDK 가 deep-link 종료 후 이동할 페이지. PC 는 무시.
        redirectUrl: `${origin}/partner/credits/topup/result`,
      },
    };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Headers,
    _searchParams: URLSearchParams,
  ): Promise<WebhookVerifyResult> {
    // PortOne SDK 는 plain Record 도 받지만 Headers.entries() 가 lower-cased key 보장.
    const headersObj = Object.fromEntries(headers.entries());

    let webhook: PortOneWebhook;
    try {
      webhook = await PortOne.Webhook.verify(
        getPortOneWebhookSecret(),
        rawBody,
        headersObj,
      );
    } catch (e) {
      if (e instanceof PortOne.Webhook.WebhookVerificationError) {
        return { ok: false, reason: "invalid_signature" };
      }
      throw e;
    }

    // Unrecognized 타입은 SDK 가 type-narrowing 으로 분리해주지 않으므로 직접 체크.
    // 모르는 type 은 모두 ignored 로 fall-through.
    if (typeof webhook.type !== "string") {
      return { ok: true, event: { kind: "ignored", rawType: "unrecognized" } };
    }

    if (webhook.type === "Transaction.Paid") {
      const status = await this.fetchPaymentStatus(webhook.data.paymentId);
      if (!status.ok) {
        // 콘솔 [호출 테스트] 또는 stale event — 200 OK 로 무시 (ignored).
        if (status.reason === "payment_not_found") {
          return {
            ok: true,
            event: { kind: "ignored", rawType: "Transaction.Paid:payment_not_found" },
          };
        }
        // 실 결제이지만 조회 실패 — transient. PortOne 재시도 유도.
        return { ok: false, reason: "unknown_payment" };
      }
      return {
        ok: true,
        event: {
          kind: "topup_completed",
          paymentId: webhook.data.paymentId,
          partnerId: status.partnerId,
          amount: status.amount,
          providerRef: status.providerRef,
        },
      };
    }

    if (
      webhook.type === "Transaction.Cancelled" ||
      webhook.type === "Transaction.PartialCancelled"
    ) {
      const refund = await this.resolveRefund(
        webhook.data.paymentId,
        webhook.data.cancellationId,
      );
      if (!refund.ok) {
        if (refund.reason === "payment_not_found") {
          return {
            ok: true,
            event: { kind: "ignored", rawType: `${webhook.type}:payment_not_found` },
          };
        }
        return { ok: false, reason: refund.reason };
      }
      return { ok: true, event: refund.event };
    }

    // VirtualAccountIssued / Failed / Ready / PayPending / DisputeCreated / DisputeResolved / CancelPending / BillingKey.* / Confirm
    // 모두 MVP 미처리 — 로그만 (route 가 200 OK 응답).
    return { ok: true, event: { kind: "ignored", rawType: webhook.type } };
  }

  /**
   * client SDK 가 결제 성공 반환 직후 acknowledgeTopup 가 호출.
   * 동일 함수가 webhook verifyWebhook 내부에서도 재사용됨 — 단일 진실 공급원.
   */
  async fetchPaymentStatus(paymentId: string): Promise<FetchPaymentStatusResult> {
    let payment;
    try {
      payment = await getPortOneClient().payment.getPayment({ paymentId });
    } catch (e) {
      // 콘솔 [호출 테스트] 는 dummy paymentId 로 보내므로 항상 PAYMENT_NOT_FOUND.
      // 실 결제도 극히 드물게 동일 에러 가능 (다른 store 의 결제 / 삭제됨) — 둘 다
      // 멱등 안전한 "no-op" 으로 처리. 다른 에러는 transient 로 간주, 호출자에게 위임.
      if (isPaymentNotFoundError(e)) {
        return { ok: false, reason: "payment_not_found" };
      }
      return {
        ok: false,
        reason: e instanceof Error ? e.message : "getPayment failed",
      };
    }

    if ("status" in payment && typeof payment.status === "string") {
      if (payment.status !== "PAID") {
        return { ok: false, reason: `not_paid:${payment.status}` };
      }
    } else {
      return { ok: false, reason: "unrecognized_status" };
    }

    // status="PAID" — PaidPayment 의 필드 안전하게 접근.
    const paid = payment as Extract<typeof payment, { status: "PAID" }>;

    // partnerId 회수: stash 우선, fallback customData.
    const stash = await readPendingTopup(paymentId);
    const decoded = decodeCustomData(paid.customData);
    const partnerId = stash?.partnerId ?? decoded?.partnerId ?? null;
    if (!partnerId) {
      return { ok: false, reason: "no_partner_id" };
    }

    const amount = paid.amount.total;
    // stash 가 살아 있으면 의도 금액과 PG 실 결제 금액 비교 — 위변조 차단.
    if (stash && stash.amount !== amount) {
      return { ok: false, reason: "amount_mismatch" };
    }

    return {
      ok: true,
      partnerId,
      amount,
      providerRef: paid.transactionId,
    };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult> {
    try {
      const result = await getPortOneClient().payment.cancelPayment({
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason,
      });
      // PaymentCancellation 의 union — 정상 흐름은 status="SUCCEEDED" 또는 "REQUESTED".
      // 우리는 id 만 필요. status="FAILED" 도 id 는 있지만 API 호출이 throw 했어야 정상.
      const cancellation = result.cancellation;
      if ("id" in cancellation && typeof cancellation.id === "string") {
        return { ok: true, cancellationId: cancellation.id };
      }
      return { ok: false, reason: "no_cancellation_id" };
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : "cancelPayment failed",
      };
    }
  }

  /**
   * 취소 webhook 페이로드 → 정규화. cancellation 정보는 webhook payload 에 amount 가
   * 없어 getPayment 로 보강 필요. cancellationId 로 매칭.
   *
   * payment_not_found 는 콘솔 테스트 / stale 로 보고 호출자가 ignored 로 처리하게 별도 reason.
   */
  private async resolveRefund(
    paymentId: string,
    cancellationId: string,
  ): Promise<
    | { ok: true; event: Extract<WebhookVerifyResult, { ok: true }>["event"] }
    | { ok: false; reason: "unknown_payment" | "malformed" | "payment_not_found" }
  > {
    let payment;
    try {
      payment = await getPortOneClient().payment.getPayment({ paymentId });
    } catch (e) {
      if (isPaymentNotFoundError(e)) {
        return { ok: false, reason: "payment_not_found" };
      }
      return { ok: false, reason: "unknown_payment" };
    }

    const cancellations =
      "cancellations" in payment && Array.isArray(payment.cancellations)
        ? payment.cancellations
        : [];

    const cancellation = cancellations.find(
      (c) => "id" in c && c.id === cancellationId,
    );
    if (
      !cancellation ||
      !("totalAmount" in cancellation) ||
      typeof cancellation.totalAmount !== "number"
    ) {
      return { ok: false, reason: "unknown_payment" };
    }

    // partnerId 회수: stash 우선 (충전 직후 환불 시), fallback customData.
    const stash = await readPendingTopup(paymentId);
    const customDataRaw =
      "customData" in payment && typeof payment.customData === "string"
        ? payment.customData
        : undefined;
    const decoded = decodeCustomData(customDataRaw);
    const partnerId = stash?.partnerId ?? decoded?.partnerId ?? null;
    if (!partnerId) {
      return { ok: false, reason: "malformed" };
    }

    const reason =
      "reason" in cancellation && typeof cancellation.reason === "string"
        ? cancellation.reason
        : null;

    return {
      ok: true,
      event: {
        kind: "refund",
        paymentId,
        cancellationId,
        partnerId,
        amount: cancellation.totalAmount,
        reason,
      },
    };
  }
}
