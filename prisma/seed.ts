/**
 * Prisma seed — 로컬 dev DB 초기 데이터.
 *
 * 멱등 (matching/lookup → skip or upsert) — `pnpm workspace:setup` 가 매 부팅
 * 마다 호출해도 안전. fixture 변경 후 반영하려면 `pnpm db:reset` 또는 어드민
 * UI 에서 해당 row 삭제 후 재시드.
 *
 * 시드 대상 (의존 순서):
 *   1. claim.app_settings        — 단일 'app' row + scenario_priority 백필
 *   2. claim.user + claim.admin  — env 기반 본인 화이트리스트
 *   3. claim.plan_request_price_tier — step1 wizard 가 동적 로드
 *   4. claim.partner_signup_invitation — `/partner/signup/<token>` UI 테스트용
 *   5. claim.user + partner + partner_credit_balance + partner_assignment_stats
 *      — 예시 설계사 fixture (다양한 연차/balance/debt 조합)
 *   6. catch-all: 기존 partner 의 balance / stats row 누락 백필 (invariant)
 *   7. claim.partner_credit_ledger — topup/spend/adjustment/refund 4종 샘플
 *   8. claim.admin_notification — 미확인 벨 배지 / 드롭다운 화면 점검용
 *
 * 의도적으로 시드 안 하는 것:
 *   - plan_request / assignment / proposal / analysis_report
 *     → 실제 가입자 흐름 (`/plan-request/new`) 으로 만드는 게 더 충실. 시드는
 *       제안서 PDF / 분석 콜백을 흉내낼 수 없어 어차피 반쪽짜리가 됨.
 *
 * Fixture 가 더 커지면 `prisma/fixtures/` + 별도 스크립트로 분리 권장.
 */
import { PrismaClient } from "@prisma/client";

import { KNOWN_CATEGORIES } from "../src/features/plan-proposals/category-labels";
import { newId } from "../src/lib/id";

const prisma = new PrismaClient();

/* ============================================================
 * Fixture 상수 — 모든 정적 데이터는 main() 위에 모아둠.
 * id / token / phone / license 충돌 회피 정책:
 *   - id: `dev_*` prefix — 진짜 nanoid 와 시각 구분 + audit 시 시드 출처 식별.
 *   - email: `example.com` (RFC 2606 문서/테스트 예약 도메인).
 *   - phone: `010-9999-XXXX` 대역 — 운영 가입 phone 과 안전 거리.
 *   - licenseNumber: `DEV-PARTNER-XXXX` — UNIQUE 충돌 회피 + 출처 식별.
 * ============================================================ */

const DEFAULT_PRICE_TIERS = [
  { position: 0, budgetMin: 0,       budgetMax: 49_999,    price: 10_000 },
  { position: 1, budgetMin: 50_000,  budgetMax: 100_000,   price: 20_000 },
  { position: 2, budgetMin: 100_000, budgetMax: 200_000,   price: 30_000 },
  { position: 3, budgetMin: 200_000, budgetMax: 300_000,   price: 50_000 },
  { position: 4, budgetMin: 300_000, budgetMax: 500_000,   price: 80_000 },
  { position: 5, budgetMin: 500_000, budgetMax: 9_999_999, price: 100_000 },
] as const;

const DEV_INVITATION = {
  id: "local_dev_inv001",
  token: "local_dev_signup_token_for_testing",
  // 1년 — dev 가 만료 리프레시 신경 안 쓰도록.
  expiresInDays: 365,
  fallbackPhone: "01000000000",
  fallbackName: "Dev Partner",
} as const;

type PartnerFixture = {
  id: string;
  email: string;
  name: string;
  phone: string;
  bio: string;
  yearsOfExperience: number;
  trustMetric: string;
  licenseNumber: string;
  active: boolean;
  /** 배정 카운터 — funnel 관계 (exposure ≥ selected ≥ contacted) 유지. */
  stats: { exposureCount: number; selectedCount: number; contactedCount: number };
  /** 시드 ledger 시퀀스. 항목은 시간순 — 누적이 balance/debt 와 일치하도록 작성. */
  ledger: LedgerSeed[];
};

type LedgerSeed =
  | { type: "topup"; amount: number; paymentId: string; reason?: string }
  | { type: "spend"; amount: number; referenceType: string; referenceId: string; reason?: string }
  | { type: "adjustment"; amount: number; reason: string }
  | { type: "refund"; amount: number; paymentId: string; cancellationId: string; reason: string };

/**
 * 5인 설계사 fixture — 매칭 카드 / 어드민 partner 리스트 / 크레딧 화면을 한 번에 점검.
 *
 * 다양성:
 *   - 연차: 1 / 3 / 5 / 8 / 15
 *   - 활성: 4명 active=true, 1명 active=false (매칭 풀 제외 테스트)
 *   - 배정 funnel: 신규 (0/0/0) ~ 시니어 (20/8/3)
 *   - 크레딧 상태: 잔액 충만 / 부채 / 환불·조정 이력 / 무거래
 */
const EXAMPLE_PARTNERS: PartnerFixture[] = [
  {
    id: "dev_partner_0001",
    email: "dev1@example.com",
    name: "김민준",
    phone: "01099990001",
    bio: "15년차 종합손해사정 — 자동차 / 화재 / 배상 전 영역 대응 (dev placeholder).",
    yearsOfExperience: 15,
    trustMetric: "재계약률 92%",
    licenseNumber: "DEV-PARTNER-0001",
    active: true,
    stats: { exposureCount: 20, selectedCount: 8, contactedCount: 3 },
    ledger: [
      { type: "topup", amount: 100_000, paymentId: "dev_pay_0001a" },
      { type: "topup", amount: 100_000, paymentId: "dev_pay_0001b" },
      // 3건 contacted × 30_000 KRW 정산 ≈ 임의 사용 시뮬레이션
      { type: "spend", amount: 30_000, referenceType: "plan_request_settlement", referenceId: "dev_req_0001" },
    ],
  },
  {
    id: "dev_partner_0002",
    email: "dev2@example.com",
    name: "이서연",
    phone: "01099990002",
    bio: "5년차 — 고객 상황별 맞춤 분석 + 분쟁 사례 데이터 기반 협상 (dev placeholder).",
    yearsOfExperience: 5,
    trustMetric: "고객 만족도 4.8/5.0",
    licenseNumber: "DEV-PARTNER-0002",
    active: true,
    stats: { exposureCount: 15, selectedCount: 5, contactedCount: 2 },
    ledger: [
      { type: "topup", amount: 50_000, paymentId: "dev_pay_0002a" },
      { type: "spend", amount: 30_000, referenceType: "plan_request_settlement", referenceId: "dev_req_0002" },
    ],
  },
  {
    id: "dev_partner_0003",
    email: "dev3@example.com",
    name: "박도윤",
    phone: "01099990003",
    bio: "신규 진입 1년차 — 빠른 응답 + 디지털 친화 (dev placeholder).",
    yearsOfExperience: 1,
    trustMetric: "응답 평균 5분",
    licenseNumber: "DEV-PARTNER-0003",
    active: true,
    stats: { exposureCount: 3, selectedCount: 1, contactedCount: 0 },
    // 부채 시나리오: 충전 없이 spend → balance=0, debt=30_000.
    ledger: [
      { type: "spend", amount: 30_000, referenceType: "plan_request_settlement", referenceId: "dev_req_0003" },
    ],
  },
  {
    id: "dev_partner_0004",
    email: "dev4@example.com",
    name: "최서아",
    phone: "01099990004",
    bio: "8년차 — 가족 단위 종합설계 + 보험금 청구 대행 (dev placeholder).",
    yearsOfExperience: 8,
    trustMetric: "최근 1년 가입설계 240건",
    licenseNumber: "DEV-PARTNER-0004",
    active: true,
    stats: { exposureCount: 12, selectedCount: 6, contactedCount: 2 },
    // 충전→사용→조정→환불 4종 모두 표현.
    ledger: [
      { type: "topup", amount: 200_000, paymentId: "dev_pay_0004a" },
      { type: "spend", amount: 80_000, referenceType: "plan_request_settlement", referenceId: "dev_req_0004" },
      { type: "adjustment", amount: 10_000, reason: "이벤트 보상 (dev sample)" },
      { type: "refund", amount: 50_000, paymentId: "dev_pay_0004a", cancellationId: "dev_canc_0004a", reason: "고객 환불 요청 (dev sample)" },
    ],
  },
  {
    id: "dev_partner_0005",
    email: "dev5@example.com",
    name: "정민호",
    phone: "01099990005",
    bio: "3년차 — 자동차 / 일상생활 사고 전문 (dev placeholder, 비활성 풀).",
    yearsOfExperience: 3,
    trustMetric: "고객 96% 만족",
    licenseNumber: "DEV-PARTNER-0005",
    active: false,
    stats: { exposureCount: 0, selectedCount: 0, contactedCount: 0 },
    ledger: [],
  },
];

const SAMPLE_ADMIN_NOTIFICATIONS = [
  {
    type: "plan_request.dispatched",
    title: "새 요청서 — 김OO님 (월 15만원)",
    body: "5명 설계사에게 송부되었어요. 마감까지 48시간.",
    linkPath: "/admin/requests",
    readAt: null, // 미확인 — 벨 배지 카운트 대상
  },
  {
    type: "plan_request.dispatched",
    title: "새 요청서 — 박OO님 (월 8만원)",
    body: "3명 설계사에게 송부되었어요. 마감까지 48시간.",
    linkPath: "/admin/requests",
    readAt: null,
  },
  {
    type: "plan_request.dispatched",
    title: "새 요청서 — 이OO님 (월 20만원)",
    body: "5명 설계사에게 송부되었어요. 마감까지 48시간.",
    linkPath: "/admin/requests",
    // 확인됨 — 어제 시점.
    readAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
] as const;

/* ============================================================
 * main — 단순 의존 순서 (위 fixture 상수의 순서와 일치).
 * ============================================================ */

async function main() {
  await seedAppSettings();
  await seedAdmin();
  await seedPlanRequestPriceTiers();
  await seedDevPartnerSignupInvitation();
  await seedExamplePartners();
  await ensurePartnerInvariants();
  await seedPartnerCreditLedger();
  await seedAdminNotifications();
}

/* ============================================================
 * 1. app_settings — 단일 row + scenario_priority 백필
 * ============================================================
 * `'app'` row 가 없으면 `server/settings.ts` 의 findUniqueOrThrow 가 admin UI
 * 첫 진입에서 throw. 신규 row 는 `scenarioPriority` 를 KNOWN_CATEGORIES 로 초기
 * 화 — 결과 페이지 chip 정렬이 즉시 의미를 갖도록. 기존 row 의 `scenario_
 * priority` 는 admin 이 편집한 값을 보존해야 하므로 update 시 건드리지 않음.
 */
async function seedAppSettings() {
  const result = await prisma.appSettings.upsert({
    where: { id: "app" },
    // 기존 row 는 admin 이 편집한 값을 보존 — touch 안 함.
    update: {},
    create: {
      id: "app",
      scenarioPriority: [...KNOWN_CATEGORIES],
    },
  });
  console.log(
    `[seed] app_settings('app') ready (scenarioPriority=${result.scenarioPriority.length})`,
  );
}

/* ============================================================
 * 2. admin — env 기반 본인 화이트리스트
 * ============================================================
 * env 미설정 시 warn 만 — /admin 안 들어가는 작업에는 무관. authId 와 email 어느
 * 쪽으로든 기존 row 를 찾아 같은 user 에 admin extension 부착 (재시드 안전).
 */
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

  const existing = await prisma.user.findFirst({
    where: { OR: [{ authId: adminAuthId }, { email: adminEmail }] },
    select: { id: true },
  });
  const userId = existing?.id ?? newId();

  await prisma.user.upsert({
    where: { id: userId },
    update: { email: adminEmail, authId: adminAuthId, name: "Local Dev Admin" },
    create: { id: userId, email: adminEmail, authId: adminAuthId, name: "Local Dev Admin" },
  });
  await prisma.admin.upsert({
    where: { id: userId },
    update: { active: true },
    create: { id: userId, active: true },
  });
  console.log(`[seed] admin (${adminEmail}) ready`);
}

/* ============================================================
 * 3. plan_request_price_tier — budget 구간 → 가격 매핑 초기값
 * ============================================================
 * step1-wizard 의 BUDGET_OPTIONS 가 동적 로드. admin 이 운영 중 편집하므로
 * 빈 테이블일 때만 백필 — 기존 row 는 손대지 않음 (price 보존).
 */
async function seedPlanRequestPriceTiers() {
  let created = 0;
  for (const tier of DEFAULT_PRICE_TIERS) {
    const existing = await prisma.planRequestPriceTier.findUnique({
      where: { position: tier.position },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.planRequestPriceTier.create({
      data: { id: newId(), ...tier },
    });
    created++;
  }
  console.log(
    `[seed] plan_request_price_tier — ${DEFAULT_PRICE_TIERS.length} tier(s) checked, ${created} new`,
  );
}

/* ============================================================
 * 4. partner_signup_invitation — `/partner/signup/<token>` 흐름 dev 테스트용 1건.
 * ============================================================
 * **id + token 은 고정** — dev 가 매번 같은 URL 로 진입 가능:
 *   http://localhost:3000/partner/signup/{TOKEN}
 *
 * 이미 존재하면 skip (consume 후 재시드 시 상태 충돌 방지). 새로 시작하려면
 * admin UI 에서 초청 + 파생 partner 를 삭제 후 재시드. 만료 임박 / token 회전이
 * 필요하면 admin UI 의 reissue.
 *
 * 매 진입마다 새 Kakao OAuth 가 linkedAuthId 를 덮어쓰므로 다른 카카오 계정으
 * 로 재시도해도 진행 가능 — 횡령 방지는 SMS 발송 대상이 invitation.phone 으로
 * 고정된다는 점이 담당.
 */
async function seedDevPartnerSignupInvitation() {
  const existing = await prisma.partnerSignupInvitation.findUnique({
    where: { id: DEV_INVITATION.id },
    select: { id: true, consumedAt: true },
  });
  if (existing) {
    const state = existing.consumedAt ? "consumed" : "pending";
    console.log(
      `[seed] partner_signup_invitation (${DEV_INVITATION.id}) already exists [${state}], skipping`,
    );
    return;
  }

  const phone = process.env.LOCAL_DEV_PARTNER_PHONE ?? DEV_INVITATION.fallbackPhone;
  const name = process.env.LOCAL_DEV_PARTNER_NAME ?? DEV_INVITATION.fallbackName;

  await prisma.partnerSignupInvitation.create({
    data: {
      id: DEV_INVITATION.id,
      name,
      phone,
      bio: "로컬 dev 환경 테스트용 placeholder 설계사",
      yearsOfExperience: 5,
      trustMetric: "고객 96% 만족 (dev placeholder)",
      licenseNumber: "DEV-LICENSE-001",
      active: true,
      token: DEV_INVITATION.token,
      expiresAt: new Date(Date.now() + DEV_INVITATION.expiresInDays * 24 * 60 * 60 * 1000),
    },
  });
  console.log(
    `[seed] partner_signup_invitation ready — /partner/signup/${DEV_INVITATION.token}`,
  );
}

/* ============================================================
 * 5. 예시 partner fixture (user + partner + balance + stats 4-table TX)
 * ============================================================
 * `verifyPartnerSignupOtp` 와 동일 패턴 — `Partner.exists ⇔ Balance.exists`
 * + `⇔ Stats.exists` 불변식을 만족시키며 단일 트랜잭션으로 INSERT. invitation+
 * OAuth+OTP 가입 흐름을 우회하므로 **dev seed 전용**: authId 미연결이라
 * `/partner` 대시보드 로그인 불가. 로그인 흐름 테스트는 위 invitation 진행.
 *
 * 멱등성: user.id 존재 시 skip. fixture 데이터 변경 후 반영하려면 admin UI 에서
 * 해당 partner 삭제 (cascade 로 user/partner/balance/stats/ledger 정리) 후 재시드.
 */
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
          // authId 의도적 null — OAuth 미연결 (로그인 불가, 매칭/어드민 노출만).
        },
      });
      await tx.partner.create({
        data: {
          id: p.id,
          bio: p.bio,
          yearsOfExperience: p.yearsOfExperience,
          trustMetric: p.trustMetric,
          licenseNumber: p.licenseNumber,
          active: p.active,
        },
      });
      await tx.partnerCreditBalance.create({ data: { partnerId: p.id } });
      await tx.partnerAssignmentStats.create({
        data: { partnerId: p.id, ...p.stats },
      });
    });
    created++;
  }
  console.log(
    `[seed] example partners — ${EXAMPLE_PARTNERS.length} fixture(s) checked, ${created} new`,
  );
}

/* ============================================================
 * 6. catch-all 불변식 백필
 * ============================================================
 * `Partner.exists ⇔ Balance.exists` + `⇔ Stats.exists` 불변식 유지.
 *
 * 가입 트랜잭션 (verifyPartnerSignupOtp) 과 예시 픽스처 (위 단계) 는 자체 tx 에
 * eager-create 하므로, 이 단계는 그 외 경로 (수동 SQL / row 만 삭제된 케이스 /
 * eager-create 도입 이전 레거시 partner) 의 누락을 메우는 catch-all.
 *
 * `createMany(skipDuplicates: true)` 단일 쿼리 — partnerId 가 PK 라 기존 row 는
 * 자동 skip. 카운터/balance 컬럼은 schema default(0) 사용.
 */
async function ensurePartnerInvariants() {
  const partners = await prisma.partner.findMany({ select: { id: true } });
  if (partners.length === 0) return;

  const ids = partners.map((p) => ({ partnerId: p.id }));
  const [balance, stats] = await Promise.all([
    prisma.partnerCreditBalance.createMany({ data: ids, skipDuplicates: true }),
    prisma.partnerAssignmentStats.createMany({ data: ids, skipDuplicates: true }),
  ]);
  console.log(
    `[seed] partner invariants — ${partners.length} partner(s) checked, ` +
      `${balance.count} balance / ${stats.count} stats row(s) backfilled`,
  );
}

/* ============================================================
 * 7. partner_credit_ledger 샘플 + balance/debt 정합 갱신
 * ============================================================
 * 각 fixture 의 ledger seed 를 순서대로 적용하면서 amount 부호에 따라 balance/debt
 * 분배 (apply-ledger.ts 의 정책과 동일 — amount ≥ 0 은 debt 먼저 차감, amount < 0
 * 은 balance 먼저 차감). row 마다 balanceAfter / debtAfter 스냅샷을 ledger 에
 * 박고, 마지막 누적값을 partner_credit_balance 에 set.
 *
 * 멱등성: 같은 idempotencyKey 의 row 존재 시 skip — 멱등 키 매칭 안 되는 seed
 * (예: 운영 중 새 history 가 들어왔다거나) 도 안전. seed 의 balance/debt 합산은
 * `Σ ledger.amount = balance − debt` 의 회계 항등식을 자연히 만족.
 */
async function seedPartnerCreditLedger() {
  let ledgerCreated = 0;
  let balanceUpdated = 0;

  for (const p of EXAMPLE_PARTNERS) {
    if (p.ledger.length === 0) continue;

    let balance = 0;
    let debt = 0;

    for (let i = 0; i < p.ledger.length; i++) {
      const entry = p.ledger[i];
      const { amount, type, reason, referenceType, referenceId, idempotencyKey, provider, providerRef } =
        normalizeLedger(entry, p.id, i);

      // amount 부호별 분배 — applyLedger 와 동일.
      if (amount >= 0) {
        const payDown = Math.min(amount, debt);
        debt -= payDown;
        balance += amount - payDown;
      } else {
        const abs = -amount;
        const fromBalance = Math.min(abs, balance);
        balance -= fromBalance;
        debt += abs - fromBalance;
      }

      const existing = idempotencyKey
        ? await prisma.partnerCreditLedger.findUnique({
            where: { idempotencyKey },
            select: { id: true },
          })
        : null;
      if (existing) continue;

      await prisma.partnerCreditLedger.create({
        data: {
          id: newId(),
          partnerId: p.id,
          amount,
          balanceAfter: balance,
          debtAfter: debt,
          type,
          reason: reason ?? null,
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          idempotencyKey: idempotencyKey ?? null,
          provider: provider ?? null,
          providerRef: providerRef ?? null,
          // createdById null — 시스템 시드 (audit 상 actor 없음).
        },
      });
      ledgerCreated++;
    }

    // 누적 balance/debt 를 partner_credit_balance 에 반영. `version` 은 의도적으로
    // 안 건드림 — 낙관적 잠금 카운터는 applyLedger 의 단조 증가 계약이라, 재시드
    // 마다 0 리셋하면 컬럼 의미가 깨짐. 시드는 balance/debt 만 확정.
    const result = await prisma.partnerCreditBalance.updateMany({
      where: { partnerId: p.id },
      data: { balance, debt },
    });
    if (result.count > 0) balanceUpdated++;
  }

  console.log(
    `[seed] partner_credit_ledger — ${ledgerCreated} new row(s), ${balanceUpdated} balance row(s) reconciled`,
  );
}

type NormalizedLedger = {
  amount: number;
  type: "topup" | "spend" | "adjustment" | "refund";
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  provider?: string;
  providerRef?: string;
};

/**
 * LedgerSeed (직관적 fixture 형태) → PartnerCreditLedger row 컬럼.
 *
 * 부호/멱등키/reference 매핑은 features/credits/CLAUDE.md 정책과 동일:
 *   - topup:      amount>0, ref=("payment", paymentId), key=paymentId, provider=stub
 *   - spend:      amount<0, ref=(refType, refId), key=`${refType}:${refId}`
 *   - refund:     amount<0, ref=("payment", paymentId), key=`cancellation:${cancellationId}`, provider=stub
 *   - adjustment: 운영 정책상 key=null (UNIQUE NULL distinct → 동일 사유 두 번 OK).
 *                 그러나 시드는 결정적 fixture 이므로 멱등성을 위해 `dev-seed:adjustment:
 *                 <partnerId>:<index>` 합성 키를 부여 — 재시드 시 중복 INSERT 방지.
 */
function normalizeLedger(
  seed: LedgerSeed,
  partnerId: string,
  index: number,
): NormalizedLedger {
  switch (seed.type) {
    case "topup":
      return {
        amount: seed.amount,
        type: "topup",
        reason: seed.reason,
        referenceType: "payment",
        referenceId: seed.paymentId,
        idempotencyKey: seed.paymentId,
        provider: "stub",
        providerRef: seed.paymentId,
      };
    case "spend":
      return {
        amount: -seed.amount,
        type: "spend",
        reason: seed.reason,
        referenceType: seed.referenceType,
        referenceId: seed.referenceId,
        idempotencyKey: `${seed.referenceType}:${seed.referenceId}`,
      };
    case "refund":
      return {
        amount: -seed.amount,
        type: "refund",
        reason: seed.reason,
        referenceType: "payment",
        referenceId: seed.paymentId,
        idempotencyKey: `cancellation:${seed.cancellationId}`,
        provider: "stub",
        providerRef: seed.cancellationId,
      };
    case "adjustment":
      return {
        amount: seed.amount,
        type: "adjustment",
        reason: seed.reason,
        idempotencyKey: `dev-seed:adjustment:${partnerId}:${index}`,
      };
  }
}

/* ============================================================
 * 8. admin_notification — 미확인 벨 배지 + 드롭다운 점검용 3건
 * ============================================================
 * 멱등성: type+title 매칭으로 기존 row 검색 → 없으면 INSERT. read 상태 (readAt)
 * 는 시드 후 admin 이 클릭으로 변경할 수 있으므로 update 안 함.
 *
 * 시간차: 위→아래 순서로 createdAt 을 1분씩 뒤로 (3, 2, 1분 전). 드롭다운 최신순
 * 정렬과 일치하도록.
 */
async function seedAdminNotifications() {
  let created = 0;
  const now = Date.now();
  for (let i = 0; i < SAMPLE_ADMIN_NOTIFICATIONS.length; i++) {
    const n = SAMPLE_ADMIN_NOTIFICATIONS[i];
    const existing = await prisma.adminNotification.findFirst({
      where: { type: n.type, title: n.title },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.adminNotification.create({
      data: {
        id: newId(),
        type: n.type,
        title: n.title,
        body: n.body,
        linkPath: n.linkPath,
        readAt: n.readAt ?? null,
        createdAt: new Date(now - (SAMPLE_ADMIN_NOTIFICATIONS.length - i) * 60 * 1000),
      },
    });
    created++;
  }
  console.log(
    `[seed] admin_notification — ${SAMPLE_ADMIN_NOTIFICATIONS.length} sample(s) checked, ${created} new`,
  );
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
