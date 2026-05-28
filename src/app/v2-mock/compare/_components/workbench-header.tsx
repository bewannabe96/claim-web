import { ClaimStudioMark } from "../../_components/claim-studio-mark";

/* ============================================================
 * Workbench header — v1 의 ResultPageShell ("제안서 N건이 도착했어요") 대신
 * v2 workspace 톤. 헤더의 책임은 brand chrome 한 줄.
 *
 * "비교 워크벤치" 같은 도구 라벨은 의도적으로 안 둠 — chip strip 이 이미 여러 슬롯
 * + active 강조로 "비교 도구" 임을 시각으로 충분히 전달하고, 본문이 비교 그 자체.
 * 헤더 라벨은 redundant 가 되어 시각 노이즈만 추가. 헤더 책임은 brand anchor.
 *
 * v1 의 ResultPageShell 은 한 줄도 안 건드림 — v1 결과 페이지 전용으로 freeze.
 * ============================================================ */
export function WorkbenchHeader() {
  return (
    <header className="px-6 pt-10 pb-3">
      <ClaimStudioMark />
    </header>
  );
}
