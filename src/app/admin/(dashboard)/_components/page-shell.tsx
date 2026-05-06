import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/* ============================================================
 * 페이지 헤더 — 어드민 모든 화면에서 동일한 톤.
 * ============================================================ */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-[#efefef] pb-6">
      <div className="flex flex-col gap-1.5 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-black">{title}</h1>
        {description && (
          <p className="text-sm text-[#4b4b4b]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ============================================================
 * BackLink — 상세 페이지 상단에서 목록으로 복귀
 * ============================================================ */

export function BackLink({
  href,
  children,
}: {
  href: Route;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-[#4b4b4b] hover:text-black transition-colors mb-4"
    >
      <svg
        viewBox="0 0 16 16"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 12L6 8L10 4" />
      </svg>
      {children}
    </Link>
  );
}

/* ============================================================
 * 카드 — 어드민 콘텐츠 블록
 * ============================================================ */

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#efefef] bg-white p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  meta,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-4">
      <h2 className="text-base font-bold text-black tracking-tight">{title}</h2>
      {meta && <span className="text-xs text-[#4b4b4b]">{meta}</span>}
    </div>
  );
}

/* ============================================================
 * KPI — 대시보드 위젯
 * ============================================================ */

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "alert";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-6 flex flex-col gap-2",
        tone === "alert"
          ? "border-black bg-black text-white"
          : "border-[#efefef] bg-white",
      )}
    >
      <p
        className={cn(
          "text-xs font-medium tracking-wide",
          tone === "alert" ? "text-[#afafaf]" : "text-[#4b4b4b]",
        )}
      >
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {hint && (
        <p
          className={cn(
            "text-xs",
            tone === "alert" ? "text-[#afafaf]" : "text-[#4b4b4b]",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/* ============================================================
 * 정형 테이블 — 어드민 목록
 * ============================================================ */

export function DataTable({
  columns,
  children,
}: {
  columns: { key: string; label: string; align?: "left" | "right" | "center" }[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#efefef]">
      <table className="w-full text-sm">
        <thead className="bg-[#fafafa]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-xs font-medium text-[#4b4b4b]",
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left",
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efefef] bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 text-sm",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}
