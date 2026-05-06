import { getSettings } from "@/server/settings";

import { PageHeader } from "../_components/page-shell";
import { SettingsForm } from "./_settings-form";

export default function AdminSettingsPage() {
  const settings = getSettings();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="시스템 설정"
        description="매칭 후보 수, 선택 한도, 마감 시간 등 핵심 파라미터."
      />
      <SettingsForm initial={settings} />
    </div>
  );
}
