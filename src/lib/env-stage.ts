/**
 * 배포 환경 stage 판별 — prod allowlist 방식 (fail-safe).
 *
 * 정책: env `ENV_STAGE` 가 `production` / `prod` (대소문자 무시) 일 때만
 * 프로덕션으로 인정. 미설정 / 빈 값 / 그 외 모든 값(development, staging,
 * preview, qa …)은 전부 비프로덕션으로 본다 — prod 배포에서 ENV_STAGE 박는
 * 걸 까먹어도 자동으로 안전한 쪽(환경 배너 노출 + 전 경로 크롤링 차단)으로
 * 떨어지게 한다.
 *
 * env-banner / robots.ts / middleware 의 단일 진실 공급원.
 */

export function getEnvStage(): string | undefined {
  return process.env.ENV_STAGE?.trim() || undefined;
}

export function isProductionEnv(): boolean {
  const normalized = getEnvStage()?.toLowerCase();
  return normalized === "production" || normalized === "prod";
}
