import { cn } from "@/lib/utils";

/**
 * CLAIM Studio wordmark — v2 product 이름의 chrome 표기.
 *
 * PRD §0 의 "사용자 노출 어휘 = CLAIM Studio" 정책. 모든 v2-mock 페이지 chrome 에서
 * 이 컴포넌트로 통일 — 회사 brand `<BrandMark />` ("CLAIM") 와 분리. 사용자가 v2
 * surface 안에 있을 때 product label 이 일관되게 시각.
 *
 * 톤: "CLAIM" 은 회사 brand 라 약간 fade (color tone), "Studio" 가 product accent.
 * 두 단어가 한 wordmark 로 합쳐진 brand+product 형태 (예: Apple Music / Notion AI).
 *
 * 다른 라우트 (admin / partner / marketing) 는 그대로 `<BrandMark />` 사용 —
 * "CLAIM Studio" 는 v2 product 전용.
 */
export function ClaimStudioMark({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-sm font-bold tracking-wide text-black",
        className,
      )}
    >
      <span className="text-[#4b4b4b]">CLAIM</span>{" "}
      <span className="text-black">Studio</span>
    </p>
  );
}
