"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/server/dal";
import { updateSettings } from "@/server/settings";

import {
  ScenarioPriorityInputSchema,
  SettingsInputSchema,
  type ScenarioPriorityState,
  type SettingsState,
} from "./schema";

/**
 * 시스템 설정값 갱신 — 어드민 설정 페이지에서 호출.
 *
 * selectLimit ≤ candidateCount 보장 — 가입자가 선택할 수 있는 인원이
 * 후보 인원을 초과하면 안 됨.
 *
 * Server action 은 layout 의 인증 게이트를 거치지 않으므로 자체적으로
 * requireAdminSession() 호출 — 미인증 호출 시 /admin/login 으로 redirect.
 */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdminSession();

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

  await updateSettings(parsed.data);

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 결과 페이지 시나리오 우선순위 갱신 — 어드민이 ordered list 편집 후 호출.
 *
 * 시그니처가 일반 settings 폼과 달라 별도 액션. FormData 의 `scenarioPriority`
 * 는 같은 키로 여러 값 (`formData.getAll`) 또는 JSON 문자열 둘 다 지원.
 *
 * 빈 배열은 허용 (어드민이 우선순위 전부 비울 수도) — 결과 페이지는 그 경우
 * top3 가 0건이라 모달의 others 만 의미 있음.
 *
 * Server action 은 layout 게이트 우회하므로 자체 가드 필수.
 */
export async function saveScenarioPriority(
  _prev: ScenarioPriorityState,
  formData: FormData,
): Promise<ScenarioPriorityState> {
  await requireAdminSession();

  const raw = formData.getAll("scenarioPriority").map(String);

  // 폼이 단일 JSON 문자열로 보냈을 수도 — drag-drop UI 에 적합.
  let candidate: string[];
  if (raw.length === 1 && raw[0].startsWith("[")) {
    try {
      const parsedJson = JSON.parse(raw[0]) as unknown;
      candidate = Array.isArray(parsedJson) ? parsedJson.map(String) : [];
    } catch {
      return {
        ok: false,
        errors: { _form: ["잘못된 형식입니다."] },
      };
    }
  } else {
    candidate = raw;
  }

  const parsed = ScenarioPriorityInputSchema.safeParse({
    scenarioPriority: candidate,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  await updateSettings({ scenarioPriority: parsed.data.scenarioPriority });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  // 결과 페이지가 우선순위에 의존 — 변경 시 갱신.
  revalidatePath("/result", "layout");
  return { ok: true };
}
