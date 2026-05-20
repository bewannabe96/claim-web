import "server-only";

import { Prisma } from "@prisma/client";

import { newId } from "@/lib/id";
import { prisma } from "@/server/db/prisma";

import type { CreditType } from "../schema";

/**
 * 크레딧 변동 단일 chokepoint — 모든 잔액 변동은 반드시 이 함수 경유.
 *
 * 직접 `prisma.partnerCreditBalance.update` / `prisma.partnerCreditLedger.create`
 * 호출 금지. adjustCredit / confirmTopup / spendCredit / 후속 refund 모두 이 헬퍼 호출.
 *
 * 보장:
 *   1. 멱등성 — idempotencyKey 가 주어지면 같은 키로 두 번째 호출은 no-op (alreadyApplied: true).
 *      UNIQUE 인덱스 + 사전 lookup + P2002 catch 의 3중 방어.
 *   2. 원자성 — ledger INSERT 와 balance UPDATE 가 단일 트랜잭션. version 충돌 시 ledger 도 rollback.
 *   3. 동시성 — version 컬럼 낙관적 잠금. 1회 재시도 후 두 번째 실패는 conflict 반환.
 *   4. 음수 잔액 금지 — newBalance < 0 이면 트랜잭션 진입 전 insufficient_balance 반환
 *      (앱 레이어 단일 enforcement, DB CHECK 미사용).
 *
 * 두 번째 시도 후에도 충돌하면 호출자에게 conflict 를 반환하고 호출자가 사용자에게
 * "잠시 후 다시 시도" 안내. 운영 중 빈번하면 queue 모델로 격상 고려 (현 규모에선 과설계).
 */

export type ApplyLedgerInput = {
  partnerId: string;
  /// 부호 있는 amount. topup/refund 양수, spend 음수, adjustment 양·음 모두.
  amount: number;
  type: CreditType;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  createdById: string | null;
  /// 결제 제공자 식별자. topup / refund 만 의미 있음 ("stub" | "portone" | "toss" 등).
  /// adjustment / spend / 호출자 미지정 시 null.
  provider?: string | null;
  /// PG 측 거래 식별자. topup 은 transactionId, refund 는 cancellationId.
  providerRef?: string | null;
};

export type ApplyLedgerResult =
  | { ok: true; ledgerId: string; balanceAfter: number; alreadyApplied: boolean }
  | { ok: false; error: "insufficient_balance" | "conflict" };

class VersionConflictError extends Error {}

export async function applyLedger(
  input: ApplyLedgerInput,
): Promise<ApplyLedgerResult> {
  // 1) 멱등 사전 조회 — 같은 키로 적용된 ledger 가 이미 있으면 즉시 반환.
  if (input.idempotencyKey) {
    const existing = await prisma.partnerCreditLedger.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, balanceAfter: true },
    });
    if (existing) {
      return {
        ok: true,
        ledgerId: existing.id,
        balanceAfter: existing.balanceAfter,
        alreadyApplied: true,
      };
    }
  }

  // 2) 시도 루프 — 최대 2회 (원래 + 1회 재시도).
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await prisma.partnerCreditBalance.findUnique({
      where: { partnerId: input.partnerId },
      select: { balance: true, version: true },
    });

    if (!current) {
      // 레거시 파트너 대응 — 가입 트랜잭션 도입 전 partner 들 또는 시더 누락 환경.
      // upsert 후 루프 재시도 (다음 회차에 current 가 채워짐).
      await prisma.partnerCreditBalance.upsert({
        where: { partnerId: input.partnerId },
        update: {},
        create: { partnerId: input.partnerId },
      });
      continue;
    }

    const newBalance = current.balance + input.amount;

    // 음수 잔액 차단 — 트랜잭션 진입 전. ledger 도 남지 않음.
    if (newBalance < 0) {
      return { ok: false, error: "insufficient_balance" };
    }

    const ledgerId = newId();

    try {
      await prisma.$transaction(async (tx) => {
        await tx.partnerCreditLedger.create({
          data: {
            id: ledgerId,
            partnerId: input.partnerId,
            amount: input.amount,
            balanceAfter: newBalance,
            type: input.type,
            reason: input.reason,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            idempotencyKey: input.idempotencyKey,
            createdById: input.createdById,
            provider: input.provider ?? null,
            providerRef: input.providerRef ?? null,
          },
        });

        const upd = await tx.partnerCreditBalance.updateMany({
          where: { partnerId: input.partnerId, version: current.version },
          data: {
            balance: newBalance,
            version: { increment: 1 },
          },
        });

        if (upd.count !== 1) {
          // version 이 바뀐 상태 — 다른 caller 가 같은 row 를 먼저 갱신.
          // throw 로 트랜잭션 전체 rollback (ledger INSERT 도 같이 사라짐).
          throw new VersionConflictError();
        }
      });

      return { ok: true, ledgerId, balanceAfter: newBalance, alreadyApplied: false };
    } catch (err) {
      if (err instanceof VersionConflictError) {
        // 다음 시도. 마지막 시도였다면 루프 종료 후 conflict 반환.
        continue;
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // idempotencyKey UNIQUE 충돌 — 다른 caller 가 동시에 같은 키로 INSERT 함.
        // 해당 ledger 재조회 후 alreadyApplied 반환.
        if (input.idempotencyKey) {
          const winner = await prisma.partnerCreditLedger.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            select: { id: true, balanceAfter: true },
          });
          if (winner) {
            return {
              ok: true,
              ledgerId: winner.id,
              balanceAfter: winner.balanceAfter,
              alreadyApplied: true,
            };
          }
        }
        // idempotencyKey 가 없는데 P2002 = id 충돌 (nanoid 16자 통계적으로 0).
        return { ok: false, error: "conflict" };
      }
      throw err;
    }
  }

  return { ok: false, error: "conflict" };
}
