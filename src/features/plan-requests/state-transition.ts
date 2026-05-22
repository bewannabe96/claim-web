import "server-only";

import { revalidatePath } from "next/cache";

import { sendAlimtalk, sendNotificationLms } from "@/server/aligo";
import { getServiceName } from "@/server/branding";
import { prisma } from "@/server/db/prisma";
import { buildAnalysisCompletedAlimtalk } from "@/server/kakao-templates";

/**
 * plan_request 마감 — 요청을 결과 상태로 전이하고 알림을 발송하는 단일 진입점. 멱등.
 *
 * 마감 조건 (둘 중 먼저 오는 것):
 *   1. 조기 마감 — 마감시간 전에 모든 파트너가 제출 + 그 제안서가 전부 분석 완료.
 *   2. 시간 마감 — `deadlineAt` 도달. 분석 완료 여부와 무관 (미분석/분석실패 제안서가
 *      섞여 있어도 마감). 남아있는 `pending` assignment 는 `expired` 로 전이.
 *
 * 마감 실행:
 *   - submitted >= 1 → `analyzing → completed`. (가입자 결과 알림톡 UI_0741 자동 발송은
 *     현재 비활성화 — 아래 본문 주석 + `sendAnalysisCompletedNotification` 참고. 어드민이
 *     요청 상세 페이지에서 수동 발송.)
 *   - submitted === 0 (전부 미제출/expired) → `dispatched|analyzing → rematching`.
 *     자동 재매칭 (docs/cron-jobs.md 작업 #4) 미구현이라 가입자 알림은 보내지 않음
 *     ("다시 요청드릴게요" 약속만 보내고 실제 재매칭이 안 일어나는 misleading 회피).
 *   - 시간 마감으로 `expired` 된 파트너에겐 마감 안내 LMS.
 *
 * 호출처:
 *   - 웹훅 (`/api/webhooks/eightytwo-judge-analysis`) — 분석 콜백마다. 주로 조기 마감 감지.
 *   - cron (`/api/cron/assignment-deadline-expiry`) — 마감시간 지난 요청 일괄. 시간 마감.
 *
 * 동시 호출 (웹훅 × cron) 안전 — 마감 실행 (expire + status 전이) 을 단일 트랜잭션에
 * 묶어, status 전이를 이긴 호출 (updateMany count===1) 만 알림을 발송. `expired` 대상
 * 파트너 목록도 같은 트랜잭션에서 조회하므로 이긴 호출이 항상 정확한 목록을 갖는다.
 */
export async function closePlanRequest(requestId: string): Promise<void> {
  const request = await prisma.planRequest.findUnique({
    where: { id: requestId },
    select: {
      status: true,
      deadlineAt: true,
      name: true,
    },
  });
  // 이미 마감 (completed/rematching/failed) 됐거나 아직 송부 전이면 no-op.
  if (
    !request ||
    (request.status !== "dispatched" && request.status !== "analyzing")
  ) {
    return;
  }

  const [pending, submitted, analyzed] = await Promise.all([
    prisma.planRequestAssignment.count({
      where: { requestId, status: "pending" },
    }),
    prisma.planRequestAssignment.count({
      where: { requestId, status: "submitted" },
    }),
    prisma.planRequestAssignment.count({
      where: {
        requestId,
        status: "submitted",
        proposal: { analyzedAt: { not: null } },
      },
    }),
  ]);

  const deadlinePassed =
    request.deadlineAt !== null && request.deadlineAt.getTime() <= Date.now();
  // 조기 마감 — pending=0 이면 더 제출될 수 없어 (열린 토큰 슬롯 없음) submitted 가
  // 고정되고 analyzed 는 단조 증가 → 한 번 충족되면 계속 충족.
  const earlyComplete = pending === 0 && submitted > 0 && submitted === analyzed;

  if (!deadlinePassed && !earlyComplete) return;

  // ── 마감 실행 (단일 트랜잭션) ──
  const result = await prisma.$transaction(async (tx) => {
    // 시간 마감 시 남은 pending 을 expired 로. 파트너 목록은 expire 직전에 조회 —
    // 트랜잭션 안이라 status 전이를 이긴 호출이 정확한 목록을 갖는다.
    const expiringPartners =
      pending > 0
        ? await tx.planRequestAssignment.findMany({
            where: { requestId, status: "pending" },
            select: {
              id: true,
              partnerId: true,
              partner: {
                select: { user: { select: { name: true, phone: true } } },
              },
            },
          })
        : [];
    if (expiringPartners.length > 0) {
      await tx.planRequestAssignment.updateMany({
        where: { requestId, status: "pending" },
        data: { status: "expired" },
      });
    }

    // submitted 를 트랜잭션 안에서 재확인 — count 시점 이후의 막판 제출까지 반영해
    // completed/rematching 분기를 정확히.
    const submittedNow = await tx.planRequestAssignment.count({
      where: { requestId, status: "submitted" },
    });

    if (submittedNow === 0) {
      const transitioned = await tx.planRequest.updateMany({
        where: { id: requestId, status: { in: ["dispatched", "analyzing"] } },
        data: { status: "rematching" },
      });
      return {
        won: transitioned.count === 1,
        nextStatus: "rematching" as const,
        expiringPartners,
      };
    }

    const transitioned = await tx.planRequest.updateMany({
      where: { id: requestId, status: "analyzing" },
      data: { status: "completed" },
    });
    return {
      won: transitioned.count === 1,
      nextStatus: "completed" as const,
      expiringPartners,
    };
  });

  // 멱등 — 전이를 이긴 호출만 알림 발송 (중복 차단).
  if (!result.won) return;

  revalidatePath("/admin/requests");

  // 시간 마감으로 슬롯이 닫힌 파트너들에게 마감 안내 LMS.
  if (result.expiringPartners.length > 0) {
    await notifyPartnersOfExpiry(
      requestId,
      result.expiringPartners,
      request.name ?? "고객",
    );
  }

  // [임시 비활성화] 가입자 결과 알림톡 자동 발송. 현재는 어드민이 요청 상세
  // (/admin/requests/[id]) 의 "완료 알림톡 발송" 버튼으로 수동 발송한다. 자동 발송을
  // 복구할 때 아래 블록 주석을 해제하면 된다 (rematching 은 자동 재매칭 미구현이라
  // 어차피 알림 보류 대상).
  // if (result.nextStatus === "completed") {
  //   await sendAnalysisCompletedNotification(requestId);
  // }
}

export type ResultNotificationOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "missing_contact" | "send_failed" };

/**
 * 가입자 결과 알림톡 (UI_0741) 발송 — 결과 페이지 링크. 성공/실패를 반환해 호출자가
 * 분기할 수 있게 한다 (어드민 수동 발송 UI 가 결과를 표시).
 *
 * 공용 진입점:
 *   - 어드민 수동 발송 — `sendRequestResultNotification` (요청 상세 페이지 버튼).
 *   - `closePlanRequest` 의 자동 발송 — 현재 임시 비활성화 (호출부 주석 처리).
 *
 * finalize 가 consentMessaging=true 를 강제하므로 dispatched 까지 간 request 는 수신
 * 동의 완료 상태. phone/resultToken 도 finalize 트랜잭션이 dispatched 와 함께 set.
 */
export async function sendAnalysisCompletedNotification(
  planRequestId: string,
): Promise<ResultNotificationOutcome> {
  const request = await prisma.planRequest.findUnique({
    where: { id: planRequestId },
    select: { name: true, phone: true, resultToken: true },
  });
  if (!request) {
    console.warn("[result-notification] skipped — plan request not found", {
      planRequestId,
    });
    return { ok: false, reason: "not_found" };
  }
  if (!request.phone || !request.resultToken) {
    console.warn("[result-notification] skipped — missing phone or resultToken", {
      planRequestId,
    });
    return { ok: false, reason: "missing_contact" };
  }

  const { templateCode, variables } = buildAnalysisCompletedAlimtalk({
    customerName: request.name ?? "고객",
    token: request.resultToken,
  });
  try {
    await sendAlimtalk(request.phone, templateCode, variables);
    return { ok: true };
  } catch (err) {
    console.error("[result-notification] alimtalk send failed", {
      planRequestId,
      error: err instanceof Error ? err.message : err,
    });
    return { ok: false, reason: "send_failed" };
  }
}

/**
 * 마감 안내 LMS — 시간 마감으로 슬롯이 닫힌 각 설계사 휴대폰으로 발송. partnerPhone
 * 누락 / 알리고 호출 실패는 log 만 (defensive). Promise.allSettled 로 한 건 실패가
 * 다른 발송을 막지 않게. 본문엔 가입자 이름만 — 제출 페이지 URL 은 이미 만료라 무의미.
 */
async function notifyPartnersOfExpiry(
  planRequestId: string,
  expiringPartners: ReadonlyArray<{
    id: string;
    partnerId: string;
    partner: { user: { name: string | null; phone: string | null } };
  }>,
  customerName: string,
): Promise<void> {
  const serviceName = getServiceName();

  await Promise.allSettled(
    expiringPartners.map(async (s) => {
      const partnerPhone = s.partner.user.phone;
      if (!partnerPhone) {
        console.warn(
          "[closePlanRequest] partner expiry notification skipped — missing phone",
          { planRequestId, assignmentId: s.id, partnerId: s.partnerId },
        );
        return;
      }
      const partnerName = s.partner.user.name ?? "파트너";
      const msg = [
        `[${serviceName}] ${partnerName} 파트너님,`,
        `${customerName}님의 요청서 제출 마감 시간이 지났어요.`,
        `더 이상 제안서를 제출할 수 없습니다.`,
      ].join("\n");
      try {
        await sendNotificationLms(partnerPhone, msg);
      } catch (err) {
        console.error(
          "[closePlanRequest] partner expiry notification LMS failed",
          {
            planRequestId,
            assignmentId: s.id,
            partnerId: s.partnerId,
            error: err instanceof Error ? err.message : err,
          },
        );
      }
    }),
  );
}
