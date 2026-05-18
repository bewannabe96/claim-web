/**
 * Prisma seed — 로컬 dev DB 초기 데이터.
 *
 * 멱등: upsert 만 사용. 매 `pnpm db:start` 마다 호출돼도 안전.
 *
 * 무엇을 채우나:
 *   1. claim.app_settings('app') — 운영 튜닝 단일 row. 없으면 src/server/settings.ts 의
 *      findUniqueOrThrow 가 admin UI 첫 진입에서 throw.
 *   2. claim.admin_users — 본인 화이트리스트 (env 기반). 미설정 시 warn 만 하고 계속.
 *      /admin 안 들어가는 작업에는 무관.
 *
 * Fixture (Partner, PlanRequest 더미) 는 prisma/fixtures.ts 에 분리. 매칭 흐름
 * 테스트할 때만 `pnpm db:seed:fixtures` 로 별도 실행.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "app" },
    update: {},
    create: { id: "app" },
  });
  console.log("[seed] app_settings('app') ready");

  const adminId = process.env.LOCAL_DEV_ADMIN_USER_ID;
  const adminEmail = process.env.LOCAL_DEV_ADMIN_EMAIL;
  if (adminId && adminEmail) {
    await prisma.adminUser.upsert({
      where: { id: adminId },
      update: { email: adminEmail, active: true },
      create: {
        id: adminId,
        email: adminEmail,
        active: true,
        name: "Local Dev Admin",
      },
    });
    console.log(`[seed] admin_users(${adminEmail}) ready`);
  } else {
    console.warn(
      "[seed] LOCAL_DEV_ADMIN_USER_ID/EMAIL not set — admin login will fail. " +
        "Set them in .env (use your remote dev Supabase user UUID).",
    );
  }
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
