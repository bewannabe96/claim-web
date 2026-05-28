import Link from "next/link";
import type { Route } from "next";

import { BrandMark } from "@/components/brand-mark";
import { StickyBottomBar } from "@/components/sticky-bottom-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Href = Route | URL;

/**
 * 종료/안내 화면 공통 셸 — dispatched, done, 404, error, 결과 placeholder 등.
 *
 * DESIGN.md — 모노크롬 기반. 거대한 이모지 대신 원 안 아이콘으로 통일.
 * `tone="positive"` 는 상태 아이콘 검정 배경, `tone="neutral"` 은 chip-gray.
 *
 * `showBrand` 기본 true. 부모 layout 이 이미 brand 를 그리는 영역(예: partner)
 * 에서는 false 로 넘겨 중복을 피한다.
 */
export function StatusScreen({
  icon,
  title,
  description,
  tone = "positive",
  primary,
  secondary,
  showBrand = true,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: "positive" | "neutral";
  primary?: { label: string; href: Href };
  secondary?: { label: string; href: Href };
  showBrand?: boolean;
}) {
  return (
    <main className="flex flex-col flex-1 px-6 pt-10 bg-white">
      {showBrand && <BrandMark />}

      <div
        className={cn(
          "flex flex-col items-center text-center gap-5",
          showBrand ? "mt-20" : "mt-16",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center w-16 h-16 rounded-full",
            tone === "positive"
              ? "bg-black text-white"
              : "bg-[#efefef] text-black",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[#4b4b4b] leading-relaxed max-w-xs">
            {description}
          </p>
        )}
      </div>

      {(primary || secondary) && (
        <StickyBottomBar>
          <div className="flex flex-col gap-2.5">
            {primary && (
              <Button
                render={<Link href={primary.href} />}
                nativeButton={false}
                className="w-full h-14 rounded-full text-base font-medium"
              >
                {primary.label}
              </Button>
            )}
            {secondary && (
              <Button
                variant="secondary"
                render={<Link href={secondary.href} />}
                nativeButton={false}
                className="w-full h-14 rounded-full text-base font-medium"
              >
                {secondary.label}
              </Button>
            )}
          </div>
        </StickyBottomBar>
      )}
    </main>
  );
}

/* ============================================================
 * 공용 아이콘 — 한 곳에서 관리
 * ============================================================ */

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("w-7 h-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l5 5 9-11" />
    </svg>
  );
}

export function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("w-7 h-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("w-7 h-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function SearchOffIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("w-7 h-7", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M8.5 11h5" />
    </svg>
  );
}
