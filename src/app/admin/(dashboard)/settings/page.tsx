import { listPriceTiers } from "@/features/plan-request-pricing/queries";
import { getSettings } from "@/server/settings";

import { PageHeader } from "../_components/page-shell";
import { PricingForm } from "./_pricing-form";
import { ScenarioPriorityForm } from "./_scenario-priority-form";
import { SettingsForm } from "./_settings-form";

export default async function AdminSettingsPage() {
  const [settings, priceTiers] = await Promise.all([
    getSettings(),
    listPriceTiers(),
  ]);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="시스템 설정"
        description="매칭 후보 수, 선택 한도, 마감 시간 등 핵심 파라미터."
      />
      <SettingsForm initial={settings} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 border-b border-[#efefef] pb-3">
          <h2 className="text-lg font-bold tracking-tight text-black">
            요청서 가격 (budget 별)
          </h2>
          <p className="text-sm text-[#4b4b4b]">
            가입자가 Step1에서 선택한 budget 범위에 따라 요청서당 차감 가격이 결정돼요.
            가격은 요청서 생성 시점에 snapshot 되므로, 변경 후 발생한 신규 요청부터 적용됩니다.
          </p>
        </div>
        <PricingForm
          key={priceTiers.map((t) => t.id).join("|")}
          tiers={priceTiers}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 border-b border-[#efefef] pb-3">
          <h2 className="text-lg font-bold tracking-tight text-black">
            결과 페이지 시나리오 우선순위
          </h2>
          <p className="text-sm text-[#4b4b4b]">
            가입자 결과 페이지의 top3 시나리오와 모달 상단 노출 순서를 관리합니다.
            등재 안 된 카테고리는 모달 &ldquo;기타&rdquo; 영역에 가나다순으로 노출돼요.
          </p>
        </div>
        <ScenarioPriorityForm initial={settings.scenarioPriority} />
      </section>
    </div>
  );
}
