import "server-only";

import { prisma } from "@/server/db/prisma";

import type { CreditType, LedgerEntry } from "./schema";

/**
 * 크레딧 read 쿼리.
 *
 * 캐싱: 'use cache' 안 씀 — 모든 호출이 require*Session() (쿠키 reading) 트리 하위라
 * 자동 dynamic. revalidatePath 만으로 신선도 관리.
 */

/**
 * 잔액 조회. row 없으면 lazy upsert — 가입 트랜잭션에서 eager-create 도입 전 partner
 * 들에 대한 cold-path 방어. debt 는 spend 시 잔액 부족분이 누적되는 부채 카운터.
 */
export async function getCreditBalance(
  partnerId: string,
): Promise<{ balance: number; debt: number; version: number }> {
  const found = await prisma.partnerCreditBalance.findUnique({
    where: { partnerId },
    select: { balance: true, debt: true, version: true },
  });
  if (found) return found;

  const created = await prisma.partnerCreditBalance.upsert({
    where: { partnerId },
    update: {},
    create: { partnerId },
    select: { balance: true, debt: true, version: true },
  });
  return created;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type LedgerPage = {
  entries: LedgerEntry[];
  nextCursor: string | null;
};

/**
 * 페이지네이션 ledger 조회. createdAt + id 복합 커서로 동일 timestamp 동률을 안전 처리.
 */
export async function listCreditLedger(
  partnerId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<LedgerPage> {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const cursor = decodeCursor(opts.cursor ?? null);

  const where = cursor
    ? {
        partnerId,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { lt: cursor.id },
          },
        ],
      }
    : { partnerId };

  const rows = await prisma.partnerCreditLedger.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      amount: true,
      balanceAfter: true,
      debtAfter: true,
      type: true,
      reason: true,
      referenceType: true,
      referenceId: true,
      createdAt: true,
    },
  });

  const entries: LedgerEntry[] = rows.map((r) => ({
    ...r,
    // DB column 은 string — zod 검증은 ledger 작성 시점에 완료된 값이라 cast 만.
    type: r.type as CreditType,
  }));

  const nextCursor =
    entries.length === limit && entries.length > 0
      ? encodeCursor(entries[entries.length - 1]!)
      : null;

  return { entries, nextCursor };
}

/** 환불 폼 드롭다운용. 누적 환불 금액 만큼 차감 후 잔여 환불 가능액이 양수인 충전만. */
export type RefundableTopup = {
  paymentId: string;
  originalAmount: number;
  refundedAmount: number;
  refundableAmount: number;
  topupAt: Date;
};

export async function listRefundableTopups(
  partnerId: string,
): Promise<RefundableTopup[]> {
  const topups = await prisma.partnerCreditLedger.findMany({
    where: {
      partnerId,
      type: "topup",
      referenceType: "payment",
      referenceId: { not: null },
    },
    select: { amount: true, referenceId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (topups.length === 0) return [];

  const refundAgg = await prisma.partnerCreditLedger.groupBy({
    by: ["referenceId"],
    where: {
      partnerId,
      type: "refund",
      referenceType: "payment",
      referenceId: { in: topups.map((t) => t.referenceId!) },
    },
    _sum: { amount: true },
  });
  // refund row 의 amount 는 음수 → 부호 뒤집어 누적 환불액으로 변환.
  const refundedByPaymentId = new Map(
    refundAgg.map((r) => [r.referenceId!, -(r._sum.amount ?? 0)]),
  );

  return topups
    .map((t) => {
      const refunded = refundedByPaymentId.get(t.referenceId!) ?? 0;
      return {
        paymentId: t.referenceId!,
        originalAmount: t.amount,
        refundedAmount: refunded,
        refundableAmount: t.amount - refunded,
        topupAt: t.createdAt,
      };
    })
    .filter((t) => t.refundableAmount > 0);
}

/** 임베드용 — 최근 N건만. compact 뷰. */
export async function getRecentLedger(
  partnerId: string,
  limit = 5,
): Promise<LedgerEntry[]> {
  const rows = await prisma.partnerCreditLedger.findMany({
    where: { partnerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      amount: true,
      balanceAfter: true,
      debtAfter: true,
      type: true,
      reason: true,
      referenceType: true,
      referenceId: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, type: r.type as CreditType }));
}

// ---------- 커서 헬퍼 ----------

function encodeCursor(entry: Pick<LedgerEntry, "createdAt" | "id">): string {
  return Buffer.from(`${entry.createdAt.toISOString()}|${entry.id}`).toString(
    "base64url",
  );
}

function decodeCursor(
  raw: string | null,
): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const sep = decoded.indexOf("|");
    if (sep < 0) return null;
    const at = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(at.getTime()) || !id) return null;
    return { createdAt: at, id };
  } catch {
    return null;
  }
}
