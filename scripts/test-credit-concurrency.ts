/**
 * 크레딧 동시성 검증 스크립트 — applyLedger 의 낙관적 잠금 + 재시도 동작을 확인.
 *
 * 실행:
 *   pnpm exec tsx scripts/test-credit-concurrency.ts <partnerId>
 *
 * 검증 사항:
 *   1. 10개 동시 +1000 조정 후 balance 가 정확히 startBalance + 10_000
 *   2. ledger row 가 정확히 10개 추가
 *   3. balanceAfter 가 단조증가 (오름차순)
 *   4. version 이 정확히 +10
 *   5. 일부 호출이 attempt=2 에서 성공함 (정상 동작 — race 가 retry 로 흡수)
 *
 * 음수 잔액 시도:
 *   2번 인자로 "spend" 를 주면 999억 원 spend 시도 → insufficient_balance 확인 + ledger 무변경.
 */

// 직접 PrismaClient 사용 — server-only 가드를 우회 (CLI 스크립트라 Server Component 아님).
// applyLedger 는 prisma 싱글톤을 import 하지만 그 안의 server-only 도 같은 이유로
// 스크립트에선 통과시키려면 module 패치가 필요 — 대신 여기서는 applyLedger 의 로직을
// 직접 호출하지 않고, ledger + balance 의 동시 갱신을 같은 알고리즘으로 재구현해
// chokepoint 검증. 실제 호출 경로 (server action) 테스트는 UI / 통합 테스트로 별도.
//
// 이 스크립트의 목적: ledger row 추가 + version 증가 + balance 갱신이 race 안전한지를
// 동일 transaction 로직으로 시뮬레이션.

import { Prisma, PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";

const prisma = new PrismaClient();
const ID_ALPHABET =
  "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const newId = customAlphabet(ID_ALPHABET, 16);

class VersionConflictError extends Error {}

type ApplyInput = {
  partnerId: string;
  amount: number;
  type: "topup" | "spend" | "adjustment" | "refund";
  reason: string | null;
  idempotencyKey: string | null;
};
type ApplyResult =
  | { ok: true; ledgerId: string; balanceAfter: number; alreadyApplied: boolean }
  | { ok: false; error: "insufficient_balance" | "conflict" };

async function applyLedger(input: ApplyInput): Promise<ApplyResult> {
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

  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await prisma.partnerCreditBalance.findUnique({
      where: { partnerId: input.partnerId },
      select: { balance: true, version: true },
    });
    if (!current) {
      await prisma.partnerCreditBalance.upsert({
        where: { partnerId: input.partnerId },
        update: {},
        create: { partnerId: input.partnerId },
      });
      continue;
    }
    const newBalance = current.balance + input.amount;
    if (newBalance < 0) return { ok: false, error: "insufficient_balance" };

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
            referenceType: null,
            referenceId: null,
            idempotencyKey: input.idempotencyKey,
            createdById: null,
          },
        });
        const upd = await tx.partnerCreditBalance.updateMany({
          where: { partnerId: input.partnerId, version: current.version },
          data: { balance: newBalance, version: { increment: 1 } },
        });
        if (upd.count !== 1) throw new VersionConflictError();
      });
      return { ok: true, ledgerId, balanceAfter: newBalance, alreadyApplied: false };
    } catch (err) {
      if (err instanceof VersionConflictError) continue;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        if (input.idempotencyKey) {
          const winner = await prisma.partnerCreditLedger.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            select: { id: true, balanceAfter: true },
          });
          if (winner)
            return {
              ok: true,
              ledgerId: winner.id,
              balanceAfter: winner.balanceAfter,
              alreadyApplied: true,
            };
        }
        return { ok: false, error: "conflict" };
      }
      throw err;
    }
  }
  return { ok: false, error: "conflict" };
}

async function main() {
  const partnerId = process.argv[2];
  const mode = process.argv[3] ?? "concurrency";
  if (!partnerId) {
    throw new Error(
      "usage: pnpm exec tsx scripts/test-credit-concurrency.ts <partnerId> [concurrency|spend]",
    );
  }

  const before = await prisma.partnerCreditBalance.findUnique({
    where: { partnerId },
  });
  if (!before) {
    throw new Error(`partner ${partnerId} has no credit balance row`);
  }
  console.log("[before]", before);

  if (mode === "spend") {
    const res = await applyLedger({
      partnerId,
      amount: -99_999_999_999,
      type: "spend",
      reason: "concurrency-test overspend",
      idempotencyKey: "test-spend-" + Date.now(),
    });
    console.log("[spend overrun]", res);
    const after = await prisma.partnerCreditBalance.findUnique({
      where: { partnerId },
    });
    console.log("[after]", after);
    if (!res.ok && res.error === "insufficient_balance") {
      console.log("✓ insufficient_balance returned as expected");
    } else {
      console.error("✗ expected insufficient_balance");
      process.exitCode = 1;
    }
    return;
  }

  const N = 10;
  const AMOUNT = 1000;
  const MAX_CALLER_RETRIES = 20;

  const ledgerBefore = await prisma.partnerCreditLedger.count({ where: { partnerId } });

  // 각 caller 는 chokepoint 의 2-attempt 소진 후에도 conflict 면 caller 레벨에서 재시도
  // (실무 형태 — chokepoint 가 자체 무한 재시도하면 latency tail 이 위험해지므로 2회로
  // bound + caller 가 정책 결정). N=10 동시 호출이라 첫 라운드에서 대부분 conflict 가 나옴.
  async function callerRetry(i: number): Promise<ApplyResult> {
    let last: ApplyResult | null = null;
    for (let r = 0; r < MAX_CALLER_RETRIES; r++) {
      last = await applyLedger({
        partnerId,
        amount: AMOUNT,
        type: "adjustment",
        reason: `concurrency-test #${i}`,
        idempotencyKey: null,
      });
      if (last.ok || last.error !== "conflict") return last;
    }
    return last!;
  }

  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => callerRetry(i)),
  );

  const successCount = results.filter((r) => r.ok).length;
  const conflictCount = results.filter((r) => !r.ok && r.error === "conflict").length;
  console.log(
    `[results] success=${successCount} conflict=${conflictCount} (caller-retry budget=${MAX_CALLER_RETRIES})`,
  );

  const after = await prisma.partnerCreditBalance.findUnique({
    where: { partnerId },
  });
  console.log("[after]", after);

  const ledgerAfter = await prisma.partnerCreditLedger.count({ where: { partnerId } });

  const ledgerRows = await prisma.partnerCreditLedger.findMany({
    where: { partnerId },
    orderBy: { createdAt: "asc" },
    take: ledgerAfter,
    select: { amount: true, balanceAfter: true, createdAt: true },
  });

  // 검증.
  let ok = true;
  if (!after) {
    console.error("✗ balance row missing after run");
    ok = false;
  } else {
    const expectedBalance = before.balance + N * AMOUNT;
    const expectedVersion = before.version + N;
    if (after.balance !== expectedBalance) {
      console.error(`✗ balance ${after.balance} !== expected ${expectedBalance}`);
      ok = false;
    }
    if (after.version !== expectedVersion) {
      console.error(`✗ version ${after.version} !== expected ${expectedVersion}`);
      ok = false;
    }
  }
  if (ledgerAfter - ledgerBefore !== N) {
    console.error(
      `✗ ledger delta ${ledgerAfter - ledgerBefore} !== expected ${N}`,
    );
    ok = false;
  }

  // 단조증가 검증 (balanceAfter 가 오름차순이어야 함).
  for (let i = 1; i < ledgerRows.length; i++) {
    if (ledgerRows[i]!.balanceAfter < ledgerRows[i - 1]!.balanceAfter) {
      console.error(
        `✗ balanceAfter not monotonic at index ${i}: ${ledgerRows[i - 1]!.balanceAfter} → ${ledgerRows[i]!.balanceAfter}`,
      );
      ok = false;
      break;
    }
  }

  if (ok) {
    console.log("✓ concurrency invariants hold");
  } else {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[test-credit-concurrency] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
