import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import type { PartnerCard } from "@/features/partners/schema";
import { getRequestById } from "@/features/plan-requests/queries";
import {
  FOCUSED_CONCERN_LABEL,
  type CoverageRequest,
} from "@/features/plan-requests/schema";
import { getSettings } from "@/server/settings";

import { CandidatesSelector } from "./_components/candidates-selector";

/* ============================================================
 * [임시] 설계사 자동배정 — 선택 단계 생략.
 *
 * 원래 이 화면은 후보 전체를 내려보내 가입자가 직접 골랐다. 지금은 운영 판단으로
 * 선택 단계를 생략하고, 후보 중 selectLimit 명을 요청서 id 기준으로 결정적으로
 * 추려(pickAssignedPartners) 자동배정한다. 가입자에게는 처음부터 자동배정이었던
 * 것처럼 보인다. 백엔드(submitStep2)·DB·스키마는 선택 버전과 100% 동일.
 *
 * ▶ 롤백 방법 (선택 단계 복원):
 *   1. 아래 [원본] 주석의 metadata·return 을 해제하고 현재 활성 버전을 제거.
 *   2. pickAssignedPartners·hashSeed 헬퍼와 PartnerCard import 를 제거 (롤백 시 미사용).
 *   3. _components/candidates-selector.tsx 도 함께 롤백 (그 파일의 [원본] 주석 참조).
 * ============================================================ */

// [원본] 롤백 시 복원할 metadata:
// export const metadata: Metadata = {
//   title: "설계사 선택",
//   description: "추천된 설계사 카드 중 제안서를 받을 분들을 선택해주세요.",
// };
export const metadata: Metadata = {
  title: "배정된 설계사",
  description: "요청서에 맞춰 배정된 설계사를 확인하고 제안서를 받아보세요.",
};

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

  // [임시] 설계사 선택 단계 생략 — 후보 중 selectLimit 명을 요청서 id 기준으로
  // 결정적으로 골라 자동배정한다. 같은 요청서면 새로고침해도 동일 조합.
  const picked = pickAssignedPartners(candidates, selectLimit, id);

  // 추천 근거가 된 매칭 신호 3개 — coverage · 직업 · 예산. coverage 를 맨 앞에
  // 두어 "이 보장을 봐줄 수 있는 설계사" 라는 매칭 의미를 가입자가 인지하게 함.
  const subtitle = [
    coverageBrief(req.step1.coverage),
    req.step1.occupation,
    formatBudget(req.step1.monthlyBudgetMin, req.step1.monthlyBudgetMax),
  ]
    .filter(Boolean)
    .join(" · ");

  // [원본] 롤백 시 복원할 return — 후보 전체 + selectLimit 을 그대로 내려 선택:
  // return (
  //   <CandidatesSelector
  //     requestId={id}
  //     candidates={candidates}
  //     selectLimit={selectLimit}
  //     subtitle={subtitle}
  //   />
  // );
  return (
    <CandidatesSelector requestId={id} candidates={picked} subtitle={subtitle} />
  );
}

/**
 * [임시] 후보 배열에서 최대 count 명을 seed 기준으로 결정적 추출 (자동배정).
 * 선택 단계 생략용 — 롤백 시 이 함수와 hashSeed 를 함께 제거한다.
 *
 * 각 후보를 (seed + 후보 id) 해시값으로 정렬해 앞 count 개를 취한다. 같은
 * seed(요청서 id)면 새로고침해도 항상 같은 결과 — 자동배정이 고정돼 보이면서
 * 요청서마다는 다른 조합이 나온다. (무작위가 아니라 seed 에 대해 결정적.)
 */
function pickAssignedPartners(
  items: PartnerCard[],
  count: number,
  seed: string,
): PartnerCard[] {
  return [...items]
    .map((item) => ({ item, key: hashSeed(seed + item.id) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((entry) => entry.item);
}

/** [임시] 문자열 → 32bit 부호없는 해시 (FNV-1a). pickAssignedPartners 의 정렬 키. */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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
