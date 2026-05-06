import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { getRequestByResultToken } from "@/features/requests/queries";
import { listProposalCardsForRequest } from "@/features/proposals/queries";

import { ResultView } from "./_components/result-view";

/**
 * 결과 열람 — 알림톡 일회용 토큰으로 진입.
 * PRD §5.6 — 가입자가 모든 진설계를 한 자리에서 비교, 마음에 드는 설계사에게 즉시 문자.
 */
export default async function ResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const req = await getRequestByResultToken(token);
  if (!req) notFound();

  const cards = await listProposalCardsForRequest(req.id);
  const expectedCount = req.selectedAgentIds.length;

  return (
    <main className="flex flex-col flex-1 px-6 pt-10 pb-8 bg-white">
      <BrandMark />

      <header className="mt-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-[1.22] tracking-tight text-black">
          진설계{" "}
          <span className="text-black">{cards.length}건</span>
          이 도착했어요
        </h1>
        {cards.length < expectedCount && (
          <p className="text-sm text-[#4b4b4b]">
            선택하신 {expectedCount}명 중{" "}
            <span className="font-semibold text-black">{cards.length}명</span>의
            설계사가 진설계를 보내주셨어요
          </p>
        )}
      </header>

      <ResultView cards={cards} />
    </main>
  );
}
