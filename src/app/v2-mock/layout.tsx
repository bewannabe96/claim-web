/**
 * v2-mock 레이아웃 — (marketing) 의 480px 컨테이너 톤은 그대로, 광고/분석 픽셀은 제외.
 *
 * Mock 진입은 실 funnel 데이터를 오염시키지 않아야 한다 ("Keep cross-cutting separate"
 * 메모리 정책 + v2-mock/CLAUDE.md 의 분석/광고 미주입 규칙).
 */
export default function V2MockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col bg-white min-[480px]:border-x min-[480px]:border-[#e2e2e2] shadow-[0_4px_16px_rgba(0,0,0,0.12)] relative">
      {children}
    </div>
  );
}
