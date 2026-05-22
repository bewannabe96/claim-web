import { closePlanRequest } from "@/features/plan-requests/state-transition";
import { prisma } from "@/server/db/prisma";

/**
 * 제출 마감 자동 처리 — 마감시간이 지난 plan_request 를 일괄 마감 (시간 마감).
 *
 * Vercel Cron 진입점. Bearer 토큰은 Vercel 이 자동 주입 (env `CRON_SECRET` 자동 연결).
 * schedule 은 vercel.json 에 5분 주기 (cron `*\/5 * * * *`).
 *
 * 동작:
 *   1. `deadlineAt <= now()` 이면서 아직 결과 상태로 안 간 (`dispatched`/`analyzing`)
 *      plan_request 를 조회. **pending assignment 유무와 무관** — 모든 파트너가 제출을
 *      마쳤지만 분석이 미완인 요청도 포함해야 시간 마감이 강제된다.
 *   2. 각 요청에 `closePlanRequest` 호출 — 남은 pending 을 expired 로 전이 + 설계사
 *      마감 안내 LMS + `analyzing → completed` (또는 submitted=0 시 rematching).
 *      전이/알림 책임은 전부 `closePlanRequest` 안에 통합.
 *
 * 멱등성: 두 번 호출돼도 같은 결과. `closePlanRequest` 가 status 가드 + 전이 latch 로
 * 멱등. 분석 완료 콜백 (웹훅) 과 호출처를 공유하지만 단일 트랜잭션 전이로 race-safe.
 */

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  // 마감시간이 지났는데 아직 결과 상태 (completed/rematching/failed) 로 전이 안 된 요청.
  // 한 tick 당 상한 — 밀린 경우 다음 tick (5분 후) 이 이어 처리. 오래된 것부터.
  const due = await prisma.planRequest.findMany({
    where: {
      deadlineAt: { lte: now },
      status: { in: ["dispatched", "analyzing"] },
    },
    select: { id: true },
    take: 200,
    orderBy: { deadlineAt: "asc" },
  });

  if (due.length === 0) {
    return Response.json({ ok: true, due: 0, closed: 0, failed: 0 });
  }

  // 순차 처리 — 한 요청 처리 중 throw 가 다음 요청을 막지 않게. closePlanRequest 는
  // 알림 발송 실패를 내부에서 swallow 하지만 DB 오류 등은 throw 될 수 있음.
  let closed = 0;
  let failed = 0;
  for (const r of due) {
    try {
      await closePlanRequest(r.id);
      closed++;
    } catch (err) {
      failed++;
      console.error(
        "[cron/assignment-deadline-expiry] closePlanRequest threw",
        {
          requestId: r.id,
          error: err instanceof Error ? err.message : err,
        },
      );
    }
  }

  return Response.json({ ok: true, due: due.length, closed, failed });
}
