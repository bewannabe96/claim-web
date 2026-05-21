import { createPartnerSignupInvitation } from "@/features/partners/actions";

import { PartnerForm } from "../../_components/partner-form";
import { BackLink, PageHeader } from "../../_components/page-shell";

export default function AdminPartnerNewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href="/admin/partners">설계사 풀</BackLink>
        <PageHeader
          title="신규 설계사 초청"
          description="일회용 가입 링크가 발급됩니다."
        />
      </div>
      <PartnerForm
        action={createPartnerSignupInvitation}
        submitLabel="초청 발급"
        pendingLabel="발급 중..."
        enableAdminSelfLink
      />
    </div>
  );
}
