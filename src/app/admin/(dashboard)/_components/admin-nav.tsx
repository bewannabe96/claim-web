"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "대시보드", exact: true },
  { href: "/admin/requests", label: "요청 모니터링", exact: false },
  { href: "/admin/analysis-failures", label: "분석 실패", exact: false },
  { href: "/admin/partners", label: "설계사 풀", exact: false },
  { href: "/admin/settings", label: "시스템 설정", exact: false },
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

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#efefef] bg-white">
      <ul className="mx-auto max-w-[1280px] px-8 flex items-center gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "inline-flex items-center h-12 px-4 text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-black text-black"
                    : "border-transparent text-[#4b4b4b] hover:text-black",
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
