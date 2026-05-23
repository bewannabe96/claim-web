/**
 * 신뢰/마찰해소 칩 — 첫 진입 의문(무료인가 / 얼마나 걸리나 / 전화 오는가)에
 * 답하는 작은 pill 묶음.
 *
 * 사용처: Hero 진입 CTA 바로 아래 + Zone 3 CTA 버튼 아래. 같은 라벨 셋을 두
 * 곳에서 동일하게 노출해 결정 직전에도 마찰해소를 한 번 더 상기시킨다 —
 * 그래서 `<TrustChipList />` 한 컴포넌트로 묶어 라벨 변경 시 단일 진실 공급원.
 *
 * 강조 톤: 모노크롬 시스템 유지하면서도 진입 의문 답이라는 점이 즉시
 * 인식되도록 — 체크 글리프 + 굵은 텍스트. 컬러 강조는 일부러 안 씀 (CTA 버튼
 * 검정과 위계 충돌 회피).
 */
function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1 rounded-full border border-[#e2e2e2] bg-white px-2.5 py-1 text-[0.75rem] font-semibold text-black">
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-3 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8 L7 12 L13 4" />
      </svg>
      {children}
    </li>
  );
}

/** Hero / Zone 3 양쪽에서 쓰는 trust chip 묶음. 라벨 변경은 여기서만. */
export function TrustChipList({ className }: { className?: string }) {
  return (
    <ul className={className}>
      <TrustChip>100% 무료</TrustChip>
      <TrustChip>약 1분</TrustChip>
      <TrustChip>전화없음</TrustChip>
    </ul>
  );
}
