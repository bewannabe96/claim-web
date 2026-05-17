import type { Metadata } from "next";

/**
 * /admin/* 공통 layout.
 *
 * 역할은 metadata robots noindex 적용뿐. UI 는 자식 (dashboard) layout 과
 * login 페이지가 각자 책임. 여기서 metadata.robots 를 두면 HTML `<meta
 * name="robots">` 가 모든 admin 페이지 (`/admin/login` 포함) 에 자동 주입됨.
 *
 * 1차 방어는 proxy.ts 의 X-Robots-Tag HTTP 헤더. 여기 metadata 는 redundancy.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
