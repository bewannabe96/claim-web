import { createPartnerInvitation } from "@/features/partners/actions";

import { PartnerForm } from "../../_components/partner-form";
import { BackLink, PageHeader } from "../../_components/page-shell";

export default function AdminPartnerNewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/partners">설계사 풀</BackLink>
        <PageHeader
          title="신규 설계사 초청 발급"
          description="입력한 정보로 일회용 가입 링크가 발급됩니다. 가입은 설계사가 직접 카카오톡으로 진행해요."
        />
      </div>
      <PartnerForm
        action={createPartnerInvitation}
        submitLabel="초청 발급"
        pendingLabel="발급 중..."
      />
    </div>
  );
}
