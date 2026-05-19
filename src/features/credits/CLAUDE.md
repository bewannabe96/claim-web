# features/credits/ — 파트너 크레딧 도메인

## 파일 구성

```
credits/
├─ schema.ts                  # zod 입력 검증 + CreditType enum + 도메인 타입
├─ queries.ts                 # 'server-only' — balance / ledger / listRefundableTopups
├─ actions.ts                 # 'use server' — adjustCredit / refundTopup / initiateTopup / confirmTopup / spendCredit
├─ lib/apply-ledger.ts        # 'server-only' — 잔액 변동 단일 chokepoint
├─ payment/provider.ts        # 'server-only' — PaymentProvider 추상 + StubPaymentProvider + 충전 stash 헬퍼
├─ payment/index.ts           # 'server-only' — getPaymentProvider() 팩토리
└─ ui/
   ├─ credit-balance-card.tsx # Server — 잔액 카드 (어드민/파트너 공용)
   ├─ ledger-list.tsx         # Server — 거래 내역 (compact/full 모드)
   ├─ adjustment-form.tsx     # Client — 어드민 수동 조정 (type='adjustment')
   ├─ refund-form.tsx         # Client — 결제 환불 (type='refund', referenceId=paymentId)
   ├─ topup-amount-form.tsx   # Client — 파트너 충전 금액 입력
   └─ topup-button.tsx        # (사용 안 함, dashboard 카드 안에 inline)
```

## 도메인 핵심

### 단위 — 1 credit = 1 KRW

모든 amount 는 `Int` (원). **Decimal / Float / BigInt 금지.** INT4 최대 ~21억 (KRW 잔액 상한 충분), JSON Number 안전범위 2^53-1 (송신/수신 안전). 표시는 `Intl.NumberFormat("ko-KR")`.

### 진실의 소스는 ledger — balance 는 cached derived 값

`PartnerCreditBalance` (1:1 with Partner) 는 운영 편의용 캐시 row. 진실은 `PartnerCreditLedger` (append-only) 의 sum. 모든 잔액 변동은:
1. ledger row 1개 INSERT (`balanceAfter` 스냅샷 포함)
2. balance row UPDATE (optimistic lock)

두 작업은 **단일 트랜잭션** 안에서 일어남. 따로 호출 금지.

### 단일 chokepoint — `lib/apply-ledger.ts`

**모든 잔액 변동은 반드시 `applyLedger(input)` 경유.** 직접 `prisma.partnerCreditBalance.update` 또는 `prisma.partnerCreditLedger.create` 호출 금지. 새 mutation 추가 시:

```ts
// features/credits/actions.ts
const result = await applyLedger({
  partnerId, amount, type, reason,
  referenceType, referenceId, idempotencyKey, createdById,
});
if (!result.ok) {
  // result.error = "insufficient_balance" | "conflict"
}
```

직접 prisma 호출 시 보장이 깨짐:
- 멱등성 (idempotencyKey UNIQUE 인덱스 + P2002 catch)
- 음수 잔액 차단 (앱 레이어 단일 enforcement)
- 낙관적 잠금 재시도 (`version` 컬럼)
- ledger ↔ balance 원자성

### 동시성 — 낙관적 잠금 + 호출자 재시도

`applyLedger` 자체는 **2회 시도** 후 실패하면 `conflict` 반환. 캐시 일관성 + latency tail 트레이드오프. N=10 동시 갱신처럼 contention 이 높으면 호출자가 conflict 를 재시도하는 모델 (scripts/test-credit-concurrency.ts 참조). 운영 중 빈번하면 queue 모델로 격상.

### 멱등성 키 정책

- `topup`: `idempotencyKey = paymentId` (PG 웹훅 재전송 대비).
- `spend`: 호출자가 안정 키 제공 필수 (예: `assignment:${assignmentId}:exposure`).
- `adjustment` / `refund`: `null` (어드민 수기, 인간이 의도적으로 두 번 누르면 두 row 가 정상 — UNIQUE NULL distinct).

같은 키로 두 번째 호출은 `{ ok: true, alreadyApplied: true }` 반환. 사전 lookup + UNIQUE 인덱스 P2002 catch 의 3중 방어.

### 조정 vs 환불 — 의미 분리

| | `adjustment` | `refund` |
|---|---|---|
| 액션 | `adjustCredit` | `refundTopup` |
| 의미 | 일방적 보정 (이벤트 보상 / 운영 실수 정정 / 시스템 오류 보상) | 특정 결제건 (전액/부분) 되돌리기 |
| 부호 | 양·음 모두 | 음수 (`amount` 양수 입력, 헬퍼가 음수화) |
| `referenceType` / `referenceId` | `null` / `null` | `"payment"` / `paymentId` |
| 검증 | amount range + reason | 위 + 원본 topup 존재 + 누적 환불 ≤ 원본 |
| UI | `AdjustmentForm` | `RefundForm` (드롭다운으로 환불 가능 결제 선택) |

**환불은 항상 결제건과 짝.** `referenceType="payment"` + `referenceId=<paymentId>` 가 없으면 환불이 아님. 임의 차감 의도는 `adjustCredit` 으로 표현 (audit 명료성). 누적 환불액 추적은 [queries.ts](queries.ts) `listRefundableTopups` 가 같은 `referenceId` 의 `topup` row amount 와 `refund` row 합 비교.

### `createdById` 액터 매트릭스

| 경로 | createdById |
|---|---|
| `adjustCredit` (어드민) | `adminSession.user.id` |
| `refundTopup` (어드민) | `adminSession.user.id` |
| `confirmTopup` (웹훅) | `null` — 시스템; 파트너는 `referenceId=paymentId` 로 역추적 |
| `spendCredit` (시스템) | `null` |

`createdById` 는 **FK 미설정** — user 삭제 시 audit 가 사라지면 안 됨.

### 잔액 row 생애주기 — eager-create

`Partner.exists ⇔ PartnerCreditBalance.exists` 불변식. 파트너 가입 트랜잭션 ([src/app/partner/signup/[token]/actions.ts](../../app/partner/signup/[token]/actions.ts) `verifyPartnerSignupOtp`) 안에서 `tx.partnerCreditBalance.create` 가 user/partner 와 함께 INSERT. 가입 트랜잭션이 단일 진입점이므로 다른 곳에서 balance row 를 만들지 말 것.

방어책 두 단계:
1. [prisma/seed.ts](../../../prisma/seed.ts) `seedPartnerCreditBalances()` 가 멱등 upsert 로 기존 파트너 백필.
2. `queries.ts:getCreditBalance` 와 `apply-ledger` 가 row 없으면 lazy upsert — 시더 누락 환경 대비.

## PaymentProvider 추상화

`PaymentProvider` 인터페이스 ([payment/provider.ts](payment/provider.ts)) 는 `initiatePayment` + `verifyWebhook` 두 메서드. action 은 provider 의 stash 메커니즘을 알 필요 없음 — provider 가 자체 책임.

### Stub provider (dev 전용)

- `initiatePayment`: paymentId 만 담은 `/api/webhooks/credits/stub?paymentId=...` URL 반환. (`partnerId, amount`) 는 Redis `topup:pending:{paymentId}` 에 1시간 stash.
- `verifyWebhook`: `process.env.NODE_ENV === "production"` 이면 즉시 fail-closed (`invalid_signature` 반환). dev 에선 stash 조회로 partnerId/amount 정규화.

### 실 provider 추가 (PortOne / Toss, 후속 PR)

1. `payment/<provider>.ts` 에 `class PortOnePaymentProvider implements PaymentProvider`.
2. `verifyWebhook` 은 HMAC-SHA256 + `timingSafeEqual` 으로 진정성 검증 — 기존 [src/app/api/webhooks/eightytwo-judge-analysis/route.ts](../../app/api/webhooks/eightytwo-judge-analysis/route.ts) 패턴 재사용.
3. `getPaymentProvider()` ([payment/index.ts](payment/index.ts)) 가 `process.env.CREDIT_PAYMENT_PROVIDER` 분기.
4. ENV 추가: `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET` 등.

## 안티패턴

- ❌ `prisma.partnerCreditBalance.update` / `prisma.partnerCreditLedger.create` 직접 호출 — `applyLedger` 경유 필수.
- ❌ `Decimal` / `Float` / `BigInt` amount 컬럼 사용.
- ❌ ledger row UPDATE / DELETE — 진실로 append-only. 환불은 역항목 새 row (`type='refund'`) 로.
- ❌ DB CHECK 로 `balance >= 0` 강제 — 프로젝트 컨벤션상 DB CHECK 미사용. `applyLedger` 의 newBalance 가드가 단일 enforcement.
- ❌ `refundTopup` 을 referenceId 없이 호출 / `adjustCredit` 에 referenceId 채워 호출 — 의미 혼탁. 환불은 결제건 종속, 조정은 무관.
- ❌ Action 안에서 직접 stash 조작 — provider 가 자체 책임. `initiateTopup` 은 stash 메커니즘을 알지 않음.
- ❌ webhook route 에서 `requirePartnerSession()` 호출 — 웹훅은 PG 인프라 호출. `PaymentProvider.verifyWebhook` 가 인증.
- ❌ `confirmTopup` 을 폼에서 호출 — 웹훅 전용. 폼 액션에 노출하면 위조 가능.
- ❌ `spendCredit` 을 클라이언트나 미인가 액션에서 호출 — 호출처가 자체 인증 필수 (세션 가드 없음).
- ❌ `'use cache'` 를 `queries.ts` 에 추가 — 모든 호출이 `require*Session()` 트리 하위라 자동 dynamic. 캐싱 추가 시 잔액 stale 위험.

## 새 spend 트리거 추가 시 (후속 PR)

```ts
// features/<도메인>/actions.ts (예: assignments)
import { spendCredit } from "@/features/credits/actions";

export async function publishAssignment(/* ... */) {
  await requireAdminSession();  // 또는 시스템 컨텍스트 자체 인증
  // ... assignment 발행 로직

  const spend = await spendCredit({
    partnerId,
    amount: EXPOSURE_PRICE,
    referenceType: "assignment",
    referenceId: assignment.id,
    idempotencyKey: `assignment:${assignment.id}:exposure`,
    reason: "Assignment 노출 차감",
  });
  if (!spend.ok && spend.error === "insufficient_balance") {
    // 정책 결정: assignment 발행 보류 / 알림 / fallback partner 선택
  }
}
```

`idempotencyKey` 는 같은 트리거가 두 번 발화해도 같은 키여야 함. 재시도 안전.
