import { CheckIcon, StatusScreen } from "@/components/status-screen";

export default function AssignmentDonePage() {
  return (
    <StatusScreen
      icon={<CheckIcon />}
      title="제출 완료"
      description="진설계가 정상적으로 제출되었어요. 가입자에게 알림톡으로 결과가 전달돼요."
      primary={{ label: "홈으로", href: "/" }}
      showBrand={false}
    />
  );
}
