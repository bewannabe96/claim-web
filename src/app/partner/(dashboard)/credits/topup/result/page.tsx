import type { Metadata } from "next";

import { ResultShell } from "./_components/result-shell";
import { TopupAck } from "./_components/topup-ack";

export const metadata: Metadata = {
  title: "결제 결과",
  description: "크레딧 충전 결제 결과를 확인하세요.",
};

/**
 * 모바일 SDK redirectUrl 착지 페이지.
 *
 * PortOne SDK 가 모바일에서 결제창 종료 후 navigate. URL query:
 *   - 성공: `?paymentId=...`
 *   - 실패: `?paymentId=...&code=...&message=...&pgCode=...&pgMessage=...`
 *
 * 처리:
 *   - code 있음 → 실패 안내 + 재시도 링크 (순수 render).
 *   - code 없음 → <TopupAck> (클라이언트) 가 마운트 후 acknowledgeTopup 호출 → 잔액 갱신.
 *     ack 가 revalidatePath 를 호출하므로 server render 안에서 await 할 수 없음 (Next 16:
 *     mutation 은 render 밖에서만). 그래서 클라이언트 컴포넌트로 위임.
 *
 * 인증: (dashboard) layout 의 requirePartnerSession 이 보장. acknowledgeTopup 내부에서
 *       partnerId 교차 검증 한 번 더.
 *
 * cacheComponents: searchParams 사용으로 자동 dynamic. 루트 loading.tsx 가 fallback.
 */
export default async function TopupResultPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentId?: string;
    code?: string;
    message?: string;
    pgCode?: string;
    pgMessage?: string;
  }>;
}) {
  const params = await searchParams;
  const paymentId = params.paymentId;
  const code = params.code;

  if (!paymentId) {
    return (
      <ResultShell
        tone="error"
        title="결제 정보가 없어요"
        body="잘못된 경로로 도착했어요. 다시 시도해주세요."
        cta="크레딧 페이지로"
        href="/partner/credits"
      />
    );
  }

  if (code) {
    return (
      <ResultShell
        tone="error"
        title="결제가 완료되지 않았어요"
        body={params.message ?? params.pgMessage ?? `오류 코드: ${code}`}
        cta="다시 충전하기"
        href="/partner/credits/topup"
      />
    );
  }

  return <TopupAck paymentId={paymentId} />;
}
