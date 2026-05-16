import "server-only";

import type { AppSettings } from "@prisma/client";

import { prisma } from "./db/prisma";

/**
 * 시스템 설정값 — PRD §8.
 *
 * DB `app_settings` 테이블 (single row, id='app') 에서 로드. CHECK 제약으로
 * 한 row 강제. 어드민 화면이 mutate.
 *
 * 호출부는 항상 함수로 접근 (값 인라인 X) — 어드민이 바꾼 직후 반영되도록.
 * MVP 는 매 호출 DB hit. 트래픽 늘면 request-scope cache 로 dedup.
 */

const SETTINGS_ID = "app";

/** 폼에서 갱신 가능한 필드만 (id / updated_at 제외). */
export type SettingsPatch = Partial<
  Pick<
    AppSettings,
    | "candidateCount"
    | "selectLimit"
    | "submissionDeadlineHours"
    | "penaltyWindow"
  >
>;

export async function getSettings(): Promise<Readonly<AppSettings>> {
  return prisma.appSettings.findUniqueOrThrow({
    where: { id: SETTINGS_ID },
  });
}

export async function updateSettings(
  patch: SettingsPatch,
): Promise<Readonly<AppSettings>> {
  return prisma.appSettings.update({
    where: { id: SETTINGS_ID },
    data: patch,
  });
}
