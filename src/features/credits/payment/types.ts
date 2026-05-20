/**
 * 결제 provider 의 server↔client 경계에서 공유되는 타입.
 *
 * "use server" actions 가 클라이언트로 돌려보내는 페이로드 (TopupInitMutationState 의
 * sdkPayload) + 이를 받아 `PortOne.requestPayment` 에 그대로 넘기는 client component
 * 양쪽에서 import 가능해야 함. 따라서 이 파일은 server-only 아니어야 함.
 *
 * `PaymentRequest` 는 type-only import — bundler 가 런타임 코드 없이 지움.
 * 실제 SDK 모듈 (`@portone/browser-sdk/v2`) 의 동적 import 는 client component 가 책임.
 */

import type { PaymentRequest } from "@portone/browser-sdk/v2";

export type PortOneSdkPayload = PaymentRequest;
