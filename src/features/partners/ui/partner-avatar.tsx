import { cn } from "@/lib/utils";

/**
 * 파트너 프로필 아바타 — 사진 등록된 partner 는 실제 사진 (S3 public URL),
 * 미등록 partner 는 이름 첫 글자 fallback. 앱 전반의 파트너 노출 지점에서 단일화.
 *
 * 크기 / 색상은 호출자가 Tailwind class 로 지정 — Tailwind JIT 가 동적 값을
 * 컴파일하지 못하므로 string literal 로만 받음.
 *
 *   - `className`         : 공통 (img / fallback span 둘 다). 보통 사이즈 + 글자 크기.
 *                           e.g. "w-12 h-12 text-lg font-bold"
 *   - `fallbackClassName` : 이니셜 fallback 전용 색상. avatarUrl 있을 땐 무시.
 *                           e.g. "bg-black text-white"
 */
export function PartnerAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  if (avatarUrl) {
    return (
      // S3 immutable 키 + Cache-Control 가 객체에 박혀 next/image 의 최적화 없이도
      // 브라우저 캐시가 잘 동작. remotePatterns 설정 부담 피하기 위해 raw img.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn(
          "rounded-full object-cover shrink-0",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full shrink-0",
        fallbackClassName,
        className,
      )}
    >
      {name.charAt(0)}
    </span>
  );
}
