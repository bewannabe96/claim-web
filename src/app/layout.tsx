import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

import { EnvBanner } from "@/components/env-banner";

/**
 * Pretendard 한국어 subset — 정적 cut 4종 (400/500/600/700).
 *
 * 가변(variable) 폰트 풀세트 (~2.0MB) 는 critical resource 큐를 통째로
 * 점유해 FCP 를 늦췄다. 코드 인벤토리 결과 실 사용 weight 는 400/500/600/700
 * 만이라 (900 은 dev-only EnvBanner 1회 — 700 으로 합성 처리 OK), 정적 cut
 * 4개로 교체. 합계 ~1.05MB, FCP 시점엔 첫 paint 에 필요한 1개 weight 만
 * preload 되어 critical path 영향이 1/8 수준으로 떨어진다.
 *
 * subset 글리프 범위: 한국어 자주 사용 글자 + ASCII + 기본 기호. 보험/도메인
 * 텍스트는 모두 커버. 미커버 글리프는 fallback 폰트로 자연스럽게 그려짐.
 *
 * self-host (next/font/local) — 외부 요청 없음, layout shift 없음.
 * 출처: https://github.com/orioncactus/pretendard (woff2-subset 정적 빌드)
 */
const pretendard = localFont({
  src: [
    {
      path: "./fonts/Pretendard-Regular.subset.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Pretendard-Medium.subset.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/Pretendard-SemiBold.subset.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/Pretendard-Bold.subset.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pretendard",
  display: "swap",
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

// iOS Safari 는 font-size < 16px 인 input/textarea/select 에 focus 시 자동 zoom-in 한다.
// maximumScale=1 로 zoom 자체를 잠가서 input font-size 를 자유롭게 설정할 수 있게 함.
// 트레이드오프: pinch-zoom 도 차단됨 (WCAG 1.4.4) — 디자인 일관성 우선 결정.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
