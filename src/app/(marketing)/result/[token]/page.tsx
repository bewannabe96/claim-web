import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { getRequestByResultToken } from "@/features/requests/queries";

import { RematchingState } from "./_components/rematching-state";
import { ResultView } from "./_components/result-view";
import { MOCK_PROPOSALS, type ProposalData } from "./_mock/data";

/**
 * 결과 열람 — 알림톡 일회용 토큰으로 진입.
 *
 * 분기:
 *   - 0건  → RematchingState (재매칭 안내)
 *   - 1건  → 단일 view (chip 탭 없음)
 *   - 2+건 → 본 흐름 (chip 탭으로 제안서 전환)
 *
 * fixture 단계 — 실 query 는 후속에서 supabase 로 교체. token 존재 여부만 검증.
 */
export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ count?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const req = await getRequestByResultToken(token);
  if (!req) notFound();

  // fixture: ?count=0|1|3 으로 분기 시연 (없으면 3 = 본 흐름)
  const proposals = filterProposals(sp.count);

  return (
    <main className="flex flex-col flex-1 bg-white">
      <div className="px-6 pt-10">
        <BrandMark />
        <header className="mt-6 flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
            제안서{" "}
            <span className="text-black">{proposals.length}건</span>
            이 도착했어요
          </h1>
          {req.selectedAgentIds.length > proposals.length &&
            proposals.length > 0 && (
              <p className="text-sm text-[#4b4b4b]">
                선택하신 {req.selectedAgentIds.length}명 중{" "}
                <span className="font-semibold text-black">
                  {proposals.length}명
                </span>
                이 제안서를 보내주셨어요
              </p>
            )}
        </header>
      </div>

      {proposals.length === 0 ? (
        <RematchingState />
      ) : (
        <ResultView proposals={proposals} />
      )}
    </main>
  );
}

/**
 * fixture 분기 — `?count=0|1|3` URL 파라미터로 0건/1건/N건 시연 케이스 전환.
 * 실 데이터 연결 후 제거.
 */
function filterProposals(count: string | undefined): ProposalData[] {
  const n = Number(count);
  if (count === "0") return [];
  if (count === "1") return MOCK_PROPOSALS.slice(0, 1);
  if (Number.isFinite(n) && n > 0 && n <= MOCK_PROPOSALS.length) {
    return MOCK_PROPOSALS.slice(0, n);
  }
  return MOCK_PROPOSALS;
}
