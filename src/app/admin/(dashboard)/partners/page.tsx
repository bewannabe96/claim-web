import { cookies } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatKrw } from "@/features/credits/ui/credit-balance-card";
import {
  listAllPartners,
  listPartnerSignupInvitations,
} from "@/features/partners/queries";
import { cn } from "@/lib/utils";
import { nowMs } from "@/lib/wall-clock";

import { formatDate } from "../_lib/format";
import {
  Badge,
  Card,
  DataTable,
  Empty,
  PageHeader,
  Section,
  Td,
} from "../_components/page-shell";

const PARTNER_COLUMNS = [
  { key: "name", label: "설계사" },
  { key: "bio", label: "소개" },
  { key: "experience", label: "경력", align: "right" as const },
  { key: "exposure", label: "노출", align: "right" as const },
  { key: "selected", label: "제안서", align: "right" as const },
  { key: "contacted", label: "연락", align: "right" as const },
  { key: "credit", label: "크레딧", align: "right" as const },
  { key: "active", label: "상태", align: "center" as const },
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
    listPartnerSignupInvitations(),
  ]);
  const active = partners.filter((a) => a.active).length;
  const now = nowMs();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="설계사 풀"
        description={`등록 ${partners.length}명 · 활성 ${active}명 · 가입 대기 ${invitations.length}건`}
        action={
          <Button
            render={<Link href="/admin/partners/new" />}
            nativeButton={false}
            className="h-10 rounded-full px-5 text-sm"
          >
            신규 초청
          </Button>
        }
      />

      {invitations.length > 0 && (
        <Section title="가입 대기" description="발급된 초청 토큰 — 가입 완료 시 풀로 이동">
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
                    <span className="text-sm text-[#4b4b4b] tabular-nums">
                      {inv.phone}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-[#4b4b4b]">
                      {inv.licenseNumber}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        expired
                          ? "text-red-600 font-medium"
                          : "text-[#4b4b4b]",
                      )}
                    >
                      {expired ? "만료됨" : formatDate(inv.expiresAt)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="text-xs text-[#4b4b4b] tabular-nums">
                      {formatDate(inv.createdAt)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        </Section>
      )}

      <Section title="등록된 설계사">
        {partners.length === 0 ? (
          <Card>
            <Empty>등록된 설계사가 없어요</Empty>
          </Card>
        ) : (
          <DataTable columns={PARTNER_COLUMNS}>
            {partners.map((a) => (
              <tr
                key={a.id}
                className="hover:bg-[#fafafa] transition-colors"
              >
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
                      <span className="text-xs text-[#afafaf] truncate">
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
                  <span className="text-sm text-black tabular-nums">
                    {a.yearsOfExperience}년
                  </span>
                </Td>
                <Td align="right">
                  <span className="text-sm text-black tabular-nums">
                    {a.assignmentStats?.exposureCount ?? 0}
                  </span>
                </Td>
                <Td align="right">
                  <span className="text-sm text-black tabular-nums">
                    {a.assignmentStats?.selectedCount ?? 0}
                  </span>
                </Td>
                <Td align="right">
                  <span className="text-sm text-black tabular-nums">
                    {a.assignmentStats?.contactedCount ?? 0}
                  </span>
                </Td>
                <Td align="right">
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-sm text-black tabular-nums">
                      {formatKrw(a.creditBalance?.balance ?? 0)}원
                    </span>
                    {(a.creditBalance?.debt ?? 0) > 0 && (
                      <span className="text-[11px] font-medium text-red-600 tabular-nums">
                        부채 {formatKrw(a.creditBalance!.debt)}원
                      </span>
                    )}
                  </span>
                </Td>
                <Td align="center">
                  {a.active ? (
                    <Badge tone="solid">활성</Badge>
                  ) : (
                    <Badge tone="neutral">비활성</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </div>
  );
}
