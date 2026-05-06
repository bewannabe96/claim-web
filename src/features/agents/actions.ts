"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MOCK_AGENTS } from "@/mocks/agents";

import { AgentInputSchema, type AgentInput } from "./schema";

export type AgentMutationState =
  | { ok: true; id?: string }
  | {
      ok?: false;
      errors?: Partial<Record<keyof AgentInput | "_form", string[]>>;
    }
  | undefined;

/**
 * 신규 설계사 등록 — 어드민.
 *
 * 검증은 운영자가 오프라인에서 수행 후 등록 (PRD §5.8).
 * MVP: in-memory mutate. exposureCount=0, recentSubmissions=[] 로 초기화.
 */
export async function createAgent(
  _prev: AgentMutationState,
  formData: FormData,
): Promise<AgentMutationState> {
  const parsed = AgentInputSchema.safeParse({
    name: formData.get("name"),
    avatarUrl: formData.get("avatarUrl"),
    specialties: formData.getAll("specialties"),
    bio: formData.get("bio"),
    yearsOfExperience: Number(formData.get("yearsOfExperience")),
    trustMetric: formData.get("trustMetric"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    active: formData.get("active") === "on",
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const id = `agent-${String(MOCK_AGENTS.length + 1).padStart(3, "0")}`;
  MOCK_AGENTS.push({
    ...parsed.data,
    id,
    exposureCount: 0,
    recentSubmissions: [],
  });

  revalidatePath("/admin/agents");
  redirect("/admin/agents");
}

/**
 * 기존 설계사 수정 — 어드민. id 외 필드 모두 갱신 가능.
 * exposureCount/recentSubmissions 는 시스템 카운터라 폼에서 제외.
 */
export async function updateAgent(
  agentId: string,
  _prev: AgentMutationState,
  formData: FormData,
): Promise<AgentMutationState> {
  const parsed = AgentInputSchema.safeParse({
    name: formData.get("name"),
    avatarUrl: formData.get("avatarUrl"),
    specialties: formData.getAll("specialties"),
    bio: formData.get("bio"),
    yearsOfExperience: Number(formData.get("yearsOfExperience")),
    trustMetric: formData.get("trustMetric"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    active: formData.get("active") === "on",
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const idx = MOCK_AGENTS.findIndex((a) => a.id === agentId);
  if (idx < 0) {
    return { ok: false, errors: { _form: ["설계사를 찾을 수 없습니다."] } };
  }

  MOCK_AGENTS[idx] = {
    ...MOCK_AGENTS[idx],
    ...parsed.data,
  };

  revalidatePath("/admin/agents");
  revalidatePath(`/admin/agents/${agentId}`);
  return { ok: true, id: agentId };
}
