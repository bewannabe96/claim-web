/**
 * 결과 페이지 article 끝 disclaimer + 결과 유지 기간 안내.
 *
 * `ProposalResultView` 의 `footer` slot 에 가입자 (`ResultView`) / read-only
 * (`PreviewResultView`) wrapper 가 동일하게 주입. 가입자 화면을 정확히 mirror 한다는
 * preview 의도가 깨지지 않도록 한 컴포넌트로 통합.
 *
 * 레이아웃: `article` 의 `pb-32` 안이라 fixed CTA 에 가려지지 않음. `gap-4` 로
 * disclaimer 와 보관기간 사이 분리, `-mt-4` 로 직전 attribution 카드와의 `gap-16` 을
 * 살짝 좁힘.
 */
export function ResultFooter({
  resultRetentionDays,
}: {
  /** admin 이 설정한 결과 보관 기간 (일). */
  resultRetentionDays: number;
}) {
  return (
    <div className="flex flex-col gap-4 text-xs text-[#afafaf] text-center leading-relaxed -mt-4">
      <p>
        설계사가 보내준 제안서를 약관 기준으로 객관 비교했어요.
        <br />
        AI 가 분석한 자료라 약간의 오차가 있을 수 있어요.
      </p>
      <p>결과는 {resultRetentionDays}일간 유지돼요</p>
    </div>
  );
}
