import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  /**
   * dev 모드에서 non-localhost 접근(같은 LAN의 모바일 등) 시 RSC payload /
   * Server Action 요청이 cross-origin 으로 차단되는 문제 해결.
   * 노출하려는 모든 LAN IP / 호스트네임을 등록.
   *
   * - 본인 머신 IP 가 바뀌면 여기도 갱신 (or 와일드카드 패턴 사용 가능).
   * - 프로덕션 배포에는 영향 없음 (dev 전용 설정).
   *
   * 참고: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: ["192.168.20.137", "172.30.1.77", "*.local"],
};

export default nextConfig;
