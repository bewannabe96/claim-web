import "server-only";

import { PrismaClient } from "@prisma/client";

/**
 * Prisma client 싱글톤 — 모든 DB 쿼리/트랜잭션의 단일 진입점.
 *
 * **사용 위치**:
 *   - features/<x>/queries.ts (read)
 *   - features/<x>/actions.ts (write + transaction)
 *   - page / component 에서 직접 import 금지 — 항상 features 경유.
 *
 * **연결 전략**:
 *   - Supabase Supavisor (transaction pooler, port 6543) 를 `DATABASE_URL` 로 사용.
 *   - `?pgbouncer=true&connection_limit=1` 쿼리 파라미터 권장 (env.example 참조).
 *   - 트랜잭션 (`prisma.$transaction(...)`) 은 풀러 transaction 모드에서 정상
 *     동작 — 트랜잭션 동안 한 커넥션을 점유하다 종료 시 반환.
 *
 * **HMR 안전성**:
 *   - Next.js dev 가 모듈을 재로드할 때마다 `new PrismaClient()` 가 생성되면
 *     커넥션 누수. `globalThis` 에 캐싱해 단일 인스턴스 보장.
 *   - production 빌드에서는 모듈이 한 번만 evaluate 돼 캐싱 불필요.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
