import { cookies } from "next/headers";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  listAllPartners,
  listPartnerInvitations,
} from "@/features/partners/queries";
import { cn } from "@/lib/utils";
import { nowMs } from "@/lib/wall-clock";

import {
  Card,
  CardHeader,
  DataTable,
  PageHeader,
  Td,
} from "../_components/page-shell";

const PARTNER_COLUMNS = [
  { key: "name", label: "설계사" },
  { key: "bio", label: "소개" },
  { key: "experience", label: "경력", align: "right" as const },
  { key: "exposure", label: "누적 노출", align: "right" as const },
  { key: "missRate", label: "미제출률", align: "right" as const },
  { key: "active", label: "활성", align: "center" as const },
];

const INVITATION_COLUMNS = [
  { key: "name", label: "이름" },
  { key: "phone", label: "휴대폰" },
  { key: "license", label: "자격번호" },
  { key: "expiresAt", label: "만료", align: "right" as const },
  { key: "createdAt", label: "발급일", align: "right" as const },
];

export default async function AdminPartnersPage() {
  // dynamic 인디케이터 — nowMs() 가 prerender 단계에서 실행되지 않도록.
  await cookies();

  const [partners, invitations] = await Promise.all([
    listAllPartners(),
    listPartnerInvitations(),
  ]);
  const active = partners.filter((a) => a.active).length;
  const now = nowMs();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="설계사 풀"
        description={`등록 ${partners.length}명 · 활성 ${active}명 · 가입 대기 ${invitations.length}건`}
        action={
          <Link
            href="/admin/partners/new"
            className={cn(buttonVariants(), "h-10 rounded-full px-5 text-sm")}
          >
            신규 설계사 초청
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="가입 대기 (초청 발급됨)"
          meta={
            invitations.length === 0 ? "없음" : `${invitations.length}건`
          }
        />
        {invitations.length === 0 ? (
          <p className="py-6 text-sm text-[#afafaf] text-center">
            발급된 가입 초청이 없어요.
          </p>
        ) : (
          <DataTable columns={INVITATION_COLUMNS}>
            {invitations.map((inv) => {
              const expired = inv.expiresAt.getTime() < now;
              return (
                <tr
                  key={inv.id}
                  className="hover:bg-[#fafafa] transition-colors"
                >
                  <Td>
                    <Link
                      href={`/admin/partners/invitations/${inv.id}`}
                      className="text-sm font-medium text-black hover:underline"
                    >
                      {inv.name}
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-sm text-[#4b4b4b]">{inv.phone}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-[#4b4b4b]">
                      {inv.licenseNumber}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className={cn(
                        "text-xs",
                        expired ? "text-red-600 font-medium" : "text-[#4b4b4b]",
                      )}
                    >
                      {expired ? "만료됨" : formatDate(inv.expiresAt)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="text-xs text-[#4b4b4b]">
                      {formatDate(inv.createdAt)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <DataTable columns={PARTNER_COLUMNS}>
        {partners.map((a) => {
          const miss = missRate(a.recentSubmissions);
          return (
            <tr key={a.id} className="hover:bg-[#fafafa] transition-colors">
              <Td>
                <Link
                  href={`/admin/partners/${a.id}`}
                  className="flex items-center gap-3 group"
                >
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-black text-white text-sm font-bold shrink-0">
                    {a.user.name.charAt(0)}
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-black group-hover:underline truncate">
                      {a.user.name}
                    </span>
                    <span className="text-xs text-[#4b4b4b] truncate">
                      {a.user.phone ?? a.user.email}
                    </span>
                  </span>
                </Link>
              </Td>
              <Td>
                <span className="text-xs text-[#4b4b4b] line-clamp-1 max-w-[280px] block">
                  {a.bio}
                </span>
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

function formatDate(d: Date): string {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}
