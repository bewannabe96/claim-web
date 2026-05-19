import "server-only";

import { z } from "zod";

/**
 * 서비스 표시 이름 — 사용자 노출 문구에 박힘.
 *
 * 현재 사용처: `src/server/aligo.ts` 의 SMS 본문 prefix `[<서비스명>] ...`.
 * 추후 이메일 / 알림톡 등 다른 사용자 문구 채널에서도 공유.
 *
 * env: `SERVICE_NAME` (.env / .env.example). 클라이언트 컴포넌트에서도 필요해지면
 * `NEXT_PUBLIC_SERVICE_NAME` 추가 + 별도 export 신설할 것.
 */

const Schema = z.string().min(1, "SERVICE_NAME missing");
let cached: string | null = null;

export function getServiceName(): string {
  if (cached) return cached;
  cached = Schema.parse(process.env.SERVICE_NAME);
  return cached;
}
