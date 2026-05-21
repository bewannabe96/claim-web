/**
 * 루트 Suspense fallback — 모노크롬 펄스 닷.
 * cacheComponents 가 켜져있어서 동적 페이지의 첫 페인트가 여기를 거침.
 */
export default function RootLoading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-white">
      <div className="flex items-center gap-2" aria-label="불러오는 중">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block w-2.5 h-2.5 rounded-full bg-black animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}
