/**
 * Prisma seed — 로컬 dev DB 초기 데이터.
 *
 * 멱등: upsert / 존재 검사 후 create 만 사용. 매 `pnpm workspace:setup` 마다 호출돼도 안전.
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
 * **phone** — `LOCAL_DEV_PARTNER_PHONE` 으로 override (실 본인인증 시 매칭 키).
 *
 * **단계 진행**: invitation 은 `linkedAuthId=NULL, phoneVerifiedAt=NULL` 상태로
 * 시드됨 → 진입 시 항상 "카카오톡으로 시작" 버튼 노출. Kakao OAuth 통과 후 콜백이
 * linkedAuthId 를 갱신하고 `/verify` 로 forward → 본인인증 placeholder (6자리
 * OTP) 통과 시 가입 완료. 매 진입마다 새 OAuth 가 강제되므로 다른 카카오 계정으로
 * 재시도해도 그대로 진행 가능 — 횡령 방지는 PortOne 의 phone 매칭이 담당.
 *
 * **재시드 정책**: 이미 존재하면 skip (소비/미소비 무관). consume 후 재테스트하려면
 * admin UI 에서 초청 + 파생된 partner 를 수동 삭제. 만료 임박 / token 회전이
 * 필요하면 admin UI 의 reissue.
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
    },
  });
  console.log(
    `[seed] partner_invitation ready — /partner/signup/${DEV_INVITATION_TOKEN}`,
  );
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
