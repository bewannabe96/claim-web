import type { Metadata } from "next";

/**
 * /plan-request/* 공통 layout.
 *
 * 역할은 metadata robots noindex 적용뿐 (UI 셸은 부모 (marketing)/layout 이 책임).
 * 가입자별 개인 데이터 흐름 (요청서 wizard / 본인인증 / 결과 토큰) 이라 검색 노출
 * 차단. 랜딩 (/) 만 indexable 로 두고 wizard 진입부 (/plan-request/new) 부터는
 * noindex.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PlanRequestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
