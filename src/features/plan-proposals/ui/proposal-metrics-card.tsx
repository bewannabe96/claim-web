import type { ProposalMetrics } from "./chart-types";

/**
 * 제안서 핵심 수치 카드 — 보험사 / 매월 납입료 / 계약 구조.
 *
 * 구조적 `ProposalMetrics` 만 받으므로 어느 버전 ViewData (V5AnalysisViewData 등)
 * 든 그대로 props 로 전달 가능. 결과 페이지 / 어드민 미리보기 / 랜딩 데모 공유.
 *
 * 계약 구조는 label/value pair 대신 친근한 sentence 리스트로 — 일반인이
 * 보험 용어(해지환급금 / 갱신형 담보 등)를 몰라도 읽히게 키워드만 굵게.
 */
export function ProposalMetricsCard({ metrics }: { metrics: ProposalMetrics }) {
  return (
    <section className="flex flex-col gap-5 rounded-xl bg-[#f8f8f8] p-5">
      <div>
        <p className="text-xs text-[#4b4b4b]">{metrics.insurer}</p>
        <p className="mt-3 text-xs text-[#4b4b4b]">매달 내는 보험료</p>
        <p className="mt-0.5 text-[2.25rem] leading-none font-bold tracking-tight text-black">
          {metrics.monthlyPremium.toLocaleString("ko-KR")}
          <span className="ml-1 text-base font-medium text-[#4b4b4b]">원</span>
        </p>
      </div>
      <ul className="flex flex-col gap-3 text-sm leading-snug text-[#4b4b4b]">
        <li>
          <span className="font-semibold text-black">
            {metrics.paymentYears}년 동안
          </span>{" "}
          매달 보험료를 내야 해요
        </li>
        <li>
          <span className="font-semibold text-black">
            {metrics.maturityAge}세까지
          </span>{" "}
          보장받을 수 있어요
        </li>
        <li>
          {metrics.hasRefundDuringPayment ? (
            <>
              납입기간 중 해지해도{" "}
              <span className="font-semibold text-black">낸 돈의 일부</span>를
              돌려받을 수 있어요
            </>
          ) : (
            <>
              납입기간 중 해지하면{" "}
              <span className="font-semibold text-black">
                낸 돈을 돌려받지 못해요
              </span>
            </>
          )}
        </li>
        <li>
          {metrics.hasRenewableRider ? (
            <>
              보험료가{" "}
              <span className="font-semibold text-black">
                {metrics.renewalIntervalYears
                  ? `${metrics.renewalIntervalYears}년마다`
                  : "주기적으로"}
              </span>{" "}
              조금씩 인상돼요
            </>
          ) : (
            <>
              보험료가 <span className="font-semibold text-black">끝까지</span>{" "}
              그대로예요
            </>
          )}
        </li>
      </ul>
    </section>
  );
}
