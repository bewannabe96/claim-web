/**
 * Prisma seed — 로컬 dev DB 초기 데이터.
 *
 * 멱등: upsert / 존재 검사 후 create / createMany(skipDuplicates) 패턴만 사용.
 * 매 `pnpm workspace:setup` 마다 호출돼도 안전.
 *
 * 무엇을 채우나:
 *   1. claim.app_settings('app') — 운영 튜닝 단일 row. 없으면 src/server/settings.ts 의
 *      findUniqueOrThrow 가 admin UI 첫 진입에서 throw.
 *   2. claim.user + claim.admin — 본인 화이트리스트 (env 기반). 미설정 시 warn 만 하고 계속.
 *      /admin 안 들어가는 작업에는 무관.
 *   3. claim.partner_invitation — `/partner/signup/<token>` 흐름 dev 테스트용 1건.
 *      이미 존재하면 skip (consume 후 재시드 시 상태 충돌 방지). 새로 시작하려면
 *      admin UI 에서 삭제 후 재시드.
 *   4. claim.user + claim.partner (+ claim.partner_credit_balance) — 예시 partner
 *      픽스처. 매칭 / 어드민 partner 리스트 / 크레딧 화면 즉시 점검용. invitation+OAuth+OTP
 *      흐름을 우회하므로 dev seed 전용 (authId 미연결 → /partner 로그인 불가).
 *   5. claim.partner_credit_balance — 모든 partner 에 balance row 보장
 *      (`Partner.exists ⇔ PartnerCreditBalance.exists` 불변식). 결제 flow 가 전제하는
 *      조건. 신규 가입 + 예시 픽스처는 자체 tx 에서 eager-create 하므로 이 단계는
 *      그 외 경로 (수동 SQL / balance row 만 삭제된 케이스) 의 보정용.
 *
 * Fixture 가 더 커지면 `prisma/fixtures.ts` + 별도 script 로 분리 권장.
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
  await seedExamplePartners();
  await seedPartnerCreditBalances();
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
 * linkedAuthId 를 갱신하고 `/verify` 로 forward → 휴대폰 OTP (알리고 SMS, dev 에서
 * `ALIGO_TEST_MODE=Y` 면 코드 "000000" 고정) 통과 시 가입 완료. 매 진입마다 새 OAuth
 * 가 강제되므로 다른 카카오 계정으로 재시도해도 그대로 진행 가능 — 횡령 방지는
 * SMS 발송 대상이 invitation.phone 으로 고정된다는 점이 담당.
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

/**
 * 예시 partner 픽스처 — 매칭 / 어드민 partner 리스트 / 크레딧 화면 즉시 점검용.
 *
 * `verifyPartnerSignupOtp` 와 동일 패턴 — user / partner / partnerCreditBalance 를 단일
 * 트랜잭션으로 INSERT 해 `Partner.exists ⇔ PartnerCreditBalance.exists` 불변식을 만족.
 * invitation+OAuth+OTP 가입 흐름을 우회하므로 **dev seed 전용**: authId 미연결이라
 * `/partner` 대시보드 로그인 불가. 로그인 흐름 테스트는 `seedDevPartnerInvitation` 의
 * invitation 으로 진행할 것.
 *
 * 멱등성: user.id 존재 시 skip. 픽스처 데이터 변경 후 재반영하려면 admin UI 에서 해당
 * partner 를 삭제 (cascade 로 partner / balance / ledger 함께 정리) 후 재시드.
 *
 * 데이터 충돌 회피:
 *   - id: `dev_partner_` prefix + 0001~ — 16자 nanoid 와 길이만 비슷, 형식은 일부러
 *     달라 진짜 partner 와 시각 구분.
 *   - email: `example.com` (RFC 2606 문서/테스트 예약 도메인).
 *   - phone: `0109999XXXX` 대역 — 운영 가입 phone 과 안전 거리.
 *   - licenseNumber: `DEV-PARTNER-XXXX` — UNIQUE 충돌 회피 + audit 시 시드 출처 식별.
 */
const EXAMPLE_PARTNERS = [
  {
    id: "dev_partner_0001",
    email: "dev1@example.com",
    name: "김민준",
    phone: "01099990001",
    bio: "15년차 종합손해사정 — 자동차 / 화재 / 배상 전 영역 대응 (dev placeholder).",
    yearsOfExperience: 15,
    trustMetric: "재계약률 92% (dev placeholder)",
    licenseNumber: "DEV-PARTNER-0001",
  },
  {
    id: "dev_partner_0002",
    email: "dev2@example.com",
    name: "이서연",
    phone: "01099990002",
    bio: "5년차 — 고객 상황별 맞춤 분석 + 분쟁 사례 데이터 기반 협상 (dev placeholder).",
    yearsOfExperience: 5,
    trustMetric: "고객 만족도 4.8/5.0 (dev placeholder)",
    licenseNumber: "DEV-PARTNER-0002",
  },
  {
    id: "dev_partner_0003",
    email: "dev3@example.com",
    name: "박도윤",
    phone: "01099990003",
    bio: "신규 진입 1년차 — 빠른 응답 + 디지털 친화 (dev placeholder).",
    yearsOfExperience: 1,
    trustMetric: "응답 평균 5분 (dev placeholder)",
    licenseNumber: "DEV-PARTNER-0003",
  },
] as const;

async function seedExamplePartners() {
  let created = 0;
  for (const p of EXAMPLE_PARTNERS) {
    const existing = await prisma.user.findUnique({
      where: { id: p.id },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: p.id,
          email: p.email,
          name: p.name,
          phone: p.phone,
          // authId 의도적 null — OAuth 미연결 (로그인 불가, 매칭 / 어드민 화면 노출은 가능).
        },
      });
      await tx.partner.create({
        data: {
          id: p.id,
          bio: p.bio,
          yearsOfExperience: p.yearsOfExperience,
          trustMetric: p.trustMetric,
          licenseNumber: p.licenseNumber,
          active: true,
        },
      });
      await tx.partnerCreditBalance.create({
        data: { partnerId: p.id },
      });
    });
    created++;
  }
  console.log(
    `[seed] example partners — ${EXAMPLE_PARTNERS.length} fixture(s) checked, ${created} new partner(s) created`,
  );
}

/**
 * `Partner.exists ⇔ PartnerCreditBalance.exists` 불변식 유지.
 *
 * 결제 flow (initiateTopup / confirmTopup / spendCredit / applyLedger) 는 모든 partner
 * 에 balance row 존재를 전제. 정상 가입 트랜잭션 (verifyPartnerSignupOtp) 과 예시
 * 픽스처 (seedExamplePartners) 는 자체 tx 에서 eager-create 하므로, 시더는 그 외 경로의
 * 누락을 메우는 catch-all:
 *   - eager-create 도입 이전에 가입한 레거시 dev partner
 *   - 가입 트랜잭션 외 경로로 직접 INSERT 된 partner (수동 SQL)
 *   - balance row 만 수동 삭제된 케이스
 *
 * `createMany(skipDuplicates: true)` 단일 쿼리 — partnerId 가 PK 라 기존 row 는 자동
 * skip. balance/version 컬럼은 schema default (0) 사용.
 */
async function seedPartnerCreditBalances() {
  const partners = await prisma.partner.findMany({ select: { id: true } });
  if (partners.length === 0) return;

  const result = await prisma.partnerCreditBalance.createMany({
    data: partners.map((p) => ({ partnerId: p.id })),
    skipDuplicates: true,
  });
  console.log(
    `[seed] partner_credit_balance — ${partners.length} partner(s) checked, ${result.count} new row(s) created`,
  );
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
