import { z } from "zod";

import type { PortOneSdkPayload } from "./payment/types";

/**
 * 크레딧 도메인 스키마 — DB 진실 (prisma/schema.prisma) 과 짝.
 *
 * 단위 정책: 1 credit = 1 KRW. 모든 amount 는 `Int` (원). Decimal/Float/BigInt 금지.
 * INT4 최대 ~21억 (충분), JSON Number 안전범위 2^53-1 (안전).
 *
 * 적용 알고리즘과 동시성 보장은 `lib/apply-ledger.ts` 단일 chokepoint.
 */

export const CREDIT_TYPES = ["topup", "spend", "adjustment", "refund"] as const;
export const CreditTypeSchema = z.enum(CREDIT_TYPES);
export type CreditType = z.infer<typeof CreditTypeSchema>;

/**
 * 어드민 수동 조정 폼 입력. 부호 있는 KRW + 사유 필수 (audit).
 * 환불 (특정 결제건의 전액/부분 되돌리기) 은 별도 흐름 — RefundInputSchema 참조.
 */
export const AdjustmentInputSchema = z.object({
  amount: z
    .number({ error: "금액을 입력해주세요." })
    .int("정수 원 단위로 입력해주세요.")
    .min(-100_000_000, "조정 금액은 -1억원 이상이어야 해요.")
    .max(100_000_000, "조정 금액은 1억원 이하여야 해요.")
    .refine((v) => v !== 0, { message: "0 원은 조정할 수 없어요." }),
  reason: z
    .string({ error: "사유를 입력해주세요." })
    .min(1, "사유는 필수입니다.")
    .max(200, "사유는 200자 이내로 입력해주세요."),
});
export type AdjustmentInput = z.infer<typeof AdjustmentInputSchema>;

/**
 * 환불 폼 입력. 원본 결제 (paymentId) 와 환불 금액 (양수 — 헬퍼가 음수화) + 사유.
 * 동일 paymentId 의 누적 환불 ≤ 원본 충전 금액 — actions.ts 의 refundTopup 이 검증.
 */
export const RefundInputSchema = z.object({
  paymentId: z
    .string({ error: "환불할 결제 건을 선택해주세요." })
    .min(1, "환불할 결제 건을 선택해주세요."),
  amount: z
    .number({ error: "환불 금액을 입력해주세요." })
    .int("정수 원 단위로 입력해주세요.")
    .positive("환불 금액은 양수여야 해요.")
    .max(100_000_000, "환불 금액은 1억원 이하여야 해요."),
  reason: z
    .string({ error: "사유를 입력해주세요." })
    .min(1, "사유는 필수입니다.")
    .max(200, "사유는 200자 이내로 입력해주세요."),
});
export type RefundInput = z.infer<typeof RefundInputSchema>;

/** 파트너 충전 개시 폼. 1천원 ~ 1천만원. 향후 AppSettings 로 승격 후보. */
export const TopupInitInputSchema = z.object({
  amount: z
    .number({ error: "충전 금액을 입력해주세요." })
    .int("정수 원 단위로 입력해주세요.")
    .min(1_000, "최소 충전 금액은 1,000원이에요.")
    .max(10_000_000, "최대 충전 금액은 10,000,000원이에요."),
});
export type TopupInitInput = z.infer<typeof TopupInitInputSchema>;

/** 내부 사용 헬퍼 호출용 — 시스템 트리거가 spendCredit() 호출 시 사용. */
export const SpendInputSchema = z.object({
  partnerId: z.string().min(1),
  amount: z.number().int().positive("사용 금액은 양수여야 해요."),
  referenceType: z.string().min(1, "referenceType 은 필수입니다."),
  referenceId: z.string().min(1, "referenceId 는 필수입니다."),
  idempotencyKey: z.string().min(1, "idempotencyKey 는 필수입니다."),
  reason: z.string().max(200).optional(),
});
export type SpendInput = z.infer<typeof SpendInputSchema>;

/** UI 표시용 ledger view — Prisma row 의 안전 pick. */
export type LedgerEntry = {
  id: string;
  amount: number;
  balanceAfter: number;
  type: CreditType;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
};

/** Action mutation states — features/partners 패턴 그대로. */
export type AdjustmentMutationState =
  | { ok: true; ledgerId: string }
  | {
      ok?: false;
      errors?: Partial<Record<keyof AdjustmentInput | "_form", string[]>>;
    }
  | undefined;

export type RefundMutationState =
  | { ok: true; ledgerId: string }
  | {
      ok?: false;
      errors?: Partial<Record<keyof RefundInput | "_form", string[]>>;
    }
  | undefined;

/**
 * Provider 가 두 가지 시작 방식 중 하나로 응답:
 *   - "redirect": URL 로 브라우저 navigate (stub — webhook route 가 GET 으로 받음).
 *   - "sdk":      브라우저에서 `PortOne.requestPayment(sdkPayload)` 호출 (portone).
 *
 * `useActionState` 의 직렬화 boundary 를 넘으므로 모든 필드 JSON-safe.
 */
export type TopupInitSuccess =
  | { ok: true; paymentId: string; kind: "redirect"; redirectUrl: string }
  | {
      ok: true;
      paymentId: string;
      kind: "sdk";
      sdkPayload: PortOneSdkPayload;
    };

export type TopupInitMutationState =
  | TopupInitSuccess
  | {
      ok?: false;
      errors?: Partial<Record<keyof TopupInitInput | "_form", string[]>>;
    }
  | undefined;

/** 사용자 노출용 type 라벨. */
export const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  topup: "충전",
  spend: "사용",
  adjustment: "조정",
  refund: "환불",
};
