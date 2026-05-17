import { createHmac, timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AnalysisReportV5Schema,
  CURRENT_REPORT_VERSION,
} from "@/features/proposals/analysis-schema";
import { prisma } from "@/server/db/prisma";

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
 *     error:  { code, message } | null,   // failed 시 필수
 *     metadata: {
 *       proposal_id: string,              // 우리 도메인 식별자
 *       plan_request_id: string,          // pending 체크 + 전이 기준
 *     },
 *     duration_ms: number
 *   }
 *
 * 동작:
 *   - `failed` → 로그만 (proposal.analyzedAt=null 유지, 재시도 가능), 200 ack.
 *   - `succeeded` → 트랜잭션:
 *       1. proposal.analyzedAt = now() (첫 콜백만, WHERE id + assignment.requestId
 *          매치 + analyzedAt IS NULL — plan_request_id cross-check 로 페이로드 위조 차단)
 *       2. updated.count===1 이면 proposal_analysis_report INSERT (proposalId 1:1)
 *     그 후 plan_request 의 **모든 match_assignment** 가 submitted + 그 proposal 이
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
    error: z
      .object({ code: z.string(), message: z.string() })
      .nullable(),
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
    return Response.json({ ok: true });
  }

  // status === "succeeded" + result is non-null (refine 가 보장).
  // 첫 콜백만 INSERT — proposal.analyzedAt + report 를 한 트랜잭션에 묶어 race 시
  // proposal.updateMany WHERE analyzedAt IS NULL 이 정확히 한 호출에서만 1 row
  // 갱신, 그 호출만 report.create 까지 수행.
  await prisma.$transaction(async (tx) => {
    // WHERE 에 assignment.requestId 매치까지 포함 — 페이로드 위조/혼선 (다른
    // plan_request 의 proposal_id 가 와도) 차단. assignment relation 으로 join.
    const updated = await tx.proposal.updateMany({
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
      await tx.proposalAnalysisReport.create({
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

  // 멱등 전이 — plan_request 의 **모든** match_assignment 가 submitted + proposal 이
  // analyzed 인 경우에만 completed. proposal.count 만 보면 pending/expired assignment
  // 가 제외돼 1개만 분석돼도 전이되는 버그가 있어서, assignment 총수 vs fully-analyzed
  // 수를 직접 비교.
  const [total, fullyAnalyzed] = await Promise.all([
    prisma.matchAssignment.count({
      where: { requestId: plan_request_id },
    }),
    prisma.matchAssignment.count({
      where: {
        requestId: plan_request_id,
        status: "submitted",
        proposal: { analyzedAt: { not: null } },
      },
    }),
  ]);

  if (total > 0 && total === fullyAnalyzed) {
    await prisma.planRequest.updateMany({
      where: { id: plan_request_id, status: "analyzing" },
      data: { status: "completed" },
    });
    revalidatePath("/admin/requests");
  }

  return Response.json({ ok: true });
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
