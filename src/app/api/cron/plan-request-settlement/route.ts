import { revalidatePath } from "next/cache";

import { settlePlanRequest } from "@/features/plan-requests/settlement";
import { prisma } from "@/server/db/prisma";
import { getSettings } from "@/server/settings";

/**
 * 요청서 정산 cron — 보관 기간 만료된 PlanRequest 에 대해 contactedAt 있는 파트너들에게
 * price/N (1000원 단위 반올림) 일괄 차감.
 *
 * Vercel Cron 진입점. Bearer 토큰은 Vercel 이 자동 주입 (env `CRON_SECRET`).
 * schedule 은 vercel.json — 1시간 주기 (보관 기간이 일 단위라 5분 빈도는 과도).
 *
 * 동작:
 *   1. AppSettings.resultRetentionDays 로 cutoff 계산 (now - days).
 *   2. dispatchedAt <= cutoff AND settledAt IS NULL 인 PlanRequest 조회 (batch 100건).
 *   3. 각 request 에 대해 settlePlanRequest 호출.
 *      - settlePlanRequest 가 settledAt atomic claim 을 **먼저** 수행하고 그 후 청구.
 *        이 순서로 동시 진행 중인 action 의 늦은 contactedAt 마킹을 차단 (race-safety).
 *      - partial spendCredit 실패 시 자동 재시도 불가 (settledAt 이미 set) — 운영 모니터링
 *        (console.error) + 같은 멱등키로 수동 재호출로 복구. 자세한 trade-off 는
 *        settlement.ts 헤더 주석 참조.
 *
 * 멱등성: vercel cron 은 single-instance 보장 (동시 호출 우려 없음). 그래도
 * settlePlanRequest 내부의 atomic claim + spendCredit 멱등키로 안전.
 */

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await getSettings();
  const cutoff = new Date(
    Date.now() - settings.resultRetentionDays * 86_400_000,
  );

  // dispatchedAt 이 cutoff 이전 + 아직 정산 안 된 request.
  // dispatchedAt null 인 row 는 아직 알림톡 발송 전이라 정산 대상 아님 (자동 제외).
  const candidates = await prisma.planRequest.findMany({
    where: {
      settledAt: null,
      dispatchedAt: { not: null, lte: cutoff },
    },
    select: { id: true },
    take: 100,
    orderBy: { dispatchedAt: "asc" },
  });

  if (candidates.length === 0) {
    return Response.json({ ok: true, candidates: 0, settled: 0, failed: 0 });
  }

  let settled = 0;
  let alreadySettled = 0;
  let failed = 0;
  let totalCharged = 0;

  // 순차 처리 — 한 tick 에 max 100건, settlePlanRequest 가 각자 자체 트랜잭션.
  // Promise.all 로 묶어도 멱등키 + race-safe updateMany 가 흡수하지만, 순차가
  // 로그 가독성 + spendCredit 의 optimistic lock contention 회피에 유리.
  for (const c of candidates) {
    try {
      const result = await settlePlanRequest(c.id);
      if (!result.ok) {
        failed++;
        console.error("[cron/plan-request-settlement] settle failed", {
          requestId: c.id,
          error: result.error,
        });
      } else if (result.alreadySettled) {
        alreadySettled++;
      } else {
        settled++;
        totalCharged += result.totalCharged;
      }
    } catch (err) {
      failed++;
      console.error("[cron/plan-request-settlement] settle threw", {
        requestId: c.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  if (settled > 0) {
    revalidatePath("/admin/requests");
    revalidatePath("/admin/partners");
    revalidatePath("/partner");
  }

  return Response.json({
    ok: true,
    candidates: candidates.length,
    settled,
    alreadySettled,
    failed,
    totalCharged,
  });
}
