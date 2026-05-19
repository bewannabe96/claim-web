import "server-only";

import { type PaymentProvider, StubPaymentProvider } from "./provider";

/**
 * 결제 제공자 팩토리. 후속 PR 에서 process.env.CREDIT_PAYMENT_PROVIDER 분기로
 * "portone" | "toss" 추가. 현 PR 은 stub 만.
 */
export function getPaymentProvider(): PaymentProvider {
  return new StubPaymentProvider();
}

export type { PaymentProvider } from "./provider";
