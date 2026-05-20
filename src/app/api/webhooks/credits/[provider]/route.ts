import { applyLedger } from "@/features/credits/lib/apply-ledger";
import { confirmTopup } from "@/features/credits/actions";
import { getPaymentProvider } from "@/features/credits/payment";

/**
 * PG 충전 콜백 webhook — `/api/webhooks/credits/[provider]`.
 *
 * 인증 모델:
 *   - 세션 가드 없음. 호출자는 PG 인프라 (PortOne/Toss/Stub 의 redirect).
 *   - 진정성은 PaymentProvider.verifyWebhook 가 책임 — 실 provider 는 HMAC,
 *     stub 은 query string + production fail-closed.
 *   - 멱등성은 applyLedger 의 idempotencyKey UNIQUE 인덱스가 책임:
 *     · topup: `paymentId`
 *     · refund: `cancellation:${cancellationId}` (어드민 환불이 같은 키로 먼저 작성하면 webhook 은 alreadyApplied no-op)
 *
 * Event dispatch (verifyWebhook 가 정규화):
 *   - topup_completed → confirmTopup (기존 흐름)
 *   - refund          → applyLedger(type='refund'). 외부 콘솔 환불 흡수용.
 *   - ignored         → 200 OK 로그만 (VirtualAccountIssued / Failed / Ready / BillingKey.* 등)
 *
 * 메서드:
 *   - POST: 실 PG 가 보내는 표준 콜백.
 *   - GET: dev stub 의 브라우저 redirect 도착점.
 *
 * 캐싱: req.text() / headers / searchParams 가 자동 dynamic. cacheComponents 와의
 * 호환을 위해 `export const dynamic` 사용 금지 (Next 16 에서 호환 안 됨).
 */

type RouteCtx = { params: Promise<{ provider: string }> };

async function handle(req: Request, ctx: RouteCtx): Promise<Response> {
  const { provider: providerName } = await ctx.params;

  const provider = getPaymentProvider();
  if (provider.name !== providerName) {
    return new Response("unknown_provider", { status: 404 });
  }

  // raw body 한 번만 읽기 — HMAC 검증이 원본 바이트 필요. GET 은 빈 string.
  const rawBody = req.method === "GET" ? "" : await req.text();
  const url = new URL(req.url);

  const verify = await provider.verifyWebhook(rawBody, req.headers, url.searchParams);
  if (!verify.ok) {
    console.warn(
      `[credits-webhook] verify failed provider=${providerName} reason=${verify.reason}`,
    );
    return new Response(verify.reason, {
      status: verify.reason === "invalid_signature" ? 401 : 400,
    });
  }

  const event = verify.event;

  if (event.kind === "topup_completed") {
    const result = await confirmTopup({
      paymentId: event.paymentId,
      partnerId: event.partnerId,
      amount: event.amount,
      providerName: provider.name,
      providerRef: event.providerRef,
    });

    if (!result.ok) {
      console.error(
        `[credits-webhook] confirmTopup failed provider=${providerName} paymentId=${event.paymentId} error=${result.error}`,
      );
      return new Response(result.error, { status: 500 });
    }

    if (result.alreadyApplied) {
      console.log(
        `[credits-webhook] topup idempotent replay paymentId=${event.paymentId} ledgerId=${result.ledgerId}`,
      );
    }

    // Dev stub 은 브라우저에서 GET 으로 진입 — 결과 페이지로 forward.
    if (req.method === "GET") {
      return Response.redirect(new URL("/partner/credits", req.url), 303);
    }

    return Response.json({
      ok: true,
      kind: "topup_completed",
      ledgerId: result.ledgerId,
      alreadyApplied: result.alreadyApplied,
    });
  }

  if (event.kind === "refund") {
    const result = await applyLedger({
      partnerId: event.partnerId,
      amount: -event.amount,
      type: "refund",
      reason: event.reason ?? "External cancellation via PortOne",
      referenceType: "payment",
      referenceId: event.paymentId,
      idempotencyKey: `cancellation:${event.cancellationId}`,
      // 시스템 actor — 외부 콘솔 환불의 경우 actor 없음. 어드민 UI 환불은 이미 같은
      // idempotencyKey 로 ledger 를 작성한 후라 여기 도달은 alreadyApplied no-op.
      createdById: null,
      provider: provider.name,
      providerRef: event.cancellationId,
    });

    if (!result.ok) {
      console.error(
        `[credits-webhook] refund applyLedger failed paymentId=${event.paymentId} cancellationId=${event.cancellationId} error=${result.error}`,
      );
      return new Response(result.error, { status: 500 });
    }

    if (result.alreadyApplied) {
      console.log(
        `[credits-webhook] refund idempotent replay paymentId=${event.paymentId} cancellationId=${event.cancellationId} ledgerId=${result.ledgerId}`,
      );
    }

    return Response.json({
      ok: true,
      kind: "refund",
      ledgerId: result.ledgerId,
      alreadyApplied: result.alreadyApplied,
    });
  }

  // event.kind === "ignored"
  console.log(
    `[credits-webhook] ignored event type=${event.rawType} provider=${providerName}`,
  );
  return Response.json({ ok: true, kind: "ignored" });
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  return handle(req, ctx);
}

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  return handle(req, ctx);
}
