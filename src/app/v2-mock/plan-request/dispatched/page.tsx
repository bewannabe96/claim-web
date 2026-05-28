import { MailIcon, StatusScreen } from "@/components/status-screen";

/* ============================================================
 * v2-mock 풀 수신 dispatched — wizard 마지막 submit 직후의 발송 완료 화면.
 *
 * v1 의 `/plan-request/[id]/dispatched/page.tsx` 와 동일한 StatusScreen 패턴을
 * 그대로 reuse. v1 의 동적 deadline 계산 (`computeRemainingHours`) 대신 mock 은
 * "최대 48시간" hardcoded — `submissionDeadlineHours` 의 기본값에 해당 (AppSettings).
 *
 * 사용자가 [워크스페이스로] 누르면 `/v2-mock/compare` 로 복귀. 그 시점의 워크스페이스
 * 에는 새 슬롯이 추가되어 있지 않다 — PRD §5.3 의 silent swap 정책 정착 (설계사가
 * 제안서를 보내는 시점에 알림톡으로 통보, 다음 방문 시 슬롯이 자연 합류). mock 은
 * 시간축 시뮬레이션 안 함 (v2-mock CLAUDE.md 의 "분석 swap UI" placeholder 표).
 * ============================================================ */
export default function V2MockDispatchedPage() {
  return (
    <StatusScreen
      icon={<MailIcon />}
      title="요청서가 전달됐어요"
      description={
        <>
          선택된 <span className="font-semibold text-black">5명</span>의
          설계사가 제안서를 준비하고 있어요. 최대{" "}
          <span className="font-semibold text-black">48시간</span> 안에 모두
          도착해요.
          <br />
          도착하면 카카오 알림톡으로 알려드릴게요.
        </>
      }
      primary={{ label: "워크스페이스로", href: "/v2-mock/compare" }}
    />
  );
}
