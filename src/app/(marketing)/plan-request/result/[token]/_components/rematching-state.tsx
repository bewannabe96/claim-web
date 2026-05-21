import { AlertIcon, StatusScreen } from "@/components/status-screen";

/**
 * 도착한 제안서가 0건인 경우 — 자동 재매칭 트리거 안내.
 *
 * PRD §5.7 — 1차에서 0명 제출이면 자동 재매칭. 가입자가 결과 페이지에 들어왔을 때
 * 아직 새 후보를 못 받았거나 받은 새 제안서가 없는 경우.
 */
export function RematchingState() {
  return (
    <StatusScreen
      icon={<AlertIcon />}
      tone="neutral"
      title="더 좋은 분들로 다시 찾고 있어요"
      description="처음 보내드린 설계사들의 응답이 늦어졌어요. 새 설계사들에게 다시 요청을 보냈으니 도착하면 알림톡으로 알려드릴게요."
    />
  );
}
