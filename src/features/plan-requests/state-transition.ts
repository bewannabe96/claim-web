import "server-only";

import { revalidatePath } from "next/cache";

import { sendAlimtalk } from "@/server/aligo";
import { prisma } from "@/server/db/prisma";
import {
  KAKAO_TEMPLATE_ANALYSIS_COMPLETED,
  buildAnalysisCompletedAlimtalk,
} from "@/server/kakao-templates";
import { getPublicBaseUrl } from "@/server/origin";

/**
 * plan_request 의 모든 plan_request_assignment 가 종결됐을 때 다음 상태로 전이.
 * 멱등 — WHERE 조건으로 잘못된 시점 호출은 no-op.
 *
 * 호출처:
 *   - 웹훅 (`/api/webhooks/eightytwo-judge-analysis`) — 마지막 analyzed 가 들어왔을 때
 *   - cron (`/api/cron/assignment-deadline-expiry`) — pending 을 expired 로 바꾼 직후
 *
 * 분기:
 *   - pending 이 1건이라도 남아있으면 no-op (아직 미종결).
 *   - submitted=0 (전부 expired) → `dispatched|analyzing → rematching` (알림 미발송).
 *     실제 새 후보 산출 + 재송부 로직은 미구현 (docs/cron-jobs.md 작업 #4) — 가입자
 *     알림은 그 작업과 함께 추가해야 함 ("다시 요청드릴게요" 약속만 보내고 실제 재매칭은
 *     안 일어나는 misleading 상황 회피).
 *   - submitted >= 1 AND submitted === analyzed → `analyzing → completed` + 가입자 알림톡 (UI_0741).
 *
 * 알림 발송은 첫 전이 (updateMany count===1) 시점에만 — 멱등 호출 시 중복 알림 차단.
 */
export async function finalizeRequestStatus(requestId: string): Promise<void> {
  const [total, pending, submitted, analyzed] = await Promise.all([
    prisma.planRequestAssignment.count({ where: { requestId } }),
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

  if (pending > 0) return;

  if (submitted === 0) {
    // 작업 #4 (자동 재매칭) 미구현 — 여기선 status 만 전이. 가입자 알림 ("다시 요청드릴게요")
    // 은 새 후보 산출 + 재송부가 실제로 일어나는 작업 #4 구현 시 같이 추가.
    const transitioned = await prisma.planRequest.updateMany({
      where: { id: requestId, status: { in: ["dispatched", "analyzing"] } },
      data: { status: "rematching" },
    });
    if (transitioned.count === 1) {
      revalidatePath("/admin/requests");
    }
    return;
  }

  if (total > 0 && submitted === analyzed) {
    const transitioned = await prisma.planRequest.updateMany({
      where: { id: requestId, status: "analyzing" },
      data: { status: "completed" },
    });
    if (transitioned.count === 1) {
      revalidatePath("/admin/requests");
      await notifyAnalysisCompleted(requestId);
    }
  }
}

/**
 * 분석 완료 알림 — 가입자 휴대폰으로 결과 페이지 링크 알림톡 (UI_0741).
 *
 * finalizeRequest 가 consentMessaging=true 를 강제하므로 dispatched 까지 간 모든
 * request 는 수신 동의 완료 상태. phone/resultToken 은 finalize 트랜잭션이 함께 set.
 * 실패는 log 만 — 분석 완료 transition 은 이미 됐으므로 응답엔 영향 없음.
 */
async function notifyAnalysisCompleted(planRequestId: string): Promise<void> {
  const request = await prisma.planRequest.findUnique({
    where: { id: planRequestId },
    select: { name: true, phone: true, resultToken: true },
  });
  if (!request?.phone || !request.resultToken) {
    console.warn(
      "[state-transition] completed notification skipped — missing phone or resultToken",
      { planRequestId },
    );
    return;
  }

  const origin = await getPublicBaseUrl();
  const customerName = request.name ?? "고객";
  const payload = buildAnalysisCompletedAlimtalk({
    customerName,
    token: request.resultToken,
    origin,
  });
  try {
    await sendAlimtalk(request.phone, {
      templateCode: KAKAO_TEMPLATE_ANALYSIS_COMPLETED,
      ...payload,
    });
  } catch (err) {
    console.error(
      "[state-transition] completed notification alimtalk failed",
      {
        planRequestId,
        error: err instanceof Error ? err.message : err,
      },
    );
  }
}

