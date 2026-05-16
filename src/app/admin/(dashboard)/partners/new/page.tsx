import { PartnerForm } from "../../_components/partner-form";
import { BackLink, PageHeader } from "../../_components/page-shell";

export default function AdminPartnerNewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackLink href="/admin/partners">설계사 풀</BackLink>
        <PageHeader
          title="신규 설계사 등록"
          description="검증을 마친 설계사 정보를 입력하세요."
        />
      </div>
      <PartnerForm />
    </div>
  );
}
