# features/credits/ — 파트너 크레딧 도메인

이 문서는 도메인 내부에서 작업할 때 지켜야 할 컨벤션·anti-pattern 중심. 시스템 전체 그림 (데이터 모델 / 알고리즘 / 충전 흐름 / 라우트 / 후속 작업) 은 [docs/credits.md](../../../docs/credits.md).

## 파일 구성

```
credits/
├─ schema.ts                  # zod 입력 검증 + CreditType enum + 도메인 타입
├─ queries.ts                 # 'server-only' — balance / ledger / listRefundableTopups
├─ actions.ts                 # 'use server' — adjustCredit / refundTopup / initiateTopup / confirmTopup / acknowledgeTopup / spendCredit
├─ lib/apply-ledger.ts        # 'server-only' — 잔액 변동 단일 chokepoint
├─ payment/types.ts           # client 도 import 가능 — PortOneSdkPayload 타입 (browser-sdk PaymentRequest alias)
├─ payment/provider.ts        # 'server-only' — PaymentProvider 추상 + StubPaymentProvider + 충전 stash 헬퍼
├─ payment/portone.ts         # 'server-only' — PortOnePaymentProvider (실 PG)
├─ payment/index.ts           # 'server-only' — getPaymentProvider() 팩토리 (env 분기)
└─ ui/
   ├─ credit-balance-card.tsx # Server — 잔액 카드 (어드민/파트너 공용)
   ├─ ledger-list.tsx         # Server — 거래 내역 (compact/full 모드)
   ├─ adjustment-form.tsx     # Client — 어드민 수동 조정 (type='adjustment')
   ├─ refund-form.tsx         # Client — 결제 환불 (type='refund', referenceId=paymentId)
   ├─ topup-amount-form.tsx   # Client — 파트너 충전 금액 입력 + 동적 SDK import 분기
   └─ topup-button.tsx        # (사용 안 함, dashboard 카드 안에 inline)
```

## 도메인 핵심

### 단위 — 1 credit = 1 KRW

모든 amount 는 `Int` (원). **Decimal / Float / BigInt 금지.** INT4 최대 ~21억 (KRW 잔액 상한 충분), JSON Number 안전범위 2^53-1 (송신/수신 안전). 표시는 `Intl.NumberFormat("ko-KR")`.

### 진실의 소스는 ledger — balance / debt 는 cached derived 값

`PartnerCreditBalance` (1:1 with Partner) 는 운영 편의용 캐시 row. 진실은 `PartnerCreditLedger` (append-only) 의 sum. 모든 잔액 변동은:
1. ledger row 1개 INSERT (`balanceAfter` + `debtAfter` 스냅샷 포함)
2. balance row UPDATE (optimistic lock; `balance` + `debt` 동시 갱신)

두 작업은 **단일 트랜잭션** 안에서 일어남. 따로 호출 금지.

### balance / debt 양변 회계

`PartnerCreditBalance` 는 두 수치를 들고 있음 — 둘 다 항상 ≥ 0:
- `balance`: 사용 가능 자산.
- `debt`: 누적 부채 (잔액 부족 spend 시 부족분이 여기로 쌓임).

`applyLedger` 가 `amount` 부호에 따라 분배:
- `amount ≥ 0` (topup / refund / 양수 adjustment): `debt` 를 먼저 갚고 남는 게 `balance` 로 → 다음 충전이 부채를 자동 충당.
- `amount < 0` (spend / 음수 adjustment): `balance` 를 먼저 쓰고 부족분은 `debt` 에 누적.

이 분배 덕분에 `newBalance` / `newDebt` 가 항상 ≥ 0 → **`insufficient_balance` 차단은 더 이상 발생하지 않음** (union variant 는 시그니처 호환 위해 남아 있지만 unreachable). 잔액 부족 시나리오는 호출자에서 별도 처리할 필요 없이 ledger 가 자동으로 부채로 흡수.

### 단일 chokepoint — `lib/apply-ledger.ts`

**모든 잔액 변동은 반드시 `applyLedger(input)` 경유.** 직접 `prisma.partnerCreditBalance.update` 또는 `prisma.partnerCreditLedger.create` 호출 금지. 새 mutation 추가 시:

```ts
// features/credits/actions.ts
const result = await applyLedger({
  partnerId, amount, type, reason,
  referenceType, referenceId, idempotencyKey, createdById,
});
if (!result.ok) {
  // result.error = "conflict" (insufficient_balance 는 unreachable — debt 분배)
}
// result.balanceAfter / result.debtAfter 둘 다 ledger 스냅샷 값.
```

직접 prisma 호출 시 보장이 깨짐:
- 멱등성 (idempotencyKey UNIQUE 인덱스 + P2002 catch)
- balance / debt 양변 분배 (앱 레이어 단일 enforcement)
- 낙관적 잠금 재시도 (`version` 컬럼)
- ledger ↔ balance 원자성

### 동시성 — 낙관적 잠금 + 호출자 재시도

`applyLedger` 자체는 **2회 시도** 후 실패하면 `conflict` 반환. 캐시 일관성 + latency tail 트레이드오프. N=10 동시 갱신처럼 contention 이 높으면 호출자가 conflict 를 재시도하는 모델 (scripts/test-credit-concurrency.ts 참조). 운영 중 빈번하면 queue 모델로 격상.

### 멱등성 키 정책

- `topup`: `idempotencyKey = paymentId` (PG 웹훅 재전송 + client-side acknowledgeTopup 가 같은 키로 충돌해도 한 row 만 통과).
- `spend`: 호출자가 안정 키 제공 필수 (예: `assignment:${assignmentId}:exposure`).
- `refund`: provider 가 `cancelPayment` 지원하면 `cancellation:${cancellationId}` (어드민 UI 환불과 외부 콘솔 환불의 webhook echo 가 같은 key 로 dedup). 미지원 (stub) 이면 `null`.
- `adjustment`: `null` (어드민 수기, 인간이 의도적으로 두 번 누르면 두 row 가 정상 — UNIQUE NULL distinct).

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
| `refundTopup` (어드민 UI) | `adminSession.user.id` |
| `confirmTopup` (웹훅 / acknowledgeTopup) | `null` — 시스템; 파트너는 `referenceId=paymentId` 로 역추적 |
| 외부 PortOne 콘솔 환불 webhook | `null` — 시스템 (actor 없음) |
| `spendCredit` (시스템) | `null` |

`createdById` 는 **FK 미설정** — user 삭제 시 audit 가 사라지면 안 됨.

### 잔액 row 생애주기 — eager-create

`Partner.exists ⇔ PartnerCreditBalance.exists` 불변식. 파트너 가입 트랜잭션 ([src/app/partner/signup/[token]/actions.ts](../../app/partner/signup/[token]/actions.ts) `verifyPartnerSignupOtp`) 안에서 `tx.partnerCreditBalance.create` 가 user/partner 와 함께 INSERT. 가입 트랜잭션이 단일 진입점이므로 다른 곳에서 balance row 를 만들지 말 것.

방어책 두 단계:
1. [prisma/seed.ts](../../../prisma/seed.ts) `seedPartnerCreditBalances()` 가 멱등 upsert 로 기존 파트너 백필.
2. `queries.ts:getCreditBalance` 와 `apply-ledger` 가 row 없으면 lazy upsert — 시더 누락 환경 대비.

## PaymentProvider 추상화

`PaymentProvider` 인터페이스 ([payment/provider.ts](payment/provider.ts)) 는 4 메서드 — `initiatePayment` + `verifyWebhook` 필수, `fetchPaymentStatus` + `cancelPayment` optional. action 은 provider 의 stash 메커니즘을 알 필요 없음 — provider 가 자체 책임.

선택은 `process.env.CREDIT_PAYMENT_PROVIDER` 가 결정:
- `"portone"` → PortOnePaymentProvider (4 메서드 모두 구현, env 4종 필수)
- 그 외 / 미설정 → StubPaymentProvider (2 메서드만 구현, production fail-closed)

### `PaymentInitResult` 의 두 가지 kind

provider 가 두 가지 시작 방식 중 하나 반환:

- `kind: "redirect"` (stub) — client (TopupAmountForm) 가 `window.location.href = redirectUrl`.
- `kind: "sdk"` (portone) — client 가 동적 import 후 `PortOne.requestPayment(sdkPayload)`.

이 분기는 `topup-amount-form.tsx` 와 [`schema.ts`](schema.ts) 의 `TopupInitMutationState` 만 알면 됨. webhook route / acknowledgeTopup / refundTopup 은 provider name 만 신경.

### Stub provider (dev 전용)

- `initiatePayment`: paymentId 만 담은 `/api/webhooks/credits/stub?paymentId=...` URL 반환 (`kind: "redirect"`). (`partnerId, amount`) 는 Redis `topup:pending:{paymentId}` 에 1시간 stash.
- `verifyWebhook`: `process.env.NODE_ENV === "production"` 이면 즉시 fail-closed (`invalid_signature` 반환). dev 에선 stash 조회 → `kind: "topup_completed"` event 반환.
- `fetchPaymentStatus` / `cancelPayment`: **미구현** — stub 환경에서 acknowledgeTopup 은 `not_supported` 반환, 환불 UI 는 PG 호출 없이 ledger 만 작성.

### PortOne provider

- `initiatePayment`: Redis stash + `PaymentRequest` 페이로드 반환 (`kind: "sdk"`). `customData` 에 `{ v, partnerId }` 박아 PortOne API 응답으로 회수 가능 (stash 만료 시 fallback). 휴대폰번호 (`customer.phoneNumber`) 필수 — KG이니시스 V2 등.
- `verifyWebhook`: `@portone/server-sdk` 의 `PortOne.Webhook.verify(secret, body, headers)` 사용 (Standard Webhooks, headers: `webhook-id` / `webhook-signature` / `webhook-timestamp`). **2024-04-25 페이로드 형식 전용** — 운영자가 PortOne 콘솔에서 "결제모듈 V2" 로 등록해야 일치. 다른 버전이면 verify 실패 (`invalid_signature`). Event 분기:
  - `Transaction.Paid` → `getPayment` 로 금액 + partnerId 재확인 → `kind: "topup_completed"`.
  - `Transaction.Cancelled` / `Transaction.PartialCancelled` → `getPayment.cancellations[]` 에서 `cancellationId` 매칭 → `kind: "refund"`.
  - 그 외 (VirtualAccountIssued / Failed / Ready / BillingKey.* / Dispute*) → `kind: "ignored"`.
- `fetchPaymentStatus`: `getPayment` + `status === "PAID"` 확인 + partnerId 회수 (stash 우선, fallback customData). acknowledgeTopup 진입점.
- `cancelPayment`: `payment.cancelPayment` 호출 → `cancellation.id` 반환. refundTopup 진입점.

### acknowledgeTopup — client SDK 성공 직후 즉시 ack

PortOne 흐름에서 webhook 도착 대기 없이 잔액 즉시 갱신:
- 진입: PC → TopupAmountForm 의 `PortOne.requestPayment` Promise resolve 직후 / 모바일 → `/partner/credits/topup/result` 페이지.
- 인증: `requirePartnerSession()` + PG 응답의 partnerId 와 session.partnerId 교차 검증.
- 같은 paymentId 의 webhook 가 늦게 도착해도 `idempotencyKey = paymentId` 로 alreadyApplied no-op.
- stub 환경에선 `fetchPaymentStatus` 미구현 → `not_supported` 반환, webhook (GET redirect) 만으로 잔액 갱신.

### refundTopup ⇄ webhook 의 환불 양쪽 흡수

- 어드민 UI 환불 (`refundTopup`): `cancelPayment` → 성공 시 `applyLedger(idempotencyKey=cancellation:X)` 한 액션. createdById=admin.user.id.
- 외부 PortOne 콘솔 환불: webhook (Transaction.Cancelled) → 같은 idempotencyKey 로 `applyLedger`. createdById=null.
- 어드민 UI 가 먼저 작성한 row 가 있으면 webhook 은 alreadyApplied no-op.

⚠️ **트랜잭션 경계 한계**: `cancelPayment` 성공 + `applyLedger` 실패 (conflict 극히 드묾) 시 PG 와 ledger 가 어긋남. 운영 대응을 위해 actions.ts:refundTopup 가 cancellationId + 컨텍스트를 명시 로깅.

## 안티패턴

- ❌ `prisma.partnerCreditBalance.update` / `prisma.partnerCreditLedger.create` 직접 호출 — `applyLedger` 경유 필수.
- ❌ `Decimal` / `Float` / `BigInt` amount 컬럼 사용.
- ❌ ledger row UPDATE / DELETE — 진실로 append-only. 환불은 역항목 새 row (`type='refund'`) 로.
- ❌ DB CHECK 로 `balance >= 0` 강제 — 프로젝트 컨벤션상 DB CHECK 미사용. `applyLedger` 의 양변 분배가 단일 enforcement (balance / debt 모두 자연히 ≥ 0).
- ❌ `refundTopup` 을 referenceId 없이 호출 / `adjustCredit` 에 referenceId 채워 호출 — 의미 혼탁. 환불은 결제건 종속, 조정은 무관.
- ❌ Action 안에서 직접 stash 조작 — provider 가 자체 책임. `initiateTopup` 은 stash 메커니즘을 알지 않음.
- ❌ webhook route 에서 `requirePartnerSession()` 호출 — 웹훅은 PG 인프라 호출. `PaymentProvider.verifyWebhook` 가 인증.
- ❌ `confirmTopup` 을 폼에서 직접 호출 — 폼 액션은 `acknowledgeTopup` 만 호출. `confirmTopup` 은 webhook + acknowledgeTopup 두 경로의 공통 sink.
- ❌ `acknowledgeTopup` 안에서 partner 본인 검증 우회 — `session.partnerId !== status.partnerId` cross-check 필수 (PG 응답 위조는 어렵지만 defense in depth).
- ❌ `refundTopup` 가 `cancelPayment` 실패 후 ledger 작성 진행 — PG 가 거부했는데 우리 잔액만 음수로 빠지면 사용자 자산 침해. 반드시 PG 성공 → ledger 순.
- ❌ `spendCredit` 을 클라이언트나 미인가 액션에서 호출 — 호출처가 자체 인증 필수 (세션 가드 없음).
- ❌ `'use cache'` 를 `queries.ts` 에 추가 — 모든 호출이 `require*Session()` 트리 하위라 자동 dynamic. 캐싱 추가 시 잔액 stale 위험.

## Spend 트리거 패턴

현재 운영 중인 spend 트리거:

| 트리거 | 호출처 | idempotencyKey | amount |
|---|---|---|---|
| 가입자 연락 요청 | [features/plan-proposals/actions.ts](../plan-proposals/actions.ts) `requestPlanProposalContact` | `proposal-contact:${proposalId}` | `PlanRequest.price` (snapshot) |

신규 spend 트리거 추가 시 템플릿:

```ts
// features/<도메인>/actions.ts
import { spendCredit } from "@/features/credits/actions";

export async function someTrigger(/* ... */) {
  // 호출처 자체 인증 (admin 액션이면 requireAdminSession, customer flow 면 token 검증 등)

  const spend = await spendCredit({
    partnerId,
    amount: PRICE,
    referenceType: "<도메인>",
    referenceId: entityId,
    idempotencyKey: `<도메인>:${entityId}`,
    reason: "사람이 읽을 사유",
  });
  if (!spend.ok) {
    // conflict / invalid_input — 운영 모니터링 로그. 사용자 흐름은 그대로 진행.
    // insufficient_balance 는 unreachable (debt 분배로 흡수).
  }
}
```

`idempotencyKey` 는 같은 트리거가 두 번 발화해도 같은 키여야 함. 재시도 안전.

**spend 와 도메인 mutation 의 트랜잭션 경계**: `applyLedger` 가 자체 트랜잭션을 보유하므로, 외부 도메인 mutation (예: `contactedAt` 마킹) 과 같은 트랜잭션으로 묶을 수 없음. 패턴: ① 도메인 mutation 트랜잭션 commit → ② 결과 분기에 따라 `spendCredit` 호출. process crash 시점에 ① 후 ② 전이면 다음 retry 에서 mutation 이 멱등 분기로 빠져 spend 미발화 (corner case — 빈번하면 outbox 패턴 도입).
