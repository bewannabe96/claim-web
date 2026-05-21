import {
  SearchOffIcon,
  StatusScreen,
} from "@/components/status-screen";

export default function NotFound() {
  return (
    <StatusScreen
      icon={<SearchOffIcon />}
      tone="neutral"
      title="페이지를 찾을 수 없어요"
      description="요청하신 페이지가 이동되었거나 더 이상 존재하지 않아요."
      primary={{ label: "홈으로", href: "/" }}
    />
  );
}
