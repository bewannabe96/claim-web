import { createHmac, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AnalysisReportV5Schema,
  CURRENT_REPORT_VERSION,
} from "@/features/plan-proposals/analysis-schema";
import { AnalysisErrorSchema } from "@/features/plan-proposals/schema";
import { sendNotificationLms } from "@/server/aligo";
import { getServiceName } from "@/server/branding";
import { prisma } from "@/server/db/prisma";
import { resolveOrigin } from "@/server/origin";

/**
 * 분석 완료 웹훅 — eightytwo_judge 가 한 proposal 분석 종료 시 POST.
 *
 * 인증: `X-Signature: sha256=<hex>` (raw body 의 HMAC-SHA256, secret 은
 * `ANALYSIS_WEBHOOK_SECRET`). 누락/불일치 → 401.
 *
 * 페이로드 (SQS metadata 가 passthrough):
 *   {
 *     request_id: string,                 // 메시지 correlation ID (random UUID, log 용)
 *     status: "succeeded" | "failed",
 *     result: AnalysisReportV5 | null,    // succeeded 시 필수
 *     error:  AnalysisError | null,       // failed 시 필수
 *                                          // { group, type, message, detail? }
 *     metadata: {
 *       proposal_id: string,              // 우리 도메인 식별자
 *       plan_request_id: string,          // pending 체크 + 전이 기준
 *     },
 *     duration_ms: number
 *   }
 *
 * 동작:
 *   - `failed` → proposal.analysisError + analysisErrorAt 마킹 (analyzedAt 은
 *     건드리지 않음 → plan_request 전이 안 일어남). updateMany + WHERE id +
 *     assignment.requestId + analyzedAt IS NULL → 성공 분석이 이미 들어와 있으면
 *     덮어쓰기 금지 (race-safe). 어드민 "분석 실패" 페이지에서 인지 + 수동 fix
 *     후 `retryProposalAnalysis` 액션으로 재발행.
 *   - `succeeded` → 트랜잭션:
 *       1. proposal.analyzedAt = now() (첫 콜백만, WHERE id + assignment.requestId
 *          매치 + analyzedAt IS NULL — plan_request_id cross-check 로 페이로드 위조 차단)
 *       2. updated.count===1 이면 plan_proposal_analysis_report INSERT (proposalId 1:1)
 *     그 후 plan_request 의 **모든 plan_request_assignment** 가 submitted + 그 proposal 이
 *     analyzed 인 경우에만 plan_request.status='analyzing' → 'completed'
 *     (pending/expired assignment 가 하나라도 있으면 전이 안 함).
 *
 * 발신측 재시도 안전: 첫 콜백이 transition 직전에 끊겨도 retry 가 pending 을
 * 재평가해서 전이 마무리.
 */

/**
 * 페이로드의 `result` 는 저장될 report 본문 + `schema_version` 마커.
 * `schema_version` 은 별도 컬럼으로 저장되므로 본문 zod 와 분리해서 여기서만 검증.
 */
const ResultSchema = AnalysisReportV5Schema.extend({
  schema_version: z.literal(CURRENT_REPORT_VERSION),
});

const PayloadSchema = z
  .object({
    request_id: z.string().min(1),
    status: z.enum(["succeeded", "failed"]),
    result: ResultSchema.nullable(),
    /**
     * failed 시 필수. `{ group, type, message, detail? }` — features/proposals/schema.ts
     * 의 `AnalysisErrorSchema` 와 동일 컨트랙트. group 은 우리 도메인 enum 으로 고정 —
     * 외부에서 새 group 보내면 여기서 reject 되어 미정의 케이스가 DB 에 들어가지 않음.
     */
    error: AnalysisErrorSchema.nullable(),
    metadata: z.object({
      proposal_id: z.string().min(1),
      plan_request_id: z.string().min(1),
    }),
    duration_ms: z.number().int().nonnegative(),
  })
  .refine(
    (d) => (d.status === "succeeded" ? d.result !== null : d.error !== null),
    { message: "result required when succeeded, error required when failed" },
  );

export async function POST(req: Request) {
  const secret = process.env.ANALYSIS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook/analysis] ANALYSIS_WEBHOOK_SECRET not set");
    return new Response("misconfigured", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  if (!verifyHmac(rawBody, signature, secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    request_id,
    status,
    result,
    error,
    metadata: { proposal_id, plan_request_id },
    duration_ms,
  } = parsed.data;

  if (status === "failed") {
    console.warn("[webhook/analysis] analysis failed", {
      request_id,
      proposal_id,
      plan_request_id,
      error,
      duration_ms,
    });

    // refine() 이 failed → error !== null 을 보장하지만 TS narrowing 은 못 따라옴.
    // cast — zod 통과한 객체는 JSON-serializable, Prisma `InputJsonValue` 와
    // 구조적으로 안전 (단순히 `unknown` index signature 가 nominal 일치 안 함).
    const errorPayload = error! as unknown as Prisma.InputJsonValue;

    // 마지막 실패만 보존 (시도 history 는 추적 안 함). WHERE 절:
    //   - analyzedAt IS NULL → 성공 분석이 이미 들어와 있으면 덮어쓰기 금지.
    //     (외부 파이프라인이 success 후 failed 재전송하는 비정상 케이스 방어.)
    //   - assignment.requestId 매치 → succeeded 분기와 동일한 cross-validation.
    const updated = await prisma.planProposal.updateMany({
      where: {
        id: proposal_id,
        analyzedAt: null,
        assignment: { requestId: plan_request_id },
      },
      data: {
        analysisError: errorPayload,
        analysisErrorAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      console.warn(
        "[webhook/analysis] failed payload no-op (already analyzed, mismatched plan_request_id, or unknown id)",
        { request_id, proposal_id, plan_request_id },
      );
    } else {
      // 어드민 "분석 실패" 뷰 + 해당 요청 상세 즉시 반영.
      revalidatePath("/admin/analysis-failures");
      revalidatePath(`/admin/requests/${plan_request_id}`);
    }

    return Response.json({ ok: true });
  }

  // status === "succeeded" + result is non-null (refine 가 보장).
  // 첫 콜백만 INSERT — proposal.analyzedAt + report 를 한 트랜잭션에 묶어 race 시
  // proposal.updateMany WHERE analyzedAt IS NULL 이 정확히 한 호출에서만 1 row
  // 갱신, 그 호출만 report.create 까지 수행.
  await prisma.$transaction(async (tx) => {
    // WHERE 에 assignment.requestId 매치까지 포함 — 페이로드 위조/혼선 (다른
    // plan_request 의 proposal_id 가 와도) 차단. assignment relation 으로 join.
    const updated = await tx.planProposal.updateMany({
      where: {
        id: proposal_id,
        analyzedAt: null,
        assignment: { requestId: plan_request_id },
      },
      data: { analyzedAt: new Date() },
    });

    if (updated.count === 1) {
      // schema_version 은 컬럼으로 분리, 본문 (report) 엔 안 들어감.
      const { schema_version, ...reportBody } = result!;
      await tx.planProposalAnalysisReport.create({
        data: {
          proposalId: proposal_id,
          schemaVersion: schema_version,
          report: reportBody,
          durationMs: duration_ms,
        },
      });
    } else {
      console.warn(
        "[webhook/analysis] no update (proposal already analyzed, mismatched plan_request_id, or unknown id)",
        { request_id, proposal_id, plan_request_id },
      );
    }
  });

  // 멱등 전이 — plan_request 의 **모든** plan_request_assignment 가 submitted + proposal 이
  // analyzed 인 경우에만 completed. proposal.count 만 보면 pending/expired assignment
  // 가 제외돼 1개만 분석돼도 전이되는 버그가 있어서, assignment 총수 vs fully-analyzed
  // 수를 직접 비교.
  const [total, fullyAnalyzed] = await Promise.all([
    prisma.planRequestAssignment.count({
      where: { requestId: plan_request_id },
    }),
    prisma.planRequestAssignment.count({
      where: {
        requestId: plan_request_id,
        status: "submitted",
        proposal: { analyzedAt: { not: null } },
      },
    }),
  ]);

  if (total > 0 && total === fullyAnalyzed) {
    // 첫 전이만 알림 발송 — count===1 인 호출만 이후 LMS 까지 진행 (race-safe 멱등).
    // updateMany WHERE status='analyzing' 가 0 row 면 다른 콜백이 이미 transition 한 것.
    const transitioned = await prisma.planRequest.updateMany({
      where: { id: plan_request_id, status: "analyzing" },
      data: { status: "completed" },
    });
    revalidatePath("/admin/requests");

    if (transitioned.count === 1) {
      await notifyAnalysisCompleted(plan_request_id);
    }
  }

  return Response.json({ ok: true });
}

/**
 * 분석 완료 알림 — 가입자 휴대폰으로 결과 페이지 링크 LMS 발송.
 *
 * finalizeRequest 가 consentMessaging=true 를 강제하므로 dispatched 까지 간 모든
 * request 는 수신 동의 완료 상태. phone/resultToken 은 finalize 트랜잭션이 함께 set.
 * 실패는 log 만 — 분석 완료 transition 은 이미 됐으므로 webhook 응답엔 영향 없음.
 */
async function notifyAnalysisCompleted(planRequestId: string): Promise<void> {
  const request = await prisma.planRequest.findUnique({
    where: { id: planRequestId },
    select: { name: true, phone: true, resultToken: true },
  });
  if (!request?.phone || !request.resultToken) {
    console.warn(
      "[webhook/analysis] completed notification skipped — missing phone or resultToken",
      { planRequestId },
    );
    return;
  }

  const origin = await resolveOrigin();
  const url = `${origin}/result/${request.resultToken}`;
  const customerName = request.name ?? "고객";
  const msg = [
    `[${getServiceName()}] ${customerName}님께서 선택하신 파트너님들의 제안서를 Claim AI가 분석했어요:)`,
    `지금 바로 분석 결과를 확인해보시고 마음에 드는 파트너님께 연락을 요청해보세요!`,
    ``,
    url,
  ].join("\n");
  try {
    await sendNotificationLms(request.phone, msg);
  } catch (err) {
    console.error("[webhook/analysis] completed notification LMS failed", {
      planRequestId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * HMAC-SHA256 검증. `sha256=<hex>` 형식의 헤더 값을 raw body 의 HMAC 과 비교.
 * 상수 시간 비교 (timingSafeEqual) — 길이 다르면 즉시 false.
 */
function verifyHmac(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}
