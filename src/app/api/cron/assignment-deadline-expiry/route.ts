import { revalidatePath } from "next/cache";

import { finalizeRequestStatus } from "@/features/plan-requests/state-transition";
import { sendNotificationLms } from "@/server/aligo";
import { getServiceName } from "@/server/branding";
import { prisma } from "@/server/db/prisma";

/**
 * 제출 마감 자동 처리 — 마감 지난 `pending` plan_request_assignment 를 `expired` 로
 * 일괄 전이 + 해당 설계사에게 마감 안내 LMS + 영향받은 plan_request 상태 전이.
 *
 * Vercel Cron 진입점. Bearer 토큰은 Vercel 이 자동 주입 (env `CRON_SECRET` 자동 연결).
 * schedule 은 vercel.json 에 5분 주기 (cron `*\/5 * * * *`).
 *
 * 동작:
 *   1. `deadlineAt <= now()` 인 pending assignment 를 partner + request join 으로 조회.
 *   2. status='expired' 로 updateMany (WHERE status='pending' 로 race-safe).
 *   3. 각 설계사에게 마감 안내 LMS (Promise.allSettled — 한 건 실패가 다른 건 막지 않게).
 *   4. 영향받은 requestId 별로 `finalizeRequestStatus` 호출 — 전부 expired 면 rematching,
 *      submitted 가 모두 analyzed 면 completed, 그 외엔 no-op. 가입자 LMS 발송 포함.
 *
 * 멱등성: 두 번 호출돼도 같은 결과. updateMany WHERE 가 이미 expired 인 행은 건드리지 않음.
 * finalizeRequestStatus 의 updateMany 도 `WHERE status: { in: [...] }` 로 멱등.
 */

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const stale = await prisma.planRequestAssignment.findMany({
    where: {
      status: "pending",
      request: { deadlineAt: { lte: now } },
    },
    select: {
      id: true,
      requestId: true,
      partnerId: true,
      partner: {
        select: {
          user: { select: { name: true, phone: true } },
        },
      },
      request: {
        select: { name: true },
      },
    },
  });

  if (stale.length === 0) {
    return Response.json({ ok: true, expired: 0, transitioned: 0 });
  }

  // race-safe: 동시에 partner 가 제출해 'submitted' 가 됐으면 그 행은 건드리지 않음.
  const updated = await prisma.planRequestAssignment.updateMany({
    where: { id: { in: stale.map((s) => s.id) }, status: "pending" },
    data: { status: "expired" },
  });

  // 설계사 마감 안내 LMS — 본 cron 이 expire 시킨 모든 assignment 대상.
  // Promise.allSettled 로 한 설계사 발송 실패가 다른 발송을 막지 않게.
  await notifyPartnersOfExpiry(stale);

  // 영향받은 request 별로 상태 전이 (중복 제거).
  const requestIds = [...new Set(stale.map((s) => s.requestId))];
  await Promise.all(requestIds.map(finalizeRequestStatus));

  revalidatePath("/admin/requests");

  return Response.json({
    ok: true,
    expired: updated.count,
    candidates: stale.length,
    transitioned: requestIds.length,
  });
}

/**
 * 마감 안내 LMS — 각 설계사 휴대폰으로 발송. partnerPhone 누락 / 알리고 호출 실패는
 * log 만 (defensive). 본문엔 가입자 이름만 포함 (제출 페이지 URL 은 이미 만료라
 * 의미 없음).
 */
async function notifyPartnersOfExpiry(
  stale: ReadonlyArray<{
    id: string;
    partnerId: string;
    partner: { user: { name: string | null; phone: string | null } };
    request: { name: string | null };
  }>,
): Promise<void> {
  const serviceName = getServiceName();

  await Promise.allSettled(
    stale.map(async (s) => {
      const partnerPhone = s.partner.user.phone;
      if (!partnerPhone) {
        console.warn(
          "[cron/assignment-deadline-expiry] partner notification skipped — missing phone",
          { assignmentId: s.id, partnerId: s.partnerId },
        );
        return;
      }
      const partnerName = s.partner.user.name ?? "파트너";
      const customerName = s.request.name ?? "고객";
      const msg = [
        `[${serviceName}] ${partnerName} 파트너님,`,
        `${customerName}님의 요청서 제출 마감 시간이 지났어요.`,
        `더 이상 제안서를 제출할 수 없습니다.`,
      ].join("\n");
      try {
        await sendNotificationLms(partnerPhone, msg);
      } catch (err) {
        console.error(
          "[cron/assignment-deadline-expiry] partner notification LMS failed",
          {
            assignmentId: s.id,
            partnerId: s.partnerId,
            error: err instanceof Error ? err.message : err,
          },
        );
      }
    }),
  );
}
