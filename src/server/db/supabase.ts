import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "./env";
import type { Database } from "./types";

/**
 * Supabase 서버 클라이언트 — service_role 키 사용.
 *
 * RLS bypass 권한이라 모든 스키마/row 에 접근 가능. **반드시 server-only**.
 * 호출은 features/<x>/queries.ts (read) 또는 actions.ts (write) 에서만 — 페이지 /
 * 컴포넌트 직접 import 금지.
 *
 * 모듈 스코프 싱글톤 — Next.js dev 의 모듈 재로드/HMR 시에도 새 인스턴스 1개만
 * 생성됨. 토큰 자동 갱신·세션 저장 비활성 (서버는 stateless 호출이라 불필요).
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  serverEnv.SUPABASE_URL,
  serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "public",
    },
  },
);

export type DbClient = typeof supabase;
