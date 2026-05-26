import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";

import type { PlanProposalData } from "./chart-types";

/**
 * 결과 페이지 marketing chrome — BrandMark + "제안서 N건이 도착했어요" 헤더 +
 * 분석 진행 배지. 본문 (ResultView) 은 호출자가 children 으로 주입.
 *
 * 라우트 공유 (의존성 방향: 호출자 → shell):
 *   - 가입자: `/plan-request/result/[token]` — 가입자 진입 단일 chrome.
 *   - 어드민 preview: `/admin/requests/[id]/result` — admin bar 아래 480px 프레임
 *     안에서 동일 chrome 을 재렌더해 "가입자가 보는 그대로" 를 미러링.
 *
 * 본 컴포넌트는 `<main>` / 컨테이너 width 를 직접 잡지 않음 — 가입자 페이지는
 * marketing layout (480px container) 안에, 어드민 preview 는 자체 480px 프레임
 * 안에 children 으로 박힘.
 */
export function ResultPageShell({
  proposals,
  selectedPartnerCount,
  children,
}: {
  proposals: PlanProposalData[];
  /** plan_request.selectedPartnerIds.length — 미회수 설계사 수 안내문 분기에 사용. */
  selectedPartnerCount: number;
  children: ReactNode;
}) {
  // 분석 진행 카운트는 정상 완료 + skip 처리 두 케이스를 합산 — closePlanRequest 의
  // 조기 마감 조건 (`analyzedAt OR analysisSkippedAt`) 과 동일 의미.
  const analyzedCount = proposals.filter(
    (p) => p.analyzed || p.analysisSkipped,
  ).length;
  const allAnalyzed = analyzedCount === proposals.length;

  return (
    <>
      <div className="px-6 pt-10">
        <BrandMark />
        <header className="mt-6 flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
            제안서{" "}
            <span className="text-black">{proposals.length}건</span>
            이 도착했어요
          </h1>
          {selectedPartnerCount > proposals.length && (
            <p className="text-sm text-[#4b4b4b]">
              선택하신 {selectedPartnerCount}명 중{" "}
              <span className="font-semibold text-black">
                {proposals.length}명
              </span>
              이 제안서를 보내주셨어요
            </p>
          )}
          <AnalysisStatusBadge
            analyzed={analyzedCount}
            total={proposals.length}
            allDone={allAnalyzed}
          />
        </header>
      </div>

      {children}
    </>
  );
}

/**
 * 분석 진행 상태 배지 — 헤더 아래 작은 inline.
 *   - 모두 완료: 검정 dot + "결과 준비됨"
 *   - 진행 중:   pulse dot + "분석 진행 중 X/N 완료" + "새로고침 안내"
 */
function AnalysisStatusBadge({
  analyzed,
  total,
  allDone,
}: {
  analyzed: number;
  total: number;
  allDone: boolean;
}) {
  if (allDone) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-[#4b4b4b]">
        <span className="w-1.5 h-1.5 rounded-full bg-black" aria-hidden />
        결과 준비됨
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-[#4b4b4b]">
      <span
        className="w-1.5 h-1.5 rounded-full bg-[#4b4b4b] animate-pulse"
        aria-hidden
      />
      분석 진행 중 · {analyzed}/{total} 완료 (새로고침 시 갱신)
    </div>
  );
}
