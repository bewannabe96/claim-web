import "server-only";

import Redis from "ioredis";
import { z } from "zod";

/**
 * Redis client 싱글톤 — OTP 코드 저장 + IP 레이트리밋 카운터 보관처.
 *
 * 사용처:
 *   - `features/requests/actions.ts`
 *     - `sendOtp`     : 코드 발급 (`SET ... EX 180`) + IP rate counter (`INCR / EXPIRE NX`).
 *     - `finalizeRequest` : 코드 검증 (`GET / DEL`).
 *
 * 연결 전략:
 *   - 로컬 dev: `pnpm workspace:setup` 이 worktree 별 Docker redis 컨테이너 +
 *     `.env.local` 의 REDIS_URL 자동 생성. SessionEnd hook 이 down -v 로 정리.
 *   - prod (Vercel): managed Redis (Upstash / ElastiCache 등) 의 URL 을 env 로.
 *
 * HMR 안전성: prisma 와 동일하게 globalThis 캐싱 — dev 모듈 재로드 시 커넥션 누수 방지.
 */

const EnvSchema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL missing"),
});

const globalForRedis = globalThis as unknown as {
  redis?: Redis;
};

export function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;
  const env = EnvSchema.parse({ REDIS_URL: process.env.REDIS_URL });
  const client = new Redis(env.REDIS_URL, {
    // Server Action 안에서 호출되는 RPC. 빠르게 실패해야 사용자 응답을 막지 않음.
    maxRetriesPerRequest: 2,
    // 모듈 로드 시점이 아닌 첫 명령 시점에 connect — lazy-init 의 의미를 살림.
    lazyConnect: false,
    // offline queue 는 ON 유지 (default). 첫 명령 직전 connect 가 완료 안 됐을 때
    // 짧게 queueing → 연결 직후 flush. OFF 로 두면 ioredis 가 즉시 throw 함.
  });
  // dev 에서만 캐싱. prod 빌드는 모듈이 1회만 evaluate.
  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = client;
  }
  return client;
}
