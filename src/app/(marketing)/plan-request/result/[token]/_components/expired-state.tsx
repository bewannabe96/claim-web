import { SearchOffIcon, StatusScreen } from "@/components/status-screen";

/**
 * 결과 토큰 만료 — dispatchedAt + app_settings.resultRetentionDays 경과.
 *
 * 페이지가 자체 BrandMark 를 렌더 하므로 showBrand={false}. 새로 매칭 요청을
 * 유도하는 primary CTA 한 개.
 */
export function ExpiredState() {
  return (
    <StatusScreen
      icon={<SearchOffIcon />}
      tone="neutral"
      showBrand={false}
      title="결과 보관 기간이 종료됐어요"
      description="제안서 결과는 일정 기간만 유지돼요. 다시 매칭을 받고 싶다면 새 요청을 보내주세요."
      primary={{ label: "새로 매칭 요청하기", href: "/plan-request/new" }}
    />
  );
}
