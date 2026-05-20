# 파트너 크레딧 시스템

> 설계사가 보유하는 크레딧 (1 credit = 1 KRW) 의 잔액 조회·충전·사용·환불 기반 인프라.
> 이 문서는 시스템 전체 구조와 핵심 결정 사항을 정리한 단일 진실 공급원입니다.
> 코드 컨벤션·anti-pattern 은 [src/features/credits/CLAUDE.md](../src/features/credits/CLAUDE.md), 라우트 표는 [docs/pages.md](pages.md).

---

## 0. 결정 사항

| 항목 | 결정 |
|---|---|
| 단위 | 1 credit = 1 KRW. 항상 `Int` (원). Decimal / Float / BigInt 금지. |
| 진실의 소스 | `PartnerCreditLedger` (append-only). `PartnerCreditBalance` 는 derived 캐시. |
| 동시성 | `balance.version` 컬럼의 낙관적 잠금 + 2회 재시도 → 실패 시 호출자 정책. |
| 멱등성 | `ledger.idempotencyKey` UNIQUE + 사전 lookup + P2002 catch (3중 방어). |
| 음수 잔액 정책 | `balance` 는 항상 ≥ 0. 부족분은 `debt` 컬럼에 누적. `applyLedger` 가 양변 분배 (입금→debt 우선 갚기, 출금→balance 우선 쓰기). DB CHECK 미사용. |
| 환불 | 어드민 UI 가 PortOne `cancelPayment` API 호출 + ledger 작성을 한 액션. webhook 의 `Transaction.Cancelled` 는 `cancellation:${cancellationId}` 멱등키로 dedup (외부 콘솔 환불 흡수용). |
| PG 연동 | `StubPaymentProvider` (dev) + `PortOnePaymentProvider` (실 PG). `CREDIT_PAYMENT_PROVIDER` env 로 분기. |
| Provider 추적 | ledger row 에 `provider` (`"stub"` / `"portone"`) + `providerRef` (PG 측 transactionId / cancellationId) 컬럼으로 forensic reconciliation. |

---

## 1. 데이터 모델

[prisma/schema.prisma](../prisma/schema.prisma) 의 두 모델, 모두 `claim` 스키마.

### 1.1 `PartnerCreditBalance` (Partner 와 1:1)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `partnerId` | `String @id` | `Partner.id` (= `User.id`) 공유. PK 이자 FK. |
| `balance` | `Int @default(0)` | 현재 사용 가능 잔액 (KRW). 항상 ≥ 0. |
| `debt` | `Int @default(0)` | 누적 부채 (KRW). spend 시 잔액 부족분이 여기로 쌓이고, 다음 topup 이 우선 충당. 항상 ≥ 0. |
| `version` | `Int @default(0)` | Optimistic lock counter. updateMany WHERE version=expected 패턴. |
| `createdAt` / `updatedAt` | `Timestamptz(6)` | 표준 timestamp. |

- `onDelete: Cascade` — 잔액은 derived. Partner 삭제 시 무의미.
- 1:1 보장: `partnerId` 가 PK 이자 FK.

### 1.2 `PartnerCreditLedger` (append-only 원장)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | `String @id` | nanoid(16). |
| `partnerId` | `String` | FK Partner (`onDelete: Restrict` — audit 보존). |
| `amount` | `Int` | 부호 있는 KRW. topup/refund 양수, spend 음수, adjustment 양·음 모두. |
| `balanceAfter` | `Int` | 이 row 적용 직후 balance 스냅샷. |
| `debtAfter` | `Int @default(0)` | 이 row 적용 직후 debt 스냅샷. 기존 row 는 default 0 백필 (debt 도입 이전 시점이라 의미적으로 정확). |
| `type` | `String` | `"topup"` \| `"spend"` \| `"adjustment"` \| `"refund"`. zod 검증, DB enum 아님. |
| `reason` | `String?` | 운영 메모 (adjustment 사유, spend feature 라벨 등). |
| `referenceType` | `String?` | 자유 포인터 type (예: `"payment"`, `"assignment"`). |
| `referenceId` | `String?` | 대응 entity id. FK 강제 안 함. |
| `idempotencyKey` | `String? @unique` | 외부 요청 단위 멱등키. NULL 허용 (다수 NULL row 공존). |
| `provider` | `String? @db.VarChar(32)` | 결제 제공자 (`"stub"` / `"portone"`). topup / refund 만 유의미, adjustment / spend 는 null. |
| `providerRef` | `String?` | PG 측 거래 식별자 (topup: transactionId, refund: cancellationId). PG 콘솔 reconciliation join 키. |
| `createdById` | `String?` | 액터의 `User.id`. 시스템 자동 (웹훅·spend) 은 null. FK 미설정. |
| `createdAt` | `Timestamptz(6)` | INSERT 시각. |

**인덱스**
- `@@index([partnerId, createdAt(sort: Desc)])` — 거래 내역 최신순 페이지네이션.
- `@@index([referenceType, referenceId])` — 원본 entity → ledger 역추적 (paymentId 로 topup 확인, assignmentId 로 spend 확인).

**Append-only 원칙**
- row UPDATE / DELETE 금지 (운영 SQL 포함).
- 환불은 별도 row (`type='refund'`, 음수 amount, `referenceId=paymentId`) 로 표현.

### 1.3 잔액 row 생애주기 — eager-create 불변식

**불변식**: `Partner.exists ⇔ PartnerCreditBalance.exists`

세 단계 보장:
1. **가입 트랜잭션**: [src/app/partner/signup/[token]/actions.ts:329](../src/app/partner/signup/[token]/actions.ts:329) `verifyPartnerSignupOtp` 의 단일 트랜잭션 안에서 `tx.user.create` → `tx.partner.create` → `tx.partnerCreditBalance.create` → invitation 소비 순으로 INSERT. all-or-nothing 원자성.
2. **시더 백필**: [prisma/seed.ts](../prisma/seed.ts) `seedPartnerCreditBalances()` 가 기존 partner 들에 멱등 upsert. `pnpm db:seed` 매 호출 안전.
3. **Lazy fallback**: [src/features/credits/queries.ts](../src/features/credits/queries.ts) `getCreditBalance` 와 `lib/apply-ledger.ts` 가 row 없으면 자체 upsert. 시더 누락 환경 방어.

---

## 2. `applyLedger` — 단일 chokepoint

[src/features/credits/lib/apply-ledger.ts](../src/features/credits/lib/apply-ledger.ts).

**모든 잔액 변동은 반드시 이 함수 경유.** 직접 `prisma.partnerCreditBalance.update` / `prisma.partnerCreditLedger.create` 호출 금지.

### 2.1 시그니처

```ts
type ApplyLedgerInput = {
  partnerId: string;
  amount: number;                          // signed
  type: "topup" | "spend" | "adjustment" | "refund";
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  createdById: string | null;
  provider?: string | null;                // "stub" / "portone" — topup/refund 만, 그 외 null
  providerRef?: string | null;             // PG transactionId (topup) / cancellationId (refund)
};
type ApplyLedgerResult =
  | {
      ok: true;
      ledgerId: string;
      balanceAfter: number;
      debtAfter: number;
      alreadyApplied: boolean;
    }
  /// `insufficient_balance` 는 debt 분배 도입 이후 unreachable.
  /// 시그니처 호환을 위해 union 에 남김 — 실제로는 `conflict` 만 발생.
  | { ok: false; error: "insufficient_balance" | "conflict" };
```

### 2.2 알고리즘

```
1) 멱등 사전 조회
   idempotencyKey 가 주어졌고 같은 키 ledger row 존재 → alreadyApplied:true 즉시 반환

2) 시도 루프 (최대 2회):
   a) balance row 조회 (balance, debt, version)
      없으면 upsert(create default) → 다음 시도로 (lazy fallback)
   b) 분배:
      - amount ≥ 0 (입금): repay = min(debt, amount)
                          newDebt    = debt - repay
                          newBalance = balance + (amount - repay)
      - amount < 0 (출금): need = -amount
                          take       = min(balance, need)
                          newBalance = balance - take
                          newDebt    = debt + (need - take)
      → newBalance, newDebt 모두 자동으로 ≥ 0 (insufficient_balance 차단 없음)
   c) prisma.$transaction:
      - ledger INSERT (balanceAfter = newBalance, debtAfter = newDebt)
      - balance updateMany WHERE partnerId AND version=current.version
                          SET balance=newBalance, debt=newDebt, version += 1
      - count !== 1 → throw VersionConflictError → 전체 rollback (ledger 도 사라짐)
   d) P2002 catch (idempotencyKey UNIQUE 충돌 — 동시 caller 가 같은 키로 INSERT 함)
      → 승자 row 조회 → alreadyApplied:true

3) 2회 연속 version 충돌 → conflict 반환 (호출자가 재시도 정책 결정)
```

### 2.3 보장 매트릭스

| 속성 | 메커니즘 |
|---|---|
| 멱등성 | UNIQUE 인덱스 + 사전 lookup + P2002 catch (3중) |
| 원자성 | 단일 `$transaction` (ledger INSERT + balance/debt UPDATE) |
| 동시성 | `version` 낙관적 잠금 + 1회 재시도 |
| balance / debt ≥ 0 | 양변 분배 알고리즘 (insufficient_balance 발생 X — debt 로 흡수) |
| 액터 추적 | `createdById` (FK 없음, user 삭제 시에도 audit 보존) |

### 2.4 동시성 트레이드오프

- 2회 시도는 **chokepoint 자체 한계**. 호출자가 conflict 를 surface 받으면 사용자에게 "잠시 후 다시 시도" 안내.
- N=10 동시 갱신 같은 고-contention 시나리오는 caller-level 재시도 필요 ([scripts/test-credit-concurrency.ts](../scripts/test-credit-concurrency.ts) 참조).
- 운영 중 conflict 가 빈번해지면 queue 모델로 격상 고려 (현 규모에선 과설계).

---

## 3. 4 가지 ledger type

| 타입 | 의미 | reference | createdById | 멱등키 | provider | 입력 액션 |
|---|---|---|---|---|---|---|
| `topup` | PG 결제 충전 | `("payment", paymentId)` | `null` (시스템) | `paymentId` | `"portone"` / `"stub"` | `acknowledgeTopup` (client 즉시 ack) + `confirmTopup` (webhook safety net) |
| `spend` | 시스템 자동 차감 | `(domain, entityId)` | `null` (시스템) | 호출자 책임 | `null` | `spendCredit` (내부) |
| `adjustment` | 일방적 보정 | `(null, null)` | `admin.user.id` | `null` | `null` | `adjustCredit` (어드민) |
| `refund` | 특정 결제건 환불 (어드민 UI) | `("payment", paymentId)` | `admin.user.id` | `cancellation:${cancellationId}` (PG 지원 시) / `null` (stub) | `"portone"` / `"stub"` | `refundTopup` (PG cancel + ledger 한 액션) |
| `refund` | 외부 콘솔 환불 echo (webhook) | `("payment", paymentId)` | `null` (시스템) | `cancellation:${cancellationId}` | `"portone"` | webhook route refund 분기 |

### 3.1 조정 vs 환불 — 의미 분리

- **조정 (`adjustment`)**: 일방적 보정. 이벤트 보상 / 운영 실수 정정 / 시스템 오류 보상. `referenceId=null`, 부호 자유.
- **환불 (`refund`)**: 특정 결제건의 전액/부분 되돌리기. `referenceType="payment", referenceId=<paymentId>` 필수.

환불의 추가 검증:
1. 해당 partner 의 `type='topup', referenceId=paymentId` row 존재 (소유권·진정성).
2. 같은 paymentId 의 누적 환불 (`refund` row amount 합의 절대값) + 이번 환불 ≤ 원본 충전 금액 → 부분 환불 다회 허용.
3. PG 환불 (`cancelPayment`) 가 거부되면 ledger 작성 자체 차단 (사용자 자산 침해 회피). `applyLedger` 자체는 차단하지 않음 — 환불액이 잔액을 초과하면 부족분이 `debt` 로 누적 (PG 가 이미 환불을 집행했으므로 ledger 가 그 의무를 기록).

임의 차감 의도는 `adjustCredit` 으로 표현 (audit 명료성). `refundTopup` 을 referenceId 없이 호출 금지.

### 3.2 멱등키 정책

- `topup`: `idempotencyKey = paymentId` — PG 웹훅 재전송 + `acknowledgeTopup` 동시 도착 시 한 쪽만 INSERT, 다른 쪽 P2002 → alreadyApplied no-op.
- `spend`: 호출자가 안정 키 제공 필수 (예: `assignment:${assignmentId}:exposure`). 같은 트리거 두 번 발화 시 같은 키여야 함.
- `refund`: provider 가 `cancelPayment` 지원 시 `cancellation:${cancellationId}` (어드민 UI 환불과 외부 콘솔 환불의 webhook echo 가 같은 키로 dedup). 미지원 (stub) 이면 `null`.
- `adjustment`: `null` — 어드민 수기. 인간이 의도적으로 두 번 누르면 두 row 가 정상 (UNIQUE NULL distinct).

---

## 4. 충전 흐름

### 4.1 PortOne (실 PG) 시퀀스

```
[파트너 브라우저]                  [Next 서버]                   [PortOne]                  [Redis]
       │                              │                              │                       │
       │ POST /partner/credits/topup  │                              │                       │
       │ (initiateTopup action)       │                              │                       │
       ├─────────────────────────────►│                              │                       │
       │                              │ requirePartnerSession        │                       │
       │                              │ paymentId = newId()          │                       │
       │                              │ provider.initiatePayment ────┼─────────────────────► stash(paymentId,
       │                              │                              │                        {partnerId,
       │                              │◄─ { kind:"sdk", sdkPayload } │                        amount}) EX=3600
       │◄─ { ok, paymentId, sdkPayload }                              │                       │
       │                              │                              │                       │
       │ dynamic import + PortOne.requestPayment(sdkPayload)          │                       │
       ├──────────────────────────────────────────────────────────────► PG 위젯 (모달 / 리다이렉트) │
       │                              │                              │                       │
       │ ← PC: Promise resolve / 모바일: redirectUrl 로 navigate ────┤                       │
       │                              │                              │                       │
       │ acknowledgeTopup({ paymentId }) [PC] / result 페이지 [모바일]│                       │
       ├─────────────────────────────►│                              │                       │
       │                              │ requirePartnerSession        │                       │
       │                              │ provider.fetchPaymentStatus ─┼──► GET /payments/{id} │
       │                              │                              │◄─ PAID + amount + customData
       │                              │ partnerId 회수 (stash 우선) ─┼──────────────────────► read(paymentId)
       │                              │ session.partnerId vs PG cross-check                  │
       │                              │ confirmTopup → applyLedger { │                       │
       │                              │   type:"topup",              │                       │
       │                              │   idempotencyKey=paymentId,  │                       │
       │                              │   provider:"portone",        │                       │
       │                              │   providerRef:transactionId  │                       │
       │                              │ }                            │                       │
       │                              │ clearPendingTopup ───────────┼──────────────────────► del(paymentId)
       │◄─ { ok, ledgerId } ──────────┤                              │                       │
       │                                                                                      │
       │ window.location = /partner/credits                                                   │
       │                              │                              │                       │
       │ ─────────────── (1-2초 후, 동시) ─────────────────────────── │                       │
       │                              │ POST /api/webhooks/credits/portone                   │
       │                              │◄─ Transaction.Paid (HMAC) ───┤                       │
       │                              │ verifyWebhook → fetchPaymentStatus 동일 경로         │
       │                              │ confirmTopup → applyLedger 같은 idempotencyKey       │
       │                              │ ──► alreadyApplied:true, NO-OP                       │
```

### 4.2 Stub (dev) 시퀀스

PortOne 위젯 없이 동작 — `kind: "redirect"` 로 webhook URL 즉시 호출:

```
[브라우저] → initiateTopup → { kind:"redirect", redirectUrl:"/api/webhooks/credits/stub?paymentId=..." }
         → window.location = redirectUrl
         → GET /api/webhooks/credits/stub?paymentId=...
            → verifyWebhook (stash 조회) → confirmTopup → applyLedger { provider:"stub", providerRef:null }
         → 303 /partner/credits
```

Stub 은 `fetchPaymentStatus` / `cancelPayment` 미구현 → acknowledgeTopup 은 `not_supported` 반환, 환불 UI 는 PG 호출 없이 ledger 만 작성.

### 4.3 핵심 안전장치

- **paymentId 발급 책임**: 우리 서버 (PG 가 아님). 우리가 만든 paymentId 가 ledger 의 idempotencyKey 가 되므로 통제권 보존.
- **stash → fetchPaymentStatus**: PG 응답이 paymentId 만 들고 와도 `(partnerId, amount)` 를 신뢰 가능. Redis TTL 1시간. PortOne 의 `customData` 필드에 `{ v, partnerId }` 도 박아 stash 만료 시 fallback.
- **금액 위변조 차단**: stash 의 amount 와 PG API 응답의 `payment.amount.total` cross-check — 클라가 totalAmount 조작해도 webhook/ack 단계에서 거부.
- **session × PG cross-check**: `acknowledgeTopup` 가 `session.partnerId !== status.partnerId` 거부 — defense in depth.
- **즉시 UX vs 안전망**: client SDK 성공 직후 `acknowledgeTopup` 가 ledger 작성 → 잔액 즉시 반영. webhook 가 1-2초 뒤 도착해도 같은 idempotencyKey 로 no-op. 비정상 종료 (브라우저 닫힘 / 네트워크 끊김) 시는 webhook 가 유일한 작성자 (safety net).
- **PAYMENT_NOT_FOUND 격리**: 콘솔 [호출 테스트] / stale event 는 PG API 가 404 → `ignored` 로 200 OK 응답 (재시도 X). 다른 에러는 400 으로 PortOne 재시도 유도.
- **stub 보안**: `StubPaymentProvider.verifyWebhook` 은 `NODE_ENV==="production"` 일 때 즉시 fail-closed → 실수로 prod 에 leak 돼도 무해.

### 4.4 환불 흐름

```
[어드민 UI] → refundTopup action
            → 원본 topup 조회 + 누적 환불 검증
            → provider.cancelPayment({ paymentId, amount, reason })
              ↓
              [PortOne] cancelPayment API → cancellationId 반환
              ↓
            → applyLedger {
                type:"refund",
                amount: -amount,
                idempotencyKey: `cancellation:${cancellationId}`,
                provider:"portone",
                providerRef: cancellationId,
                createdById: admin.user.id,
              }
            → revalidatePath

[PortOne webhook] Transaction.Cancelled (1-2초 후)
                ↓
                → verifyWebhook → resolveRefund (getPayment 로 cancellation 매칭)
                → applyLedger { 같은 cancellationId 키 } → alreadyApplied no-op
                  (외부 PortOne 콘솔에서 직접 환불한 경우는 여기서 new ledger 작성, createdById=null)
```

⚠️ **트랜잭션 경계 한계**: `cancelPayment` 성공 후 `applyLedger` 실패 (conflict 극히 드묾) 시 PG 와 ledger 가 어긋남. `refundTopup` 가 cancellationId + 컨텍스트를 명시 로깅 → 수동 reconcile.

### 4.5 PaymentProvider 추상화

[src/features/credits/payment/provider.ts](../src/features/credits/payment/provider.ts).

```ts
interface PaymentProvider {
  readonly name: string;
  initiatePayment(input): Promise<PaymentInitResult>;          // kind: "redirect" | "sdk"
  verifyWebhook(rawBody, headers, searchParams): Promise<WebhookVerifyResult>;
  fetchPaymentStatus?(paymentId): Promise<FetchPaymentStatusResult>;  // optional (stub 미구현)
  cancelPayment?(input): Promise<CancelPaymentResult>;                // optional (stub 미구현)
}
```

- **Stub**: `initiatePayment` 가 `kind:"redirect"` → webhook URL 반환. 위 두 optional 메서드 미구현.
- **PortOne**: `initiatePayment` 가 `kind:"sdk"` → 브라우저 SDK 페이로드 반환. `Webhook.verify` 는 `@portone/server-sdk` 의 2024-04-25 전용. `noticeUrls` 는 의도적으로 미지정 — 콘솔 등록 URL 만 사용 (브라우저 접속 URL 과 webhook URL 강결합 회피).

선택은 `process.env.CREDIT_PAYMENT_PROVIDER` 가 결정 — `"portone"` 이면 PortOne, 그 외 / 미설정 → Stub. PortOne 선택 시 4종 env (`PORTONE_STORE_ID` / `PORTONE_CHANNEL_KEY` / `PORTONE_API_SECRET` / `PORTONE_WEBHOOK_SECRET`) 필수 (lazy validate, [src/server/portone.ts](../src/server/portone.ts)).

---

## 5. 코드 구조

### 5.1 `src/features/credits/`

```
credits/
├─ schema.ts                  # zod — CreditType + Adjustment/Refund/TopupInit/Spend 입력 + Mutation 상태 (sdkPayload 분기 포함)
├─ queries.ts                 # 'server-only' — getCreditBalance / listCreditLedger(cursor) / getRecentLedger / listRefundableTopups
├─ actions.ts                 # 'use server' — adjustCredit / refundTopup / initiateTopup / acknowledgeTopup / confirmTopup / spendCredit
├─ lib/apply-ledger.ts        # 'server-only' ⭐ 단일 chokepoint (provider/providerRef 포함)
├─ payment/types.ts           # client 도 import 가능 — PortOneSdkPayload (browser-sdk PaymentRequest alias)
├─ payment/provider.ts        # 'server-only' — PaymentProvider 추상 + StubPaymentProvider + stash 헬퍼
├─ payment/portone.ts         # 'server-only' — PortOnePaymentProvider (실 PG)
├─ payment/index.ts           # 'server-only' — getPaymentProvider() 팩토리 (CREDIT_PAYMENT_PROVIDER env 분기)
├─ ui/credit-balance-card.tsx # Server — 잔액 카드 + CTA
├─ ui/ledger-list.tsx         # Server — 거래 내역 (full / compact)
├─ ui/adjustment-form.tsx     # Client — 어드민 조정 폼
├─ ui/refund-form.tsx         # Client — 환불 폼 (결제 드롭다운)
├─ ui/topup-amount-form.tsx   # Client — 파트너 충전 폼 + 동적 SDK import 분기 (redirect | sdk)
└─ CLAUDE.md                  # 도메인 규칙 + anti-pattern
```

### 5.2 라우트

| 경로 | 역할 | 인증 |
|---|---|---|
| [`/partner`](../src/app/partner/(dashboard)/page.tsx) | 대시보드 — 잔액 카드 임베드 | `requirePartnerSession` (layout) |
| [`/partner/credits`](../src/app/partner/(dashboard)/credits/page.tsx) | 잔액 + 거래 내역 (cursor pagination) | `requirePartnerSession` |
| [`/partner/credits/topup`](../src/app/partner/(dashboard)/credits/topup/page.tsx) | 충전 금액 입력 → PG SDK 호출 / stub redirect | `requirePartnerSession` |
| [`/partner/credits/topup/result`](../src/app/partner/(dashboard)/credits/topup/result/page.tsx) | 모바일 SDK redirect 착지 — `acknowledgeTopup` 호출 + 성공/실패 안내 | `requirePartnerSession` |
| [`/admin/partners/[id]`](../src/app/admin/(dashboard)/partners/[id]/page.tsx) | 조정 폼 + 환불 폼 + 거래 내역 임베드 | `requireAdminSession` (layout) |
| [`/api/webhooks/credits/[provider]`](../src/app/api/webhooks/credits/[provider]/route.ts) | PG 콜백 수신 — Paid → confirmTopup, Cancelled → refund ledger, 그 외 ignored | `PaymentProvider.verifyWebhook` |

### 5.3 외부 자원

| 자원 | 키 | TTL | 용도 |
|---|---|---|---|
| Redis | `topup:pending:{paymentId}` | 3600s | 충전 개시 시 `(partnerId, amount)` 보관. PG 콜백 검증에 사용. |

---

## 6. 검증

### 6.1 자동

- [scripts/test-credit-concurrency.ts](../scripts/test-credit-concurrency.ts) — 10 병렬 +1000 조정 시 balance 정확히 +10,000 / version +10 / ledger 10행 / balanceAfter 단조증가.
- 같은 스크립트 `spend` 모드 — 잔액 초과 spend 시도 시 balance=0 + 부족분만큼 debt 누적 + ledger 전부 작성 (debtAfter 단조증가, insufficient_balance 차단 없음).

```bash
# 사용법
pnpm exec tsx scripts/test-credit-concurrency.ts <partnerId>          # 동시성
pnpm exec tsx scripts/test-credit-concurrency.ts <partnerId> spend    # debt 분배
```

### 6.2 수동 — Stub (env 미설정 / `CREDIT_PAYMENT_PROVIDER=stub`)

1. 어드민 로그인 → `/admin/partners/<id>` 진입 → 잔액 `0원` 확인.
2. "크레딧 수동 조정" 폼: `amount=10000`, `reason="테스트 충전"` 제출 → 잔액 `10,000원`, ledger 1행 (`type=adjustment`, `provider=null`).
3. 같은 파트너로 로그인 → `/partner` → "내역 보기" → `/partner/credits` 동일 내역 확인.
4. `/partner/credits/topup` → `amount=5000` 제출 → stub URL redirect → 잔액 `15,000원`, ledger `type=topup, referenceId=<paymentId>, provider="stub"`.
5. 같은 stub URL 재호출 (curl) → `{ ok: true }` 응답 + 잔액 불변 + 서버 로그 `topup idempotent replay`.
6. 어드민 "결제 환불 처리" 폼에서 위 5000원 결제 선택 → `amount=2000` 제출 → 잔액 `13,000원`, ledger `type=refund, referenceId=<paymentId>, provider="stub"`, 잔여 환불 가능 3000원으로 갱신.

### 6.3 수동 — PortOne 실연동 (`CREDIT_PAYMENT_PROVIDER=portone` + 4종 env)

사전 준비:
- PortOne 콘솔 → [결제 연동] → [결제알림(Webhook) 관리] → webhook 등록
  · **웹훅 버전: "결제모듈 V2"** (2024-04-25 필수)
  · Content Type: `application/json`
  · Endpoint URL: ngrok 호스트 + `/api/webhooks/credits/portone`
  · 시크릿 발급 → `PORTONE_WEBHOOK_SECRET` 에 저장
- ngrok 띄움 (`ngrok http 3000`) — PortOne 가 외부 도달 가능해야 함

검증:
1. 파트너 로그인 → `/partner/credits/topup` → `amount=5000` 제출.
2. PortOne 결제창 모달 뜸 → 테스트 카드 (예: 4111-1111-1111-1111) 결제.
3. PC: 모달 닫힘 직후 `acknowledgeTopup` → 잔액 즉시 +5000 → `/partner/credits` 자동 이동.
4. 1-2초 뒤 webhook 도착 → 서버 로그 `[credits-webhook] topup idempotent replay paymentId=<X>` 확인 (no-op).
5. ledger row 확인:
   ```sql
   SELECT type, amount, balance_after, provider, provider_ref, reference_id
   FROM claim.partner_credit_ledger ORDER BY created_at DESC LIMIT 3;
   ```
   → `type='topup', provider='portone', provider_ref=<PortOne transactionId>, reference_id=<paymentId>`.
6. 어드민 환불 폼에서 위 결제 선택 → `amount=2000` 제출 → PortOne API 환불 호출 → ledger 음수 row 작성 (`provider='portone', provider_ref=<cancellationId>`).
7. PortOne webhook (`Transaction.PartialCancelled`) 도착 → 같은 cancellationId 키로 alreadyApplied no-op.
8. (선택) PortOne 콘솔에서 직접 부분 환불 시도 → webhook 만으로 ledger refund row 작성 확인 (`createdById=null`).

⚠️ 콘솔 [호출 테스트] 는 dummy paymentId → `payment_not_found` → 200 `ignored` (정상 동작).

---

## 7. 운영 중 spend 트리거

| 트리거 | 호출처 | amount | idempotencyKey |
|---|---|---|---|
| 가입자 연락 요청 | [features/plan-proposals/actions.ts](../src/features/plan-proposals/actions.ts) `requestPlanProposalContact` | `PlanRequest.price` (Step1 snapshot) | `proposal-contact:${proposalId}` |

가격 결정은 `PlanRequestPriceTier` (budget 별 6 row, admin 편집) → `PlanRequest.price` 컬럼 snapshot. 자세한 가격 모델은 [domain-glossary.md](domain-glossary.md) 참조. 잔액 부족 시 ledger 가 정상 작성되고 부족분이 `debt` 로 누적되므로 호출자는 별도 분기 처리 불요.

## 8. 후속 작업 (이번 범위 외)

- **`/admin/partners/[id]/credits`** 전체 거래 내역 페이지 (현재는 compact 5건만 임베드).
- **충전 한도** (`1_000` ~ `10_000_000`) 을 [src/server/settings.ts](../src/server/settings.ts) `AppSettings` 로 승격.
- **잔액 임계치 알림** — 잔액 부족 시 파트너에게 알림톡.
- **동시 admin 환불 race 격상** — `applyLedger` 에 `validate(tx)` 콜백 도입해 트랜잭션 내 누적 환불 재검증.
- **간편결제 확장** — 현재 카드 단일. Kakao/Naver/Toss/Samsung 등 채널키별 분리 + UI 선택.
- **가상계좌 / 빌링키** — webhook 의 `VirtualAccountIssued` / `BillingKey.*` 현재 ignored. 도입 시 분기 추가.
- **다중 PG 운영** — Toss 추가 시 `getPaymentProvider()` 분기 확장. `provider` ledger 컬럼이 forensic 추적 기반.
- **자동 reconciliation 잡** — `cancelPayment` 성공 후 `applyLedger` 실패 같은 boundary 오류 탐지 + 자동 보정.

---

## 9. 안티패턴

[src/features/credits/CLAUDE.md](../src/features/credits/CLAUDE.md) 의 상세 목록 참조. 핵심 요약:

- ❌ `prisma.partnerCreditBalance.update` / `prisma.partnerCreditLedger.create` 직접 호출 — `applyLedger` 경유 필수.
- ❌ `Decimal` / `Float` / `BigInt` amount 컬럼.
- ❌ ledger row UPDATE / DELETE — append-only.
- ❌ DB CHECK 로 `balance >= 0` 강제 — 프로젝트 컨벤션상 미사용.
- ❌ `refundTopup` 을 referenceId 없이 호출 / `adjustCredit` 에 referenceId 채워 호출 — 의미 혼탁.
- ❌ webhook route 에서 `requirePartnerSession()` 호출 — 인증은 `verifyWebhook` 가 책임.
- ❌ `spendCredit` 을 클라이언트나 미인가 액션에서 호출 — 세션 가드 없음, 호출처가 자체 인증 책임.
- ❌ `'use cache'` 를 `queries.ts` 에 추가 — `require*Session()` 쿠키 read 로 자동 dynamic.
- ❌ `confirmTopup` 을 폼에서 직접 호출 — webhook + acknowledgeTopup 공통 sink. 폼은 `acknowledgeTopup` 만.
- ❌ `acknowledgeTopup` 의 `session.partnerId !== status.partnerId` cross-check 우회 — PG 응답 위조는 어렵지만 defense in depth.
- ❌ `refundTopup` 에서 `cancelPayment` 실패 후 ledger 작성 진행 — PG 가 거부했는데 잔액만 음수로 빠지면 사용자 자산 침해. 반드시 PG 성공 → ledger 순.
- ❌ `referenceType` 에 provider 이름 박기 (`"portone_payment"` 등) — `provider` 컬럼 책임. `referenceType` 은 도메인 entity 타입 (`"payment"`).
- ❌ webhook route 에 `noticeUrls` 동적 주입 — 의도적으로 미사용. 브라우저 접속 URL 과 webhook URL 강결합 회피. 환경 분리는 PortOne 콘솔 multi-webhook 등록.
