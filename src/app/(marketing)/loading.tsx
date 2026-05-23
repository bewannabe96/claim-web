/**
 * 랜딩 Suspense fallback — `page.tsx` 가 `cookies()` / `await searchParams` /
 * Redis INCR 등 dynamic 호출을 하므로 Next 16 의 `cacheComponents: true` 가
 * loading boundary 를 요구. 빠지면 빌드 실패.
 *
 * 변형 마크업은 dispatcher 가 결정하므로 여기서 hero 를 흉내 낼 수 없음.
 * 480px 모바일 컨테이너 (layout 의 chrome) 안의 빈 흰 화면 — 실제 SSR 응답은
 * 보통 수십 ms 안에 도착해 깜빡임 거의 없다 (Redis INCR 1회 + cookie 읽기).
 *
 * 추후 FCP 가 문제 되면 page.tsx 안에서 `<Suspense fallback={<DefaultHero />}>`
 * 로 변형 결정 서브트리만 감싸고 정적 섹션 (How-it-works/Footer) 은 즉시
 * 렌더하는 구조로 격상.
 */
export default function MarketingLoading() {
  return <div className="flex-1" aria-hidden />;
}
