import { getSettings } from "@/server/settings";

import { PageHeader } from "../_components/page-shell";
import { ScenarioPriorityForm } from "./_scenario-priority-form";
import { SettingsForm } from "./_settings-form";

export default async function AdminSettingsPage() {
  const settings = await getSettings();

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
