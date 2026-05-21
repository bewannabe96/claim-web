import { listPriceTiers } from "@/features/plan-request-pricing/queries";
import { getSettings } from "@/server/settings";

import { PageHeader, Section } from "../_components/page-shell";
import { PricingForm } from "./_pricing-form";
import { ScenarioPriorityForm } from "./_scenario-priority-form";
import { SettingsForm } from "./_settings-form";

export default async function AdminSettingsPage() {
  const [settings, priceTiers] = await Promise.all([
    getSettings(),
    listPriceTiers(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="시스템 설정"
        description="매칭 후보 수, 선택 한도, 마감 시간 등 핵심 파라미터"
      />

      <Section title="매칭 파라미터">
        <SettingsForm initial={settings} />
      </Section>

      <Section
        title="요청서 가격"
        description="가입자가 Step1에서 선택한 budget 범위에 따라 차감 가격이 결정. 변경 후 신규 요청부터 적용."
      >
        <PricingForm
          key={priceTiers.map((t) => t.id).join("|")}
          tiers={priceTiers}
        />
      </Section>

      <Section
        title="결과 페이지 시나리오 우선순위"
        description={
          <>
            결과 페이지 top3 와 모달 상단 노출 순서. 등재 안 된 카테고리는 모달
            &ldquo;기타&rdquo; 영역에 가나다순으로 노출.
          </>
        }
      >
        <ScenarioPriorityForm initial={settings.scenarioPriority} />
      </Section>
    </div>
  );
}
