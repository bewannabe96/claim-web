"use client";

/**
 * EntryCard — v2-mock 의 entry 액션 공통 디자인.
 *
 * 사용처:
 *   - EmptyWorkbench: [업로드 PDF/사진] / [파트너로부터 제안서 받기] 두 entry
 *   - AddSlotSheet:   채워진 워크스페이스의 chip [+ 슬롯 추가] picker
 *
 * 두 곳 모두 같은 디자인 (회색 border + 라벨 + desc) 으로 entry 시각 언어 일관.
 * primary/secondary hierarchy 없음 — 사용자가 본인 의도에 따라 선택.
 *
 * desc 는 React.ReactNode — 줄바꿈/강조 (예: <b>) 자유.
 */
export function EntryCard({
  label,
  desc,
  onClick,
}: {
  label: string;
  desc: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left flex flex-col gap-1.5 rounded-xl border border-[#e2e2e2] bg-white px-5 py-5 hover:border-black hover:bg-[#fafafa] transition-colors"
    >
      <span className="text-base font-bold text-black">{label}</span>
      <span className="text-xs text-[#4b4b4b] leading-relaxed">{desc}</span>
    </button>
  );
}
