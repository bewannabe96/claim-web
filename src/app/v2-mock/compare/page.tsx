import type { Metadata } from "next";

import { ComparePageBody } from "./_components/compare-page-body";
import { EmptyWorkbench } from "./_components/empty-workbench";
import { WorkbenchHeader } from "./_components/workbench-header";

export const metadata: Metadata = {
  title: "v2 Mock · CLAIM Studio",
  description:
    "v2 PRD 의 CLAIM Studio mock — origin 혼합 + 임시/정식 분석 시각화.",
};

/**
 * /v2-mock/compare — v2 workbench 진입.
 *
 * `?state=empty`  → 빈 상태 (Phase 1.5)
 * (없음)          → 슬롯 3개 채워진 상태 (Phase 1)
 *
 * `?gate=...` 는 Phase 3 의 회원가입 modal trigger — 슬롯 채워진 상태 위에 modal
 * 띄움. ComparePageBody 가 client 라 그쪽이 흡수.
 *
 * v1 의 ResultPageShell (push-알림 결과 톤) 대신 v2 전용 WorkbenchHeader 사용 —
 * 능동적 도구 워크벤치 톤.
 */
export default async function V2MockComparePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; gate?: string; new?: string }>;
}) {
  const { state, gate, new: newFlag } = await searchParams;

  if (state === "empty") {
    return <EmptyWorkbench />;
  }

  return (
    <main className="flex flex-col flex-1 bg-white">
      <WorkbenchHeader />
      <ComparePageBody
        initialGate={gate ?? null}
        // `?new=pending` → /v2-mock/upload 에서 방금 업로드 + analyzing 끝남 →
        // workspace 로 자동 복귀. ComparePageBody 가 분석 중 슬롯 1개 prepend.
        hasPendingSlot={newFlag === "pending"}
      />
    </main>
  );
}
