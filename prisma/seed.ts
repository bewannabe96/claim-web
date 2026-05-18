/**
 * Prisma seed — 로컬 dev DB 초기 데이터.
 *
 * 멱등: upsert / 존재 검사 후 create 만 사용. 매 `pnpm db:start` 마다 호출돼도 안전.
 *
 * 무엇을 채우나:
 *   1. claim.app_settings('app') — 운영 튜닝 단일 row. 없으면 src/server/settings.ts 의
 *      findUniqueOrThrow 가 admin UI 첫 진입에서 throw.
 *   2. claim.user + claim.admin — 본인 화이트리스트 (env 기반). 미설정 시 warn 만 하고 계속.
 *      /admin 안 들어가는 작업에는 무관.
 *   3. claim.partner_invitation — `/partner/signup/<token>` 흐름 dev 테스트용 1건.
 *      이미 존재하면 skip (consume 후 재시드 시 상태 충돌 방지). 새로 시작하려면
 *      admin UI 에서 삭제 후 재시드.
 *
 * Fixture (다수 Partner / PlanRequest 더미) 는 현재 분리 파일 없음. 필요해지면
 * `prisma/fixtures.ts` + 별도 script 로 분리 권장.
 */
import { PrismaClient } from "@prisma/client";

import { newId } from "../src/lib/id";

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "app" },
    update: {},
    create: { id: "app" },
  });
  console.log("[seed] app_settings('app') ready");

  await seedAdmin();
  await seedDevPartnerInvitation();
}

async function seedAdmin() {
  const adminAuthId = process.env.LOCAL_DEV_ADMIN_USER_ID;
  const adminEmail = process.env.LOCAL_DEV_ADMIN_EMAIL;
  if (!adminAuthId || !adminEmail) {
    console.warn(
      "[seed] LOCAL_DEV_ADMIN_USER_ID/EMAIL not set — admin login will fail. " +
        "Set them in .env (use your remote dev Supabase user UUID).",
    );
    return;
  }

  // 기존 user (authId 또는 email 매칭) 가 있는지 확인.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ authId: adminAuthId }, { email: adminEmail }] },
    select: { id: true },
  });

  const userId = existing?.id ?? newId();

  await prisma.user.upsert({
    where: { id: userId },
    update: {
      email: adminEmail,
      authId: adminAuthId,
      name: "Local Dev Admin",
    },
    create: {
      id: userId,
      email: adminEmail,
      authId: adminAuthId,
      name: "Local Dev Admin",
    },
  });
  await prisma.admin.upsert({
    where: { id: userId },
    update: { active: true },
    create: { id: userId, active: true },
  });
  console.log(`[seed] admin (${adminEmail}) ready`);
}

/**
 * Dev 용 sample partner_invitation — `/partner/signup/<token>` UI 테스트용.
 *
 * **id 와 token 은 고정 문자열** — dev 가 매번 같은 URL 로 진입 가능:
 *   http://localhost:3000/partner/signup/{DEV_INVITATION_TOKEN}
 *
 * **본인인증 (phoneVerifiedAt)**: dev 편의를 위해 자동으로 pre-verified 처리 (즉시
 * Kakao 가입 단계 노출). PortOne 본인인증 흐름 자체를 테스트하려면
 * `LOCAL_DEV_PARTNER_SKIP_VERIFY=false` 로 설정 — phoneVerifiedAt 미설정 상태로
 * 시드되어 인증 단계 UI 가 먼저 노출됨.
 *
 * **phone** — `LOCAL_DEV_PARTNER_PHONE` 으로 override (실 본인인증 시 매칭 키).
 *
 * **재시드 정책**: 이미 존재하면 skip. consume 후 재테스트하려면 admin UI 에서
 * 초청 + 파생된 partner 를 수동 삭제. (seed 가 consume 상태를 되돌리면 user/partner
 * UNIQUE 와 충돌할 수 있어 의도적으로 안 건드림.)
 */
async function seedDevPartnerInvitation() {
  const DEV_INVITATION_ID = "local_dev_inv001";
  const DEV_INVITATION_TOKEN = "local_dev_signup_token_for_testing";

  const existing = await prisma.partnerInvitation.findUnique({
    where: { id: DEV_INVITATION_ID },
    select: { id: true, consumedAt: true },
  });
  if (existing) {
    const state = existing.consumedAt ? "consumed" : "pending";
    console.log(
      `[seed] partner_invitation (${DEV_INVITATION_ID}) already exists [${state}], skipping`,
    );
    return;
  }

  const phone = process.env.LOCAL_DEV_PARTNER_PHONE ?? "01000000000";
  const name = process.env.LOCAL_DEV_PARTNER_NAME ?? "Dev Partner";
  // 기본 true — dev 가 본인인증 placeholder 단계를 건너뛰고 바로 Kakao 단계 확인.
  // false 설정 시 phoneVerifiedAt 미설정 → 인증 단계 UI 확인용.
  const skipVerify = process.env.LOCAL_DEV_PARTNER_SKIP_VERIFY !== "false";

  await prisma.partnerInvitation.create({
    data: {
      id: DEV_INVITATION_ID,
      name,
      phone,
      bio: "로컬 dev 환경 테스트용 placeholder 설계사",
      yearsOfExperience: 5,
      trustMetric: "고객 96% 만족 (dev placeholder)",
      licenseNumber: "DEV-LICENSE-001",
      active: true,
      token: DEV_INVITATION_TOKEN,
      // 1년 — dev 가 만료 리프레시 신경 안 쓰도록.
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      phoneVerifiedAt: skipVerify ? new Date() : null,
    },
  });
  console.log(
    `[seed] partner_invitation ready — /partner/signup/${DEV_INVITATION_TOKEN}` +
      (skipVerify
        ? " (pre-verified — set LOCAL_DEV_PARTNER_SKIP_VERIFY=false to test 본인인증 step)"
        : " (unverified — 본인인증 단계 UI 확인)"),
  );
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
