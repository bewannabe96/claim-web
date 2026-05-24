import { listPriceTiers } from "@/features/plan-request-pricing/queries";

import { BackLink, PageHeader } from "../../_components/page-shell";

import { AdminNewRequestForm } from "./_components/admin-new-request-form";

/**
 * 어드민 — 가입자 대신 요청서 작성.
 *
 * 본인인증(OTP) 생략 + 후보 자동 배정 + 즉시 dispatched 까지 한 폼에서 완료.
 * 자세한 정책 / 트랜잭션 흐름은 [features/plan-requests/actions.ts]
 * `createPlanRequestByAdmin` JSDoc 참조.
 */
export default async function AdminNewRequestPage() {
  // step1-wizard 와 동일하게 가격 tier 를 서버에서 읽어 client form 에 prop 으로 내림.
  // admin 이 tier 자체를 비웠을 가능성도 있으므로 form 안에서 빈 배열 케이스 처리.
  const priceTiers = await listPriceTiers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href="/admin/requests">요청 모니터링</BackLink>
        <PageHeader
          title="가입자 대신 요청서 작성"
          description="관리자가 가입자에게 정보를 받아 직접 입력해 즉시 송부해요. 본인인증(OTP)은 생략돼요."
        />
      </div>
      <AdminNewRequestForm priceTiers={priceTiers} />
    </div>
  );
}
