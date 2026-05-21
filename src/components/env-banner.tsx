/**
 * 비프로덕션 환경 식별 배너 — dev / staging / preview 헷갈림 방지.
 *
 * 정책: prod allowlist 방식 (fail-safe). env `ENV_STAGE` 가 `production` / `prod`
 * (대소문자 무시) 일 때만 미표시. 미설정 / 빈 값 / 그 외 모든 값은 배너 표시 —
 * prod 배포에서 ENV_STAGE 박는 걸 까먹어도 자동으로 visible 한 사고 방지 신호.
 *
 * stage 값이 있으면 pill 로 라벨링, 없으면 부연 문구만 노출.
 *
 * Server Component — root layout 에서만 사용. 다른 sticky 요소 (admin/partner top nav,
 * z-10~30) 위에 z-50 으로 올라옴.
 */
export function EnvBanner() {
  const stage = process.env.ENV_STAGE?.trim();
  if (stage) {
    const normalized = stage.toLowerCase();
    if (normalized === "production" || normalized === "prod") return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex w-full items-center justify-center gap-2.5 bg-red-600 px-4 py-2.5 text-white shadow-md"
    >
      {stage && (
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-black uppercase tracking-[0.15em]">
          {stage}
        </span>
      )}
      <span className="text-sm font-semibold tracking-wide">
        운영 환경이 아닙니다
      </span>
    </div>
  );
}
