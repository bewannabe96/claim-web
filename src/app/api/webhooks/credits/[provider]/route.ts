import { confirmTopup } from "@/features/credits/actions";
import { getPaymentProvider } from "@/features/credits/payment";

/**
 * PG 충전 콜백 webhook — `/api/webhooks/credits/[provider]`.
 *
 * 인증 모델:
 *   - 세션 가드 없음. 호출자는 PG 인프라 (PortOne/Toss/Stub 의 redirect).
 *   - 진정성은 PaymentProvider.verifyWebhook 가 책임 — 실 provider 는 HMAC,
 *     stub 은 query string + production fail-closed.
 *   - 멱등성은 confirmTopup 이 책임 — idempotencyKey = paymentId 의 UNIQUE 인덱스.
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

  const result = await confirmTopup({
    paymentId: verify.paymentId,
    partnerId: verify.partnerId,
    amount: verify.amount,
    providerName: provider.name,
    providerRef: verify.providerRef,
  });

  if (!result.ok) {
    console.error(
      `[credits-webhook] confirmTopup failed provider=${providerName} paymentId=${verify.paymentId} error=${result.error}`,
    );
    return new Response(result.error, { status: 500 });
  }

  if (result.alreadyApplied) {
    console.log(
      `[credits-webhook] idempotent replay no-op paymentId=${verify.paymentId} ledgerId=${result.ledgerId}`,
    );
  }

  // Dev stub 은 브라우저에서 GET 으로 진입 — 결과 페이지로 forward.
  if (req.method === "GET") {
    return Response.redirect(new URL("/partner/credits", req.url), 303);
  }

  return Response.json({
    ok: true,
    ledgerId: result.ledgerId,
    alreadyApplied: result.alreadyApplied,
  });
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  return handle(req, ctx);
}

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  return handle(req, ctx);
}
