import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { listAllAgents } from "@/features/agents/queries";
import { cn } from "@/lib/utils";
import { INSURANCE_CATEGORY_LABEL } from "@/types";

import {
  DataTable,
  PageHeader,
  Td,
} from "../_components/page-shell";

const COLUMNS = [
  { key: "name", label: "설계사" },
  { key: "specialties", label: "전문 보험" },
  { key: "experience", label: "경력", align: "right" as const },
  { key: "exposure", label: "누적 노출", align: "right" as const },
  { key: "missRate", label: "미제출률", align: "right" as const },
  { key: "active", label: "활성", align: "center" as const },
];

export default async function AdminAgentsPage() {
  const agents = await listAllAgents();
  const active = agents.filter((a) => a.active).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="설계사 풀"
        description={`전체 ${agents.length}명 · 활성 ${active}명`}
        action={
          <Link
            href="/admin/agents/new"
            className={cn(buttonVariants(), "h-10 rounded-full px-5 text-sm")}
          >
            신규 설계사 등록
          </Link>
        }
      />

      <DataTable columns={COLUMNS}>
        {agents.map((a) => {
          const miss = missRate(a.recentSubmissions);
          return (
            <tr key={a.id} className="hover:bg-[#fafafa] transition-colors">
              <Td>
                <Link
                  href={`/admin/agents/${a.id}`}
                  className="flex items-center gap-3 group"
                >
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-black text-white text-sm font-bold shrink-0">
                    {a.name.charAt(0)}
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-black group-hover:underline truncate">
                      {a.name}
                    </span>
                    <span className="text-xs text-[#4b4b4b] truncate">
                      {a.email}
                    </span>
                  </span>
                </Link>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {a.specialties.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#efefef] text-black"
                    >
                      {INSURANCE_CATEGORY_LABEL[s]}
                    </span>
                  ))}
                </div>
              </Td>
              <Td align="right">
                <span className="text-sm text-black">
                  {a.yearsOfExperience}년
                </span>
              </Td>
              <Td align="right">
                <span className="text-sm text-black">{a.exposureCount}회</span>
              </Td>
              <Td align="right">
                {a.recentSubmissions.length === 0 ? (
                  <span className="text-xs text-[#afafaf]">—</span>
                ) : (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      miss > 0.3 ? "text-black" : "text-[#4b4b4b]",
                    )}
                  >
                    {Math.round(miss * 100)}%
                  </span>
                )}
              </Td>
              <Td align="center">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
                    a.active
                      ? "bg-black text-white"
                      : "bg-[#efefef] text-[#4b4b4b]",
                  )}
                >
                  {a.active ? "활성" : "비활성"}
                </span>
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}

function missRate(recent: boolean[]): number {
  if (recent.length === 0) return 0;
  return recent.filter((s) => !s).length / recent.length;
}
