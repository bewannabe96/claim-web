import "server-only";

import { z } from "zod";

/**
 * 서버 전용 환경 변수 검증.
 *
 * `process.env` 를 직접 쓰지 말고 항상 `serverEnv` 를 import — 미설정 시 즉시 throw.
 * service_role 키는 절대 client bundle 에 노출되면 안 됨 (`NEXT_PUBLIC_` prefix 금지).
 */

const ServerEnvSchema = z.object({
  /** Supabase project URL — `https://<ref>.supabase.co` */
  SUPABASE_URL: z.url("SUPABASE_URL is not a valid URL"),
  /**
   * Service role key — RLS bypass. Server Action / queries 에서만 사용.
   * 절대 NEXT_PUBLIC_ 변수에 넣지 말 것.
   */
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, "SUPABASE_SERVICE_ROLE_KEY missing"),
});

export const serverEnv = ServerEnvSchema.parse({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
