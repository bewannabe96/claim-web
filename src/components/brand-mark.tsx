import { cn } from "@/lib/utils";

/**
 * DOPDA 브랜드 워드마크.
 *
 * DESIGN.md 컨벤션 — 페이지 chrome 의 좌상단 앵커 역할. UberMove 스타일에 맞춰
 * 작은 사이즈 / bold / wide letter-spacing. 모든 가입자/설계사 페이지에서 동일하게 사용.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-sm font-bold tracking-wide text-black",
        className,
      )}
    >
      DOPDA
    </p>
  );
}
