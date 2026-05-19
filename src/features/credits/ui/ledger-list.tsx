import Link from "next/link";

import { cn } from "@/lib/utils";

import { getRecentLedger, listCreditLedger } from "../queries";
import {
  CREDIT_TYPE_LABELS,
  type CreditType,
  type LedgerEntry,
} from "../schema";

import { formatKrw } from "./credit-balance-card";

/**
 * 거래 내역 리스트 — compact 모드는 어드민 임베드, full 모드는 파트너 내역 페이지.
 *
 * full 모드는 `?cursor=` 기반 페이지네이션 — Server Component 가 cursor 받아 다음 페이지
 * 링크 렌더 (클라이언트 state 없음).
 */
export async function LedgerList({
  partnerId,
  mode,
  cursor,
  limit,
}: {
  partnerId: string;
  mode: "full" | "compact";
  cursor?: string | null;
  limit?: number;
}) {
  if (mode === "compact") {
    const entries = await getRecentLedger(partnerId, limit ?? 5);
    return <LedgerRows entries={entries} emptyLabel="아직 거래 내역이 없어요." />;
  }

  const page = await listCreditLedger(partnerId, {
    limit: limit ?? 20,
    cursor: cursor ?? null,
  });

  return (
    <div className="flex flex-col gap-4">
      <LedgerRows
        entries={page.entries}
        emptyLabel="아직 거래 내역이 없어요."
      />
      {page.nextCursor && (
        <Link
          href={{ pathname: "/partner/credits", query: { cursor: page.nextCursor } }}
          className="text-center text-sm text-[#4b4b4b] underline underline-offset-4 hover:text-black transition-colors py-3"
        >
          더 보기
        </Link>
      )}
    </div>
  );
}

function LedgerRows({
  entries,
  emptyLabel,
}: {
  entries: LedgerEntry[];
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[#4b4b4b] text-center py-8">{emptyLabel}</p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-[#efefef]">
      {entries.map((entry) => (
        <LedgerRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isPositive = entry.amount > 0;
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <TypeBadge type={entry.type} />
          <span className="text-xs text-[#4b4b4b]">
            {formatKoreanDateTime(entry.createdAt)}
          </span>
        </div>
        {entry.reason && (
          <p className="text-sm text-black truncate">{entry.reason}</p>
        )}
        {!entry.reason && entry.referenceType && (
          <p className="text-xs text-[#afafaf]">
            {entry.referenceType}
            {entry.referenceId ? ` · ${entry.referenceId}` : ""}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p
          className={cn(
            "text-sm font-bold tabular-nums",
            isPositive ? "text-black" : "text-red-600",
          )}
        >
          {isPositive ? "+" : ""}
          {formatKrw(entry.amount)}원
        </p>
        <p className="text-xs text-[#4b4b4b] tabular-nums">
          잔액 {formatKrw(entry.balanceAfter)}원
        </p>
      </div>
    </li>
  );
}

function TypeBadge({ type }: { type: CreditType }) {
  const tone: Record<CreditType, string> = {
    topup: "bg-black text-white",
    spend: "bg-[#efefef] text-black",
    adjustment: "bg-[#fafafa] text-[#4b4b4b] border border-[#e2e2e2]",
    refund: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold",
        tone[type],
      )}
    >
      {CREDIT_TYPE_LABELS[type]}
    </span>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatKoreanDateTime(d: Date): string {
  return DATE_FMT.format(d);
}
