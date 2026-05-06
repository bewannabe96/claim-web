import { notFound } from "next/navigation";

import { getAgentCardsByIds } from "@/features/agents/queries";
import { getRequestById } from "@/features/requests/queries";
import { getSettings } from "@/server/settings";
import { AGE_RANGE_LABEL, INSURANCE_CATEGORY_LABEL } from "@/types";

import { CandidatesSelector } from "./_components/candidates-selector";

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req || req.status !== "selecting") notFound();

  const candidates = await getAgentCardsByIds(req.candidateAgentIds);
  const { selectLimit } = getSettings();

  // 헤더 부제: "건강보험 · 30대 기준 추천"
  const primaryCategoryLabel = INSURANCE_CATEGORY_LABEL[req.step1.categories[0]];
  const ageLabel = AGE_RANGE_LABEL[req.step1.ageRange];
  const subtitle = `${primaryCategoryLabel} · ${ageLabel} 기준 추천`;

  return (
    <CandidatesSelector
      requestId={id}
      candidates={candidates}
      selectLimit={selectLimit}
      subtitle={subtitle}
    />
  );
}
