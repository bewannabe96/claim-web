import { V5_ENTRY } from "./v5";
import type { AnalysisVersionEntry } from "./types";

/* ============================================================
 * 분석 리포트 버전 registry — 단일 dispatch 진실.
 *
 * 새 버전 추가는 폴더 신설 + 이 객체에 한 줄. 라우트 / shell / 옛 버전 폴더는
 * 한 줄도 안 바뀐다 (additive-only).
 *
 * 객체 자체는 generic 을 `unknown` 으로 좁힌 entry 들의 map 으로 노출 — 라우트는
 * 좁은 타입을 보지 않고 `buildAnalysisRenderer` 가 entry 별 closure 안에서만
 * 좁은 타입을 다룬다.
 * ============================================================ */

export const ANALYSIS_VERSIONS: Readonly<
  Record<number, AnalysisVersionEntry<unknown, unknown>>
> = {
  5: V5_ENTRY as AnalysisVersionEntry<unknown, unknown>,
} as const;

export const SUPPORTED_ANALYSIS_VERSIONS: readonly number[] = Object.keys(
  ANALYSIS_VERSIONS,
).map(Number);

export function getAnalysisEntry(
  version: number,
): AnalysisVersionEntry<unknown, unknown> | null {
  return ANALYSIS_VERSIONS[version] ?? null;
}
