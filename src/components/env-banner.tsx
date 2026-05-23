import { getEnvStage, isProductionEnv } from "@/lib/env-stage";

/**
 * 비프로덕션 환경 식별 배너 — dev / staging / preview 헷갈림 방지.
 *
 * 프로덕션 여부 판정은 prod allowlist (fail-safe) — 정책과 구현은
 * [env-stage.ts](src/lib/env-stage.ts) 의 `isProductionEnv()` 가 단일 진실
 * 공급원. 비프로덕션일 때만 배너 표시.
 *
 * stage 값이 있으면 pill 로 라벨링, 없으면 부연 문구만 노출.
 *
 * Server Component — root layout 에서만 사용. 다른 sticky 요소 (admin/partner top nav,
 * z-10~30) 위에 z-50 으로 올라옴.
 */
export function EnvBanner() {
  if (isProductionEnv()) return null;

  const stage = getEnvStage();

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex w-full items-center justify-center gap-2.5 bg-red-600 px-4 py-2.5 text-white shadow-md"
    >
      {stage && (
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.15em]">
          {stage}
        </span>
      )}
      <span className="text-sm font-semibold tracking-wide">
        운영 환경이 아닙니다
      </span>
    </div>
  );
}
