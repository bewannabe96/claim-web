"use server";

import { revalidatePath } from "next/cache";

import { newId } from "@/lib/id";
import { requireAdminSession, requirePartnerSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";

import { applyLedger } from "./lib/apply-ledger";
import {
  AdjustmentInputSchema,
  type AdjustmentMutationState,
  RefundInputSchema,
  type RefundMutationState,
  SpendInputSchema,
  TopupInitInputSchema,
  type TopupInitMutationState,
} from "./schema";
import { clearPendingTopup } from "./payment/provider";
import { getPaymentProvider } from "./payment";

/**
 * 크레딧 server actions.
 *
 * 모든 폼 진입 액션은 함수 시작에서 require*Session() 호출 (layout 게이트는 액션 호출 시
 * 적용 안 됨 — 프로젝트 컨벤션).
 *
 * createdById 매트릭스:
 *   adjustCredit (어드민)  → session.user.id
 *   confirmTopup (웹훅)    → null (시스템; 파트너는 referenceId=paymentId 로 역추적)
 *   spendCredit (시스템)   → null
 */

/**
 * 어드민 수동 조정 — 부호 있는 amount + 사유. ledger type='adjustment'.
 * 환불 (특정 결제건 되돌리기) 은 별도 액션 refundTopup 사용.
 */
export async function adjustCredit(
  partnerId: string,
  _prev: AdjustmentMutationState,
  formData: FormData,
): Promise<AdjustmentMutationState> {
  const session = await requireAdminSession();

  const rawAmount = formData.get("amount");
  const amountNum =
    typeof rawAmount === "string" && rawAmount.trim().length > 0
      ? Number(rawAmount)
      : Number.NaN;

  const parsed = AdjustmentInputSchema.safeParse({
    amount: Number.isFinite(amountNum) ? amountNum : undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const result = await applyLedger({
    partnerId,
    amount: parsed.data.amount,
    type: "adjustment",
    reason: parsed.data.reason,
    referenceType: null,
    referenceId: null,
    idempotencyKey: null,
    createdById: session.user.id,
  });

  if (!result.ok) {
    if (result.error === "insufficient_balance") {
      return {
        ok: false,
        errors: { amount: ["잔액이 부족합니다. 현재 잔액보다 큰 차감은 불가합니다."] },
      };
    }
    return {
      ok: false,
      errors: {
        _form: ["동시 갱신 충돌 — 잠시 후 다시 시도해주세요."],
      },
    };
  }

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/partner/credits");
  revalidatePath("/partner");

  return { ok: true, ledgerId: result.ledgerId };
}

/**
 * 결제건 환불 — 전액/부분. 원본 topup ledger row 의 referenceId(=paymentId) 와 짝.
 *
 * 검증:
 *  1. 해당 partner 의 type='topup', referenceId=paymentId row 존재 (소유권 + 진정성)
 *  2. 누적 환불 (기존 refund row 의 |amount| 합) + 이번 환불 ≤ 원본 충전 금액
 *  3. 잔액 부족 시 applyLedger 가 차단 (이미 소비된 충전분은 환불 불가 — 운영자가 별도 조정으로 대응)
 *
 * Race: 두 어드민이 동시에 같은 결제 100% 환불 시도하면 둘 다 통과 가능 — 사람 운영
 * 시나리오상 매우 드물어 MVP 는 수용. 격상 필요 시 applyLedger.validate 콜백 도입.
 */
export async function refundTopup(
  partnerId: string,
  _prev: RefundMutationState,
  formData: FormData,
): Promise<RefundMutationState> {
  const session = await requireAdminSession();

  const rawAmount = formData.get("amount");
  const amountNum =
    typeof rawAmount === "string" && rawAmount.trim().length > 0
      ? Number(rawAmount)
      : Number.NaN;

  const parsed = RefundInputSchema.safeParse({
    paymentId: formData.get("paymentId"),
    amount: Number.isFinite(amountNum) ? amountNum : undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const original = await prisma.partnerCreditLedger.findFirst({
    where: {
      partnerId,
      type: "topup",
      referenceType: "payment",
      referenceId: parsed.data.paymentId,
    },
    select: { amount: true },
  });
  if (!original) {
    return {
      ok: false,
      errors: { paymentId: ["해당 partner 의 결제 건을 찾을 수 없습니다."] },
    };
  }

  const refundAgg = await prisma.partnerCreditLedger.aggregate({
    where: {
      partnerId,
      type: "refund",
      referenceType: "payment",
      referenceId: parsed.data.paymentId,
    },
    _sum: { amount: true },
  });
  const totalRefunded = -(refundAgg._sum.amount ?? 0);
  const remaining = original.amount - totalRefunded;

  if (parsed.data.amount > remaining) {
    return {
      ok: false,
      errors: {
        amount: [
          `환불 가능 잔여 금액은 ${remaining.toLocaleString("ko-KR")}원이에요.`,
        ],
      },
    };
  }

  // PG 측 실 환불 먼저 — 성공 시 cancellationId 를 idempotencyKey 로 사용해 webhook 의
  // Transaction.Cancelled 와 dedup. provider 가 cancelPayment 미지원 (stub) 이면 ledger 만.
  //
  // 트랜잭션 경계 한계: PG 환불 성공 + ledger 작성 실패 (conflict 극히 드묾) 시 PG 와
  // ledger 가 어긋남. 운영 대응을 위해 cancellationId 를 명시 로깅.
  const provider = getPaymentProvider();
  let cancellationId: string | null = null;
  if (provider.cancelPayment) {
    const cancel = await provider.cancelPayment({
      paymentId: parsed.data.paymentId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    });
    if (!cancel.ok) {
      console.error(
        `[credits] PG cancelPayment failed paymentId=${parsed.data.paymentId} reason=${cancel.reason}`,
      );
      return {
        ok: false,
        errors: { _form: [`결제사 환불 실패: ${cancel.reason}`] },
      };
    }
    cancellationId = cancel.cancellationId;
  }

  const result = await applyLedger({
    partnerId,
    amount: -parsed.data.amount,
    type: "refund",
    reason: parsed.data.reason,
    referenceType: "payment",
    referenceId: parsed.data.paymentId,
    idempotencyKey: cancellationId ? `cancellation:${cancellationId}` : null,
    createdById: session.user.id,
    provider: provider.name,
    providerRef: cancellationId,
  });

  if (!result.ok) {
    if (cancellationId) {
      console.error(
        `[credits] PG refunded but ledger apply failed — manual reconcile required`,
        {
          paymentId: parsed.data.paymentId,
          cancellationId,
          partnerId,
          amount: parsed.data.amount,
          ledgerError: result.error,
        },
      );
    }
    if (result.error === "insufficient_balance") {
      return {
        ok: false,
        errors: {
          amount: [
            "환불 시점의 잔액이 부족합니다. 이미 소비된 충전분은 환불할 수 없어요 — 별도 조정으로 처리해주세요.",
          ],
        },
      };
    }
    return {
      ok: false,
      errors: { _form: ["동시 갱신 충돌 — 잠시 후 다시 시도해주세요."] },
    };
  }

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partnerId}`);
  revalidatePath("/partner/credits");
  revalidatePath("/partner");

  return { ok: true, ledgerId: result.ledgerId };
}

/**
 * 파트너 충전 개시 — paymentId 발급 + provider 호출 → PG 위젯/redirect URL 반환.
 *
 * ledger 미작성: balance 는 confirmTopup (웹훅) 이 발화돼야만 증가.
 * stash (partnerId, amount 보관) 는 provider 가 자체 책임 — provider 마다 webhook 이
 * 필요로 하는 정보가 달라 action 은 stash 메커니즘을 알 필요 없음.
 */
export async function initiateTopup(
  _prev: TopupInitMutationState,
  formData: FormData,
): Promise<TopupInitMutationState> {
  const session = await requirePartnerSession();

  const rawAmount = formData.get("amount");
  const amountNum =
    typeof rawAmount === "string" && rawAmount.trim().length > 0
      ? Number(rawAmount)
      : Number.NaN;

  const parsed = TopupInitInputSchema.safeParse({
    amount: Number.isFinite(amountNum) ? amountNum : undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const paymentId = newId();
  const provider = getPaymentProvider();
  const init = await provider.initiatePayment({
    partnerId: session.partnerId,
    paymentId,
    amount: parsed.data.amount,
    userEmail: session.user.email,
    userPhone: session.user.phone,
    userName: session.user.name,
  });

  if (init.kind === "redirect") {
    return { ok: true, paymentId, kind: "redirect", redirectUrl: init.redirectUrl };
  }
  return { ok: true, paymentId, kind: "sdk", sdkPayload: init.sdkPayload };
}

/**
 * PG 확정 처리 — webhook route 가 verifyWebhook 통과 후 호출. 폼 아님.
 *
 * 세션 가드 없음 — 인증은 PaymentProvider.verifyWebhook 시점에 끝남.
 * 멱등성: idempotencyKey = paymentId. 같은 paymentId 재전송은 alreadyApplied.
 */
export async function confirmTopup(args: {
  paymentId: string;
  partnerId: string;
  amount: number;
  providerName: string;
  providerRef: string | null;
}): Promise<
  | { ok: true; ledgerId: string; alreadyApplied: boolean }
  | { ok: false; error: string }
> {
  if (args.amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  const result = await applyLedger({
    partnerId: args.partnerId,
    amount: args.amount,
    type: "topup",
    reason: null,
    referenceType: "payment",
    referenceId: args.paymentId,
    idempotencyKey: args.paymentId,
    createdById: null,
    provider: args.providerName,
    providerRef: args.providerRef,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // best-effort cleanup — 실패해도 TTL 로 정리됨.
  try {
    await clearPendingTopup(args.paymentId);
  } catch (err) {
    console.warn(
      `[credits] failed to clear pending topup stash for ${args.paymentId}`,
      err,
    );
  }

  revalidatePath("/partner/credits");
  revalidatePath("/partner");

  return { ok: true, ledgerId: result.ledgerId, alreadyApplied: result.alreadyApplied };
}

/**
 * 클라이언트 SDK 가 결제 성공 반환 직후 호출하는 즉시 ack — 사용자가 webhook 도착을
 * 기다릴 필요 없이 바로 잔액 갱신.
 *
 * 진입점:
 *   - PC: TopupAmountForm 의 `PortOne.requestPayment` Promise resolve 직후.
 *   - 모바일: /partner/credits/topup/result 페이지가 redirect 도착 후.
 *
 * 안전:
 *   - requirePartnerSession() — partner 본인만 ack 가능.
 *   - provider.fetchPaymentStatus 가 PG API 로 결제 진정성 + 금액 재확인.
 *   - session.partnerId 와 PG 응답의 partnerId (stash + customData) 교차 검증.
 *   - 같은 paymentId 의 webhook 가 늦게 도착해도 idempotencyKey 로 no-op.
 *
 * 비고: Stub provider 는 fetchPaymentStatus 미구현 — stub 환경에선 ack 가 not_supported
 *      반환, webhook (GET redirect) 만으로 잔액 갱신.
 */
export async function acknowledgeTopup({
  paymentId,
}: {
  paymentId: string;
}): Promise<
  | { ok: true; ledgerId: string; alreadyApplied: boolean }
  | { ok: false; error: string }
> {
  const session = await requirePartnerSession();
  const provider = getPaymentProvider();

  if (!provider.fetchPaymentStatus) {
    return { ok: false, error: "not_supported" };
  }

  const status = await provider.fetchPaymentStatus(paymentId);
  if (!status.ok) {
    return { ok: false, error: status.reason };
  }

  // Defense in depth — partner 가 본인 결제만 ack 가능. PG 응답의 partnerId 는
  // stash/customData 에서 옴, 그 둘은 우리가 채움. 그래도 session 과 cross-check.
  if (status.partnerId !== session.partnerId) {
    console.warn(
      `[credits] acknowledgeTopup partnerId mismatch session=${session.partnerId} pg=${status.partnerId} paymentId=${paymentId}`,
    );
    return { ok: false, error: "forbidden" };
  }

  return confirmTopup({
    paymentId,
    partnerId: status.partnerId,
    amount: status.amount,
    providerName: provider.name,
    providerRef: status.providerRef,
  });
}

/**
 * 시스템 자동 차감 — 후속 PR 의 spend 트리거 (assignment 노출 등) 가 호출.
 *
 * 세션 가드 없음 — 이미 인가된 컨텍스트 (다른 server action / webhook / job) 에서
 * 호출됨을 가정. 호출처가 자체 인증 책임.
 *
 * 멱등성: idempotencyKey 필수. spend 트리거는 항상 같은 키로 안전 재시도 가능해야 함.
 */
export async function spendCredit(input: {
  partnerId: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  reason?: string;
}): Promise<
  | {
      ok: true;
      ledgerId: string;
      balanceAfter: number;
      alreadyApplied: boolean;
    }
  | { ok: false; error: "insufficient_balance" | "conflict" | "invalid_input" }
> {
  const parsed = SpendInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const result = await applyLedger({
    partnerId: parsed.data.partnerId,
    amount: -parsed.data.amount,
    type: "spend",
    reason: parsed.data.reason ?? null,
    referenceType: parsed.data.referenceType,
    referenceId: parsed.data.referenceId,
    idempotencyKey: parsed.data.idempotencyKey,
    createdById: null,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/partner/credits`);
  revalidatePath("/partner");

  return {
    ok: true,
    ledgerId: result.ledgerId,
    balanceAfter: result.balanceAfter,
    alreadyApplied: result.alreadyApplied,
  };
}
