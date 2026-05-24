import { listPriceTiers } from "@/features/plan-request-pricing/queries";

import { ChatbotShell } from "./chatbot-shell";

/**
 * 랜딩 변형 V4 — 챗봇 풀스크린 랜딩.
 *
 * v3 의 정적 1뷰포트 + 단일 CTA → 새 요청서 페이지로 이동하는 funnel 을, 같은
 * 화면에서 챗봇 대화 한 흐름으로 압축. AI 어시스턴트가 묻는 항목에 사용자가
 * 칩/카드/짧은 입력으로 답하면 Step1 → 자동 후보 배정 → Step3 본인인증 →
 * dispatched 까지 페이지 전환 없이 진행.
 *
 * 가설:
 *   - "요청서 작성" 의 무게감 대신 "상담사가 묻는 걸 답한다" 는 부드러운 UX
 *   - 페이지 전환 0 → 단계별 이탈률 ↓
 *   - 후보 선택 / 자동 배정을 사용자에게 완전히 은닉 → "내 정보로 뭔가 자동으로
 *     처리된다" 는 감지 없음
 *
 * 부모(server component) 가 boundary value 두 가지만 prefetch 해서 client 에
 * 내림: price tiers (보험료 chip), googleAdsConversionTarget (Q1 의 첫 응답
 * 클릭이 광고 conversion firing — 챗봇은 자체 "전환 CTA" 가 없어 첫 인터랙션을
 * conversion 지점으로 본다).
 */
export async function VariantV4({
  googleAdsConversionTarget,
}: {
  googleAdsConversionTarget: string | undefined;
}) {
  const priceTiers = await listPriceTiers();

  return (
    <ChatbotShell
      priceTiers={priceTiers}
      googleAdsConversionTarget={googleAdsConversionTarget}
    />
  );
}
