"use server";

import { revalidatePath } from "next/cache";

import { updateSettings } from "@/server/settings";

import { SettingsInputSchema, type SettingsState } from "./schema";

/**
 * 시스템 설정값 갱신 — 어드민 설정 페이지에서 호출.
 *
 * selectLimit ≤ candidateCount 보장 — 가입자가 선택할 수 있는 인원이
 * 후보 인원을 초과하면 안 됨.
 */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = SettingsInputSchema.safeParse({
    candidateCount: formData.get("candidateCount"),
    selectLimit: formData.get("selectLimit"),
    submissionDeadlineHours: formData.get("submissionDeadlineHours"),
    penaltyWindow: formData.get("penaltyWindow"),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.selectLimit > parsed.data.candidateCount) {
    return {
      ok: false,
      errors: {
        selectLimit: ["선택 한도는 후보 수보다 클 수 없습니다."],
      },
    };
  }

  updateSettings(parsed.data);

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}
