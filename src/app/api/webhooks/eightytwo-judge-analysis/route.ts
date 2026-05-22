import { createHmac, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AnalysisReportV5Schema,
  CURRENT_REPORT_VERSION,
} from "@/features/plan-proposals/analysis-schema";
import { AnalysisErrorSchema } from "@/features/plan-proposals/schema";
import { closePlanRequest } from "@/features/plan-requests/state-transition";
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
 *     후 `retryPlanProposalAnalysis` 액션으로 재발행.
 *   - `succeeded` → 트랜잭션:
 *       1. proposal.analyzedAt = now() (첫 콜백만, WHERE id + assignment.requestId
 *          매치 + analyzedAt IS NULL — plan_request_id cross-check 로 페이로드 위조 차단)
 *       2. updated.count===1 이면 plan_proposal_analysis_report INSERT (proposalId 1:1)
 *     그 후 `closePlanRequest(plan_request_id)` 호출 — 모든 제출 제안서가 분석 완료된
 *     경우 (조기 마감) `analyzing → completed`. 마감 판정/전이/알림 책임은 cron (시간
 *     마감) 과 공유하므로 `features/plan-requests/state-transition.ts` 의 `closePlanRequest`
 *     단일 진입점에 통합.
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
    // 외부 파이프라인 (eightytwo_judge) 디버깅용 — 어떤 필드가 왜 틀렸는지
    // dotted path 로 반환. flatten() 은 nested (metadata.*, result.*) 를
    // 1-depth 로 뭉개 어느 하위 필드인지 안 보이므로 issues 를 직접 매핑.
    // refine() 위반은 path 가 비어 "(root)" 로 표기. HMAC 검증을 이미 통과한
    // 호출자만 도달하므로 detail 노출 안전.
    const fieldErrors = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      code: issue.code,
      message: issue.message,
    }));
    console.warn("[webhook/analysis] payload validation failed", {
      fieldErrors,
    });
    return Response.json(
      { error: "invalid payload", fieldErrors },
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

  // 마감 판정 — 모든 제출 제안서가 분석 완료면 (조기 마감) `analyzing → completed`.
  // 아직 분석 대기 중인 제안서가 있고 마감시간 전이면 no-op (cron 의 시간 마감이
  // 이어받음). 분석 완료 콜백은 submitted >= 1 을 보장하므로 rematching 분기로는
  // 진입하지 않는다. 멱등 — 단일 트랜잭션 전이 latch.
  await closePlanRequest(plan_request_id);

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
