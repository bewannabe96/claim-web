/**
 * (marketing) 레이아웃 — 가입자 비인증 영역.
 * 480px 모바일 컨테이너. 페이지가 직접 hero 를 그림 (chrome 헤더 없음).
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[480px] flex-1 flex flex-col bg-white border-x border-[#e2e2e2] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
      {children}
    </div>
  );
}
