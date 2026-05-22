import { notFound } from "next/navigation";

import { updatePartner } from "@/features/partners/actions";
import { getPartnerById } from "@/features/partners/queries";
import { listRefundableTopups } from "@/features/credits/queries";
import { AdjustmentForm } from "@/features/credits/ui/adjustment-form";
import { CreditBalanceCard } from "@/features/credits/ui/credit-balance-card";
import { LedgerList } from "@/features/credits/ui/ledger-list";
import { RefundForm } from "@/features/credits/ui/refund-form";
import { contentPublicUrl } from "@/server/content-storage";

import { PartnerForm } from "../../_components/partner-form";
import {
  BackLink,
  Card,
  CardHeader,
  Section,
  Stat,
} from "../../_components/page-shell";
import { AvatarUpload } from "./_components/avatar-upload";

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const partner = await getPartnerById(id);
  if (!partner) notFound();

  const refundableTopups = await listRefundableTopups(partner.id);
  const avatarUrl = partner.avatarKey ? contentPublicUrl(partner.avatarKey) : null;

  const action = updatePartner.bind(null, partner.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/partners">파트너 풀</BackLink>
        <header className="flex items-start gap-5">
          <AvatarUpload partnerId={partner.id} currentUrl={avatarUrl} />
          <div className="flex flex-col gap-1.5 min-w-0 mt-1">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight text-black">
              {partner.user.name}
            </h1>
            <p className="text-sm text-[#4b4b4b]">
              {partner.id} · {partner.user.phone ?? partner.user.email}
            </p>
          </div>
        </header>
      </div>

      <Card>
        <CardHeader title="운영 지표" />
        <dl className="grid grid-cols-3 gap-6">
          <Stat
            label="누적 노출"
            value={`${partner.assignmentStats?.exposureCount ?? 0}회`}
          />
          <Stat
            label="제안서 요청"
            value={`${partner.assignmentStats?.selectedCount ?? 0}회`}
          />
          <Stat
            label="연락 요청"
            value={`${partner.assignmentStats?.contactedCount ?? 0}회`}
          />
        </dl>
      </Card>

      <Section title="크레딧">
        <CreditBalanceCard partnerId={partner.id} />
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader title="수동 조정" />
            <AdjustmentForm partnerId={partner.id} />
          </Card>
          <Card>
            <CardHeader title="결제 환불" />
            <RefundForm
              partnerId={partner.id}
              refundableTopups={refundableTopups}
            />
          </Card>
        </div>
        <Card>
          <CardHeader title="최근 거래 내역" />
          <LedgerList partnerId={partner.id} mode="compact" />
        </Card>
      </Section>

      <Section title="파트너 정보">
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
      </Section>
    </div>
  );
}
