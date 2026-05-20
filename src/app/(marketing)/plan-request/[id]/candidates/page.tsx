import { notFound } from "next/navigation";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import { getRequestById } from "@/features/plan-requests/queries";
import {
  FOCUSED_CONCERN_LABEL,
  type CoverageRequest,
} from "@/features/plan-requests/schema";
import { getSettings } from "@/server/settings";

import { CandidatesSelector } from "./_components/candidates-selector";

export default async function CandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req || req.status !== "selecting") notFound();

  const candidates = await getPartnerCardsByIds(req.candidatePartnerIds);
  const { selectLimit } = await getSettings();

  // 추천 근거가 된 매칭 신호 3개 — coverage · 직업 · 예산. coverage 를 맨 앞에
  // 두어 "이 보장을 봐줄 수 있는 설계사" 라는 매칭 의미를 가입자가 인지하게 함.
  const subtitle = [
    coverageBrief(req.step1.coverage),
    req.step1.occupation,
    formatBudget(req.step1.monthlyBudgetMin, req.step1.monthlyBudgetMax),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CandidatesSelector
      requestId={id}
      candidates={candidates}
      selectLimit={selectLimit}
      subtitle={subtitle}
    />
  );
}

function coverageBrief(coverage: CoverageRequest): string {
  if (coverage.intent === "broad") return "종합 검토";
  return coverage.concerns.map((id) => FOCUSED_CONCERN_LABEL[id]).join(", ");
}

function formatBudget(min: number, max: number): string {
  const fmt = (n: number) =>
    n >= 10000 ? `${Math.floor(n / 10000)}만` : `${n.toLocaleString("ko-KR")}원`;
  return `월 ${fmt(min)}~${fmt(max)}`;
}
