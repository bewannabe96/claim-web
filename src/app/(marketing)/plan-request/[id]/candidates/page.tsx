import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import type { PartnerCard } from "@/features/partners/schema";
import { submitStep2 } from "@/features/plan-requests/actions";
import { getRequestById } from "@/features/plan-requests/queries";
import { getSettings } from "@/server/settings";

/* ============================================================
 * [임시] 설계사 선택 단계 frontend skip — 후보 자동배정 후 즉시 다음 단계로 통과.
 *
 * 원래 이 라우트는 가입자가 후보 카드 중 직접 selectLimit 명을 골랐다 (PR #122 에서
 * 6785b92d 의 자동배정을 한 번 롤백해 선택 UI 로 복원했던 버전). 운영 판단으로
 * 선택 단계를 다시 frontend 에서 건너뛰되, 이번엔 카드 노출까지 생략하고 페이지
 * 진입 즉시 server 에서 submitStep2 를 호출해 confirm 단계로 흘러보낸다.
 *
 * 후보 중 selectLimit 명은 요청서 id 기준으로 결정적으로 추려(pickAssignedPartners)
 * 자동배정. 같은 요청서면 새로고침/뒤로가기로 재진입해도 동일 조합 — 6785b92d 와
 * 동일한 seed 정책.
 *
 * 백엔드(submitStep2 / schema / DB / candidatePartnerIds) 무변경. submitStep2 가
 * 내부에서 /plan-request/<id>/confirm 으로 redirect 하므로 이 컴포넌트는 정상
 * 흐름에서 아무것도 렌더하지 않는다.
 *
 * ▶ 롤백 방법 (선택 단계 복원):
 *   1. 이 파일을 PR #122 의 상태로 되돌린다 — CandidatesSelector 호출 형태.
 *      _components/candidates-selector.tsx 는 이번 변경에서 손대지 않았으므로
 *      그 파일 변경 없이 page.tsx 만 되돌리면 즉시 복귀.
 *   2. pickAssignedPartners / hashSeed 헬퍼와 submitStep2 / PartnerCard import 제거.
 *   3. metadata 를 "설계사 선택" 으로 복원.
 * ============================================================ */

export const metadata: Metadata = {
  title: "설계사 배정 중",
  description: "요청서에 맞춰 설계사를 배정하고 있어요.",
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

  // [임시] 가입자가 직접 고르는 대신 요청서 id 기준 결정적 추출 — 같은 요청서면
  // 새로고침/뒤로가기로 재진입해도 동일 조합. candidates.length >= selectLimit 은
  // admin settings 의 candidateCount >= selectLimit 불변식 + step1 의 후보 산출이
  // 보장하므로 별도 가드 불필요.
  const picked = pickAssignedPartners(candidates, selectLimit, id);

  // submitStep2 의 (requestId, _prev, formData) 시그니처 그대로 호출.
  //   - _prev: Step2State 는 undefined 허용 — 함수 내부에서 미사용.
  //   - 정상 흐름이면 함수 안에서 redirect(`/plan-request/${id}/confirm`) 가
  //     NEXT_REDIRECT throw → 이 줄 이후엔 도달하지 않는다.
  //   - throw 를 catch 하면 redirect 가 끊기므로 try/catch 금지.
  const formData = new FormData();
  for (const p of picked) {
    formData.append("partnerIds", p.id);
  }
  const result = await submitStep2(id, undefined, formData);

  // 여기 도달 = submitStep2 검증 실패. 정상 흐름에선 candidatePartnerIds 에서 그대로
  // 뽑아 넘기므로 partnerId 매칭 / selectLimit 모두 통과한다. 도달했다면 데이터
  // 정합성 문제 (예: candidate row 가 사라짐). notFound 로 폴백.
  console.error("[candidates] submitStep2 did not redirect", {
    requestId: id,
    state: result,
  });
  notFound();
}

/**
 * [임시] 후보 배열에서 최대 count 명을 seed 기준으로 결정적 추출 (자동배정).
 * 선택 단계 frontend skip 용 — 롤백 시 이 함수와 hashSeed 를 함께 제거.
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
