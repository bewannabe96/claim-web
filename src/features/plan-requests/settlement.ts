import "server-only";

import { spendCredit } from "@/features/credits/actions";
import { prisma } from "@/server/db/prisma";

/**
 * 요청서 정산 — 보관 기간 만료 시점에 호출.
 *
 * 정책:
 *   - "연락 요청" (contactRequestedAt IS NOT NULL) 을 받은 파트너 N명에게
 *     PlanRequest.price/N 을 1000원 단위 반올림한 금액을 spendCredit 으로 차감.
 *   - N=0 (연락 요청 없음) 이면 차감 없이 settledAt 마킹만.
 *   - 1000원 단위 반올림 후 0원이 되는 경우 (가격이 매우 작은 tier) 차감 없이 마킹만.
 *
 * 실행 순서 — **settledAt atomic claim 을 먼저**:
 *   1. $transaction 안에서: updateMany WHERE settledAt IS NULL 로 settledAt 마킹
 *      (= 정산 lock) + contactRequestedAt 있는 assignments 읽기. 두 op 을 한 tx 로
 *      묶어 claim 후 코드 throw 로 인한 inconsistency (settledAt set 되었으나 청구
 *      대상 목록 못 읽음) 방지.
 *   2. tx commit 후 각 파트너에게 spendCredit (멱등키 plan-request-settlement:${requestId}:${partnerId}).
 *      spendCredit 은 자체 tx 보유 — 본 tx 안에서 호출 불가.
 *
 * 이 순서로 race window 차단:
 *   - settledAt 이 set 되면 `requestPlanProposalContact` 의 updateMany WHERE 가
 *     `assignment.request.settledAt: null` 조건에 막혀 신규 contactRequestedAt 생성 불가.
 *   - 정산 직전에 들어온 contactRequestedAt 은 settledAt 마킹 이전에 commit 됐다면
 *     같은 tx 의 assignments READ 에서 보임 → 정상 청구. 마킹 이후 commit 이면
 *     차단됨 → 누락 없음.
 *   - 잔여 race 윈도우 (microsecond 수준): action 의 updateMany 가 cron tx 의 commit
 *     직전에 statement 시작해서 settledAt null 로 보고 contactRequestedAt 마킹 →
 *     cron 의 READ 가 그 contactRequestedAt commit 전이라 못 봄. SERIALIZABLE
 *     isolation 으로만 완전 차단 가능하나 retry 비용 대비 빈도가 낮아 운영 모니터링으로 흡수.
 *
 * 트레이드오프 — partial spendCredit 실패 시 자동 재시도 불가:
 *   - settledAt 이 이미 set 됐으므로 다음 cron tick 이 collect 안 함.
 *   - 운영 모니터링 (console.error) 로 감지 → 같은 멱등키로 수동 재호출하면 ledger
 *     append-only 라 부분 적용된 row 와 충돌 없이 누락분만 채워짐.
 *   - 이 손실을 race-safety 와 맞바꿈 (race 가 더 흔하고 자동 감지 어려움).
 */
export type SettleResult =
  | { ok: true; alreadySettled: true }
  | {
      ok: true;
      alreadySettled: false;
      partnerCount: number;
      perPartnerAmount: number;
      totalCharged: number;
    }
  | { ok: false; error: "not_found" | "spend_failed" };

type ClaimOutcome =
  | { kind: "claimed"; price: number | null; partnerIds: readonly string[] }
  | { kind: "already_settled" }
  | { kind: "not_found" };

export async function settlePlanRequest(
  requestId: string,
): Promise<SettleResult> {
  // 1) $transaction 으로 claim + assignments READ atomic 보장. 같은 tx 안에서
  //    settledAt UPDATE 후 곧장 read 하므로 코드 중간 throw 가 나도 부분 적용 없음
  //    (tx rollback). vercel cron single-instance 와 결합해 cron 측 race 완전 제거.
  //    spendCredit 은 자체 tx 라 본 tx 안에서 호출 불가 → tx 외부에서 진행.
  const outcome = await prisma.$transaction(async (tx): Promise<ClaimOutcome> => {
    const claim = await tx.planRequest.updateMany({
      where: { id: requestId, settledAt: null },
      data: { settledAt: new Date() },
    });

    if (claim.count === 0) {
      const exists = await tx.planRequest.findUnique({
        where: { id: requestId },
        select: { id: true },
      });
      return exists ? { kind: "already_settled" } : { kind: "not_found" };
    }

    const request = await tx.planRequest.findUnique({
      where: { id: requestId },
      select: {
        price: true,
        assignments: {
          where: { proposal: { contactRequestedAt: { not: null } } },
          select: { partnerId: true },
        },
      },
    });

    if (!request) {
      // claim 성공 후 같은 tx 안에서 사라지는 건 불가능 — defensive only.
      // throw 로 tx rollback (settledAt claim 도 같이 되돌림).
      throw new Error(
        `[settlePlanRequest] request disappeared inside tx: ${requestId}`,
      );
    }

    return {
      kind: "claimed",
      price: request.price,
      partnerIds: request.assignments.map((a) => a.partnerId),
    };
  });

  if (outcome.kind === "not_found") {
    return { ok: false, error: "not_found" };
  }
  if (outcome.kind === "already_settled") {
    return { ok: true, alreadySettled: true };
  }

  const partnerCount = outcome.partnerIds.length;
  const price = outcome.price ?? 0;

  // 1000원 단위 반올림. N=0 / price=0 / 반올림 결과 0 인 경우 차감 없이 settledAt 만 유지.
  const perPartnerAmount =
    partnerCount > 0 && price > 0
      ? Math.round(price / partnerCount / 1000) * 1000
      : 0;

  if (perPartnerAmount > 0) {
    // 한 파트너의 spend 실패가 다른 파트너 spend 를 막지 않게 allSettled.
    // 모두 ok 인 경우만 ok 응답 — 부분 실패는 운영 모니터링으로 수동 복구
    // (spendCredit 멱등키 살아있어 같은 키로 재호출 시 누락분만 채워짐).
    const results = await Promise.allSettled(
      outcome.partnerIds.map((partnerId) =>
        spendCredit({
          partnerId,
          amount: perPartnerAmount,
          referenceType: "plan_request",
          referenceId: requestId,
          idempotencyKey: `plan-request-settlement:${requestId}:${partnerId}`,
          reason: "요청서 정산 (보관 기간 만료)",
        }),
      ),
    );

    const allOk = results.every(
      (r) => r.status === "fulfilled" && r.value.ok === true,
    );
    if (!allOk) {
      results.forEach((r, i) => {
        const partnerId = outcome.partnerIds[i];
        if (r.status === "rejected") {
          console.error("[settlePlanRequest] spend rejected", {
            requestId,
            partnerId,
            reason: r.reason,
          });
        } else if (!r.value.ok) {
          console.error("[settlePlanRequest] spend not ok", {
            requestId,
            partnerId,
            error: r.value.error,
          });
        }
      });
      return { ok: false, error: "spend_failed" };
    }
  }

  return {
    ok: true,
    alreadySettled: false,
    partnerCount,
    perPartnerAmount,
    totalCharged: perPartnerAmount * partnerCount,
  };
}
