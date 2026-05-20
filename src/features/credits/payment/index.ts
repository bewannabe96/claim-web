import "server-only";

import { PortOnePaymentProvider } from "./portone";
import { type PaymentProvider, StubPaymentProvider } from "./provider";

/**
 * 결제 제공자 팩토리.
 *
 * 선택 규칙:
 *   - CREDIT_PAYMENT_PROVIDER=portone → PortOnePaymentProvider (4종 env 필수, lazy validate).
 *   - 그 외 / 미설정                  → StubPaymentProvider (production 진입 시 fail-closed).
 *
 * Stub 환경에서도 PortOnePaymentProvider 의 module evaluation 까지는 일어남 — env 검증은
 * 메서드 호출 시점 (src/server/portone.ts 의 lazy load) 까지 지연되므로 stub-only 사용에 영향 없음.
 */
export function getPaymentProvider(): PaymentProvider {
  return process.env.CREDIT_PAYMENT_PROVIDER === "portone"
    ? new PortOnePaymentProvider()
    : new StubPaymentProvider();
}

export type { PaymentProvider } from "./provider";
