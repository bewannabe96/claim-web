/**
 * 가입 진행 단계 표시 — signup 페이지 (Step 1) 와 verify 페이지 (Step 2) 가 공유.
 * Server Component (props 직렬화 가능).
 */
export function StepBadge({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const tone = done
    ? "bg-black text-white border-black"
    : active
      ? "bg-white text-black border-black"
      : "bg-[#fafafa] text-[#afafaf] border-[#efefef]";
  return (
    <li
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${tone}`}
    >
      <span className="font-bold">{step}</span>
      <span>{label}</span>
      {done && <span aria-hidden>✓</span>}
    </li>
  );
}
