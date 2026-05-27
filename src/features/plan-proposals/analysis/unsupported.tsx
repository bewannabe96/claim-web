import { SUPPORTED_ANALYSIS_VERSIONS } from "./registry";

/**
 * registry 에 등록 안 된 schemaVersion 의 분석 리포트 본문 자리에 들어가는 placeholder.
 *
 * 발생 시나리오:
 *   - 외부 분석 파이프라인이 우리보다 먼저 새 버전 (예: v7) 콜백을 보냄
 *   - parseReport / adapt 가 예외 throw (zod 검증 실패 등)
 *
 * 분석 실패 (analyzedAt IS NULL AND analysisErrorAt IS NOT NULL) 와는 별개 — 그
 * 경우는 CardMeta.analyzed=false 이라 shell 이 "분석 중" / "분석 불가" placeholder
 * 로 처리하고 이 컴포넌트는 호출되지 않는다. 여기는 "리포트는 있는데 우리 빌드가
 * 아직 그 버전을 모름" 케이스 — 톤이 다름 (운영 알림 / 빌드 업데이트 안내).
 *
 * Shell 의 chip 탭 + 한줄평 + attribution + CTA 는 그대로 — 이 카드 본문만 격리.
 */
export function UnsupportedAnalysisVersion({ version }: { version: number }) {
  return (
    <section className="rounded-xl border border-[#e2e2e2] bg-[#fafafa] p-8 flex flex-col items-center gap-3 text-center">
      <p className="text-sm font-semibold text-black">
        분석 결과를 표시할 준비가 안 됐어요
      </p>
      <p className="text-xs text-[#4b4b4b] leading-relaxed">
        이 제안서의 분석 형식 (v{version}) 은 현재 화면이 아직 지원하지 않아요.
        <br />
        잠시 후 다시 시도해 주세요.
      </p>
      <p className="text-[10px] text-[#afafaf] mt-1">
        지원 버전: {SUPPORTED_ANALYSIS_VERSIONS.join(", ")}
      </p>
    </section>
  );
}
