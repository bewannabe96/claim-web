import { z } from "zod";

import { KNOWN_CATEGORIES } from "@/features/proposals/category-labels";

/**
 * 시스템 설정값 검증 스키마 — PRD §5.8.
 * server/settings.ts 의 in-memory 객체를 어드민 폼이 갱신할 때 사용.
 */
export const SettingsInputSchema = z.object({
  candidateCount: z.coerce
    .number({ message: "숫자를 입력해주세요." })
    .int()
    .min(1, "최소 1명 이상이어야 합니다.")
    .max(20, "최대 20명까지 설정 가능합니다."),
  selectLimit: z.coerce
    .number({ message: "숫자를 입력해주세요." })
    .int()
    .min(1, "최소 1명 이상이어야 합니다.")
    .max(10, "최대 10명까지 설정 가능합니다."),
  submissionDeadlineHours: z.coerce
    .number({ message: "숫자를 입력해주세요." })
    .int()
    .min(1, "최소 1시간 이상이어야 합니다.")
    .max(168, "최대 168시간(7일)까지 설정 가능합니다."),
  penaltyWindow: z.coerce
    .number({ message: "숫자를 입력해주세요." })
    .int()
    .min(1)
    .max(100),
});

export type SettingsInput = z.infer<typeof SettingsInputSchema>;

export type SettingsState =
  | { ok: true }
  | {
      ok?: false;
      errors?: Partial<Record<keyof SettingsInput | "_form", string[]>>;
    }
  | undefined;

/* ============================================================
 * 시나리오 우선순위 — 결과 페이지 top3 & 모달 primary 결정.
 *
 * KNOWN_CATEGORIES 안의 값만 허용 (외부 schema 가 새 카테고리 도입 시
 * category-labels.ts 에 먼저 추가). 중복은 허용하지 않음.
 * ============================================================ */

const KNOWN_CATEGORY_SET = new Set<string>(KNOWN_CATEGORIES);

export const ScenarioPriorityInputSchema = z.object({
  scenarioPriority: z
    .array(
      z.string().refine((v) => KNOWN_CATEGORY_SET.has(v), {
        message: "알 수 없는 카테고리입니다.",
      }),
    )
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "중복된 카테고리가 있습니다.",
    }),
});

export type ScenarioPriorityInput = z.infer<typeof ScenarioPriorityInputSchema>;

export type ScenarioPriorityState =
  | { ok: true }
  | {
      ok?: false;
      errors?: Partial<
        Record<keyof ScenarioPriorityInput | "_form", string[]>
      >;
    }
  | undefined;
