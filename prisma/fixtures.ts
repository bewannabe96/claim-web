/**
 * prisma/fixtures.ts — 매칭 흐름 / 후보 노출 / 페널티 윈도우 테스트용 더미.
 * 자동 실행 안 함 — `pnpm db:seed:fixtures` 로 명시 호출.
 *
 * 멱등 전략: fixture 표식이 email/phone prefix 에 들어감 (`fixture+...`).
 * 재실행 시 deleteMany 로 기존 fixture 만 정리 후 재생성 — 사용자가 직접
 * 만든 row 는 건드리지 않음.
 */
import { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";

const prisma = new PrismaClient();

const ID_ALPHABET =
  "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const newId = customAlphabet(ID_ALPHABET, 16);

const FIXTURE_EMAIL_PREFIX = "fixture+";

const PARTNERS = [
  { name: "김보험", years: 12, trust: "high",   bio: "건강·실손 전문, 10년+." },
  { name: "이설계", years: 7,  trust: "medium", bio: "암보험 컨설팅 중심." },
  { name: "박매니저", years: 15, trust: "high", bio: "법인·고액보험 전문." },
  { name: "최플래너", years: 4,  trust: "medium", bio: "젊은 세대 맞춤 설계." },
  { name: "정컨설턴트", years: 9, trust: "high", bio: "어린이·태아 전문." },
  { name: "한어드바이저", years: 11, trust: "high", bio: "은퇴·연금 설계." },
  { name: "조매니저", years: 3, trust: "low", bio: "신입 설계사." },
  { name: "윤플래너", years: 8, trust: "medium", bio: "치아·운전자 전문." },
];

async function main() {
  console.log("[fixtures] cleaning previous fixture rows...");
  await prisma.partner.deleteMany({
    where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } },
  });

  console.log("[fixtures] inserting partners...");
  for (const [i, p] of PARTNERS.entries()) {
    await prisma.partner.create({
      data: {
        id: newId(),
        name: p.name,
        avatarUrl: `https://i.pravatar.cc/200?img=${i + 1}`,
        bio: p.bio,
        yearsOfExperience: p.years,
        trustMetric: p.trust,
        phone: `010-0000-${String(1000 + i).padStart(4, "0")}`,
        email: `${FIXTURE_EMAIL_PREFIX}${i + 1}@example.com`,
        active: true,
      },
    });
  }
  console.log(`[fixtures] ${PARTNERS.length} partners ready`);
}

main()
  .catch((err) => {
    console.error("[fixtures] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
