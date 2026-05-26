import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/**
 * 어드민 공용 시각 primitives. 모든 어드민 페이지는 여기에 정의된 컴포넌트만 사용해
 * 톤이 한 곳에서 관리되도록 한다.
 *
 * 디자인 톤 (DESIGN.md 기반):
 *   - 카드: `rounded-xl border border-[#efefef] bg-white`, 내부 padding 24px
 *   - 텍스트: 본문 sm 검정, 보조 xs `#4b4b4b`, tertiary `#afafaf`
 *   - badge / pill: rounded-full, text-[11px], font-medium, px-2 py-0.5
 *   - 페이지 헤더 / 섹션 헤더는 border-b 같은 가로선을 *추가하지 않는다*.
 *     공간만으로 분리 — 카드 자체 boundary 가 충분히 시각 단위 역할.
 */

/* ============================================================
 * 페이지 헤더
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
    <header className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1.5 min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-black">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[#4b4b4b]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* ============================================================
 * BackLink
 * ============================================================ */

export function BackLink<T extends string>({
  href,
  children,
}: {
  /** typedRoutes 검증. dynamic route 의 template literal (예: `/admin/requests/${id}`)
   *  은 `Route<\`/admin/requests/${string}\`>` 로 좁혀지므로 제네릭으로 받는다. */
  href: Route<T>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-[#4b4b4b] hover:text-black transition-colors mb-3"
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
 * Section — 상위 그룹 (페이지 안 여러 카드를 묶을 때)
 * ============================================================ */

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            {title && (
              <h2 className="text-lg font-bold tracking-tight text-black">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-[#4b4b4b] leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ============================================================
 * Card — 콘텐츠 블록
 * ============================================================ */

export function Card({
  children,
  className,
  padding = "default",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "default" | "compact" | "none";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#efefef] bg-white",
        padding === "default" && "p-6",
        padding === "compact" && "p-4",
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
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 mb-5",
        className,
      )}
    >
      <h3 className="text-sm font-bold text-black tracking-tight">{title}</h3>
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
    <div className="rounded-xl border border-[#efefef] bg-white p-5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {tone === "alert" && (
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-red-500"
          />
        )}
        <p className="text-xs font-medium text-[#4b4b4b]">{label}</p>
      </div>
      <p
        className={cn(
          "text-[28px] leading-none font-bold tracking-tight tabular-nums",
          tone === "alert" ? "text-red-600" : "text-black",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-[#afafaf]">{hint}</p>}
    </div>
  );
}

/* ============================================================
 * Stat — 카드 내부 지표 (Kpi 보다 작은 단위)
 * ============================================================ */

export function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-[#4b4b4b]">{label}</dt>
      <dd className="text-xl font-bold tracking-tight text-black tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/* ============================================================
 * Empty — 빈 상태
 * ============================================================ */

export function Empty({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "py-8 text-center text-sm text-[#afafaf]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/* ============================================================
 * 정형 테이블
 * ============================================================ */

export function DataTable({
  columns,
  children,
}: {
  columns: { key: string; label: string; align?: "left" | "right" | "center" }[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#efefef] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#efefef]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#afafaf]",
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
        <tbody className="divide-y divide-[#efefef]">{children}</tbody>
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

/* ============================================================
 * Badge — 작은 상태 라벨
 * ============================================================ */

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "solid" | "outline" | "muted" | "alert";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-[#efefef] text-[#4b4b4b]",
        tone === "solid" && "bg-black text-white",
        tone === "outline" && "border border-[#e2e2e2] bg-white text-[#4b4b4b]",
        tone === "muted" && "bg-[#fafafa] text-[#afafaf] border border-[#efefef]",
        tone === "alert" && "bg-red-50 text-red-700 border border-red-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ============================================================
 * Field — definition list 형 라벨/값
 * ============================================================ */

export function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "col-span-2")}>
      <dt className="text-xs text-[#afafaf]">{label}</dt>
      <dd className="text-sm text-black">{children}</dd>
    </div>
  );
}

/* ============================================================
 * Banner — 폼 상단/하단 결과 메시지
 * ============================================================ */

export function Banner({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-lg px-3 py-2 text-sm",
        tone === "success" && "bg-[#fafafa] text-black border border-[#efefef]",
        tone === "error" && "bg-red-50 text-red-700 border border-red-100",
      )}
    >
      {children}
    </p>
  );
}
