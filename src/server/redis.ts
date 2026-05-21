import "server-only";

import { Redis as UpstashRedis } from "@upstash/redis";
import IoRedis from "ioredis";
import { z } from "zod";

/**
 * Redis client — 백엔드 어댑터 뒤에 가려진 OTP/rate-limit 용 최소 API.
 *
 * 사용처:
 *   - `features/requests/actions.ts`            — 가입자 본인인증 OTP + IP rate limit
 *   - `app/partner/signup/[token]/actions.ts`   — 설계사 가입 본인인증 OTP + IP rate limit
 *
 * 백엔드 선택 (자동, getRedis() 호출 시점):
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 있음 → Upstash REST (HTTP).
 *     serverless (Vercel) 권장 — TCP lifecycle 문제 없음.
 *   - 그 외 (REDIS_URL 만) → ioredis (TCP). 로컬 Docker Redis 용.
 *
 * 호출부는 RedisClient 만 의존. 백엔드 교체 = 어댑터 추가 + env 토글.
 *
 * HMR 안전성: prisma 와 동일하게 globalThis 캐싱 — dev 모듈 재로드 시 커넥션 누수 방지.
 */

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts: { ex: number }): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  /** -2 = no key, -1 = no TTL, else ms remaining. */
  pttl(key: string): Promise<number>;
}

const EnvSchema = z
  .object({
    UPSTASH_REDIS_REST_URL: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).optional(),
  })
  .refine(
    (e) =>
      (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) || e.REDIS_URL,
    {
      message:
        "Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (prod) or REDIS_URL (local).",
    },
  );

const globalForRedis = globalThis as unknown as { redis?: RedisClient };

export function getRedis(): RedisClient {
  if (globalForRedis.redis) return globalForRedis.redis;
  const env = EnvSchema.parse({
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_URL: process.env.REDIS_URL,
  });
  const client =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? createUpstashAdapter(
          env.UPSTASH_REDIS_REST_URL,
          env.UPSTASH_REDIS_REST_TOKEN,
        )
      : createIoRedisAdapter(env.REDIS_URL!);
  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = client;
  }
  return client;
}

function createUpstashAdapter(url: string, token: string): RedisClient {
  const client = new UpstashRedis({
    url,
    token,
    // OTP 코드 ("000000", "123456" 등) 가 valid JSON number 로 보여 자동 파싱되는
    // 함정을 차단 — 우리 도메인은 항상 raw string 으로 다룬다.
    automaticDeserialization: false,
  });
  return {
    get: (key) => client.get<string>(key),
    set: async (key, value, { ex }) => {
      await client.set(key, value, { ex });
    },
    del: async (key) => {
      await client.del(key);
    },
    incr: (key) => client.incr(key),
    expire: async (key, seconds) => {
      await client.expire(key, seconds);
    },
    pttl: (key) => client.pttl(key),
  };
}

function createIoRedisAdapter(url: string): RedisClient {
  const client = new IoRedis(url, {
    // Server Action 안에서 호출되는 RPC. 빠르게 실패해야 사용자 응답을 막지 않음.
    maxRetriesPerRequest: 2,
    // 모듈 평가 시점이 아닌 첫 명령 시점에 connect — cold start 단계의 연결 실패가
    // 첫 invocation 자체를 망가뜨리는 것을 막는다.
    lazyConnect: true,
  });
  // error 이벤트 미구독 시 ioredis 가 "Unhandled error event" 로 노이즈만 쌓음.
  client.on("error", (err) => {
    console.error("[redis] connection error", err);
  });
  return {
    get: (key) => client.get(key),
    set: async (key, value, { ex }) => {
      await client.set(key, value, "EX", ex);
    },
    del: async (key) => {
      await client.del(key);
    },
    incr: (key) => client.incr(key),
    expire: async (key, seconds) => {
      await client.expire(key, seconds);
    },
    pttl: (key) => client.pttl(key),
  };
}
