import { z } from "zod";

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
