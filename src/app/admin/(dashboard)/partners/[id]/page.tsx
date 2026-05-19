import { notFound } from "next/navigation";

import { updatePartner } from "@/features/partners/actions";
import { getPartnerById } from "@/features/partners/queries";
import { listRefundableTopups } from "@/features/credits/queries";
import { AdjustmentForm } from "@/features/credits/ui/adjustment-form";
import { CreditBalanceCard } from "@/features/credits/ui/credit-balance-card";
import { LedgerList } from "@/features/credits/ui/ledger-list";
import { RefundForm } from "@/features/credits/ui/refund-form";
import { cn } from "@/lib/utils";

import { PartnerForm } from "../../_components/partner-form";
import {
  BackLink,
  Card,
  CardHeader,
  PageHeader,
} from "../../_components/page-shell";

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const partner = await getPartnerById(id);
  if (!partner) notFound();

  const refundableTopups = await listRefundableTopups(partner.id);

  const action = updatePartner.bind(null, partner.id);

  const missRate = partner.recentSubmissions.length
    ? partner.recentSubmissions.filter((s) => !s).length /
      partner.recentSubmissions.length
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/partners">설계사 풀</BackLink>
        <PageHeader
          title={partner.user.name}
          description={`${partner.id} · ${partner.user.phone ?? partner.user.email}`}
        />
      </div>

      {/* 운영 통계 */}
      <Card>
        <CardHeader title="운영 지표" />
        <dl className="grid grid-cols-3 gap-6">
          <Stat label="누적 노출" value={`${partner.exposureCount}회`} />
          <Stat
            label="최근 제출 이력"
            value={
              partner.recentSubmissions.length === 0
                ? "—"
                : `${partner.recentSubmissions.filter((s) => s).length}/${partner.recentSubmissions.length}`
            }
          />
          <Stat
            label="미제출률"
            value={
              partner.recentSubmissions.length === 0
                ? "—"
                : `${Math.round(missRate * 100)}%`
            }
            tone={missRate > 0.3 ? "alert" : "default"}
          />
        </dl>

        {partner.recentSubmissions.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-[#4b4b4b] mb-2">최근 제출 시퀀스</p>
            <div className="flex gap-1">
              {partner.recentSubmissions.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-5 h-5 rounded-md text-[10px] flex items-center justify-center font-bold",
                    s ? "bg-black text-white" : "bg-[#efefef] text-[#afafaf]",
                  )}
                  title={s ? "제출" : "미제출"}
                >
                  {s ? "○" : "×"}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 크레딧 */}
      <Card>
        <CardHeader title="크레딧" />
        <CreditBalanceCard partnerId={partner.id} />
      </Card>

      <Card>
        <CardHeader title="크레딧 수동 조정" />
        <AdjustmentForm partnerId={partner.id} />
      </Card>

      <Card>
        <CardHeader title="결제 환불 처리" />
        <RefundForm
          partnerId={partner.id}
          refundableTopups={refundableTopups}
        />
      </Card>

      <Card>
        <CardHeader title="최근 거래 내역" />
        <LedgerList partnerId={partner.id} mode="compact" />
      </Card>

      {/* 편집 폼 */}
      <PartnerForm
        action={action}
        submitLabel="변경 저장"
        initial={{
          name: partner.user.name,
          phone: partner.user.phone ?? "",
          bio: partner.bio,
          yearsOfExperience: partner.yearsOfExperience,
          trustMetric: partner.trustMetric,
          licenseNumber: partner.licenseNumber,
          active: partner.active,
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-[#4b4b4b]">{label}</dt>
      <dd
        className={cn(
          "text-2xl font-bold tracking-tight",
          tone === "alert" ? "text-black" : "text-black",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
