"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "대시보드", exact: true },
  { href: "/admin/requests", label: "요청", exact: false },
  { href: "/admin/analysis-failures", label: "분석 실패", exact: false },
  { href: "/admin/partners", label: "파트너", exact: false },
  { href: "/admin/settings", label: "설정", exact: false },
] as const satisfies ReadonlyArray<{
  href:
    | "/admin"
    | "/admin/requests"
    | "/admin/analysis-failures"
    | "/admin/partners"
    | "/admin/settings";
  label: string;
  exact: boolean;
}>;

/**
 * 어드민 상단 네비 — 헤더 inline. pill 형 탭으로 active 시 검정 배경.
 * DESIGN.md 의 chip-style category nav 를 따른다.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 min-w-0">
      <ul className="flex items-center gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "inline-flex items-center h-8 px-3 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap",
                  active
                    ? "bg-black text-white"
                    : "text-[#4b4b4b] hover:bg-[#efefef] hover:text-black",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
