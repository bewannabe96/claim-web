import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { isProductionEnv } from "@/lib/env-stage";

/**
 * robots.txt 동적 생성.
 *
 * 비프로덕션(dev / staging / preview / qa …)에서는 전 경로 크롤링을 차단 —
 * 검색 결과에 비운영 환경이 노출·색인되는 사고 방지. middleware 의
 * `X-Robots-Tag: noindex …` 헤더와 이중 방어:
 *   - robots.txt `Disallow: /`  → 크롤(수집) 자체를 차단
 *   - X-Robots-Tag `noindex`    → 그래도 수집된 경우 색인 차단
 *
 * 프로덕션에선 기본 허용. robots.txt 에 `Disallow: /admin` 은 의도적으로
 * 넣지 않음 — 경로 존재를 노출하는 역효과. admin 크롤러 차단은 middleware 의
 * X-Robots-Tag + knock 404 가 책임 (docs/architecture.md §7).
 *
 * `connection()` — cacheComponents 활성 상태에서 robots.txt 가 빌드타임에
 * prerender 되지 않도록 강제. ENV_STAGE 를 요청 시점에 평가하므로 빌드
 * 산출물이 환경 간 재사용돼도 각 환경의 실제 stage 를 반영한다.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();

  if (!isProductionEnv()) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
  };
}
