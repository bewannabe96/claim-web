import "server-only";

import { PortOneClient } from "@portone/server-sdk";
import { z } from "zod";

/**
 * PortOne v2 server client + 4종 env 의 단일 진입점.
 *
 * 사용처:
 *   - `features/credits/payment/portone.ts` — initiatePayment 시 storeId/channelKey 주입,
 *     verifyWebhook 시 WEBHOOK_SECRET 으로 Standard Webhooks (HMAC-SHA256) 검증,
 *     fetchPaymentStatus / cancelPayment 시 REST API 호출.
 *
 * env 검증을 **첫 호출 시점으로 지연** ([s3.ts](./s3.ts) 패턴) — CREDIT_PAYMENT_PROVIDER 가
 * stub 인 dev 환경에선 PortOne env 미설정이어도 모듈 로드 자체는 통과해야 함.
 *
 * HMR 안전성: globalThis 캐싱 — dev 모듈 재로드 시 새 client 인스턴스가 매번 만들어지는
 * 것을 막아 redundant TCP/HTTP keepalive pool 누수 회피.
 */

const EnvSchema = z.object({
  PORTONE_STORE_ID: z.string().min(1, "PORTONE_STORE_ID missing"),
  PORTONE_CHANNEL_KEY: z.string().min(1, "PORTONE_CHANNEL_KEY missing"),
  PORTONE_API_SECRET: z.string().min(1, "PORTONE_API_SECRET missing"),
  PORTONE_WEBHOOK_SECRET: z.string().min(1, "PORTONE_WEBHOOK_SECRET missing"),
});

type PortOneEnv = z.infer<typeof EnvSchema>;

type Cached = {
  env: PortOneEnv;
  client: ReturnType<typeof PortOneClient>;
};

const globalForPortOne = globalThis as unknown as { portone?: Cached };

function load(): Cached {
  if (globalForPortOne.portone) return globalForPortOne.portone;
  const env = EnvSchema.parse({
    PORTONE_STORE_ID: process.env.PORTONE_STORE_ID,
    PORTONE_CHANNEL_KEY: process.env.PORTONE_CHANNEL_KEY,
    PORTONE_API_SECRET: process.env.PORTONE_API_SECRET,
    PORTONE_WEBHOOK_SECRET: process.env.PORTONE_WEBHOOK_SECRET,
  });
  const client = PortOneClient({
    secret: env.PORTONE_API_SECRET,
    storeId: env.PORTONE_STORE_ID,
  });
  const cached = { env, client };
  if (process.env.NODE_ENV !== "production") {
    globalForPortOne.portone = cached;
  }
  return cached;
}

export function getPortOneClient() {
  return load().client;
}

export function getPortOneStoreId(): string {
  return load().env.PORTONE_STORE_ID;
}

export function getPortOneChannelKey(): string {
  return load().env.PORTONE_CHANNEL_KEY;
}

export function getPortOneWebhookSecret(): string {
  return load().env.PORTONE_WEBHOOK_SECRET;
}
