import "server-only";

/**
 * 시스템 설정값 — PRD §8.
 *
 * MVP: in-memory mutable. 어드민 화면에서 갱신 가능.
 * DB 도입 시: settings 테이블에서 로드 + 캐시.
 *
 * 호출부는 항상 함수로 접근 (값 인라인 X) — 어드민이 바꾼 직후 반영되도록.
 */

type Settings = {
  /** N — 가입자에게 노출할 후보 수 */
  candidateCount: number;
  /** K — 가입자가 선택 가능한 최대 인원 */
  selectLimit: number;
  /** T — 설계사 제안서 제출 제한시간 (시간 단위) */
  submissionDeadlineHours: number;
  /** 미제출률 페널티 산정 윈도우 (최근 N건) */
  penaltyWindow: number;
};

const SETTINGS: Settings = {
  candidateCount: 5,
  selectLimit: 3,
  submissionDeadlineHours: 48,
  penaltyWindow: 10,
};

export function getSettings(): Readonly<Settings> {
  return SETTINGS;
}

export function updateSettings(patch: Partial<Settings>): Readonly<Settings> {
  Object.assign(SETTINGS, patch);
  return SETTINGS;
}
