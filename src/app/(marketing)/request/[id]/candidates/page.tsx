import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { getAgentCardsByIds } from "@/features/agents/queries";
import { getRequestById } from "@/features/requests/queries";
import { ageDecadeLabel, ageFromBirthDate } from "@/lib/age";
import { getSettings } from "@/server/settings";

import { CandidatesSelector } from "./_components/candidates-selector";

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 나이 계산이 wall-clock 의존 — dynamic 인디케이터.
  await cookies();

  const { id } = await params;
  const req = await getRequestById(id);
  if (!req || req.status !== "selecting") notFound();

  const candidates = await getAgentCardsByIds(req.candidateAgentIds);
  const { selectLimit } = getSettings();

  const age = ageFromBirthDate(req.step1.birthDate);
  const subtitle = `${req.step1.region} · ${ageDecadeLabel(age)} 기준 추천`;

  return (
    <CandidatesSelector
      requestId={id}
      candidates={candidates}
      selectLimit={selectLimit}
      subtitle={subtitle}
    />
  );
}
