import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Pretendard 가변(variable) 폰트.
 * 한글 글리프를 포함한 모던 산세리프. 가중치 45–920 지원.
 *
 * self-host (next/font/local) — 외부 요청 없음, layout shift 없음.
 * 출처: https://github.com/orioncactus/pretendard
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    // 랜딩 (/) 처럼 page metadata 가 title 을 안 주는 경우 default 사용.
    default: "Partner Match — 보험 설계사 매칭",
    // 자식 페이지가 `title: "요청서 작성"` 만 주면 "요청서 작성 | CLAIM" 으로 합성.
    template: "%s | CLAIM",
  },
  description:
    "관심 보장 분야를 입력하면 검증된 설계사가 맞춤 보험 제안서를 보내드립니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased bg-[#efefef]`}
    >
      {/*
       * 480px 모바일 컨테이너 / PC 와이드 컨테이너는 각 route group 의 layout 에서
       * 결정. body 는 bg + min-height 만 책임.
       */}
      <body className="min-h-full flex flex-col bg-[#efefef]">
        {children}
      </body>
    </html>
  );
}
