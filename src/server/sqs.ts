import "server-only";

import { randomUUID } from "node:crypto";

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { z } from "zod";

/**
 * SQS client + 분석 잡 발행 헬퍼.
 *
 * 흐름:
 *   1. 설계사가 제안서 PDF 업로드 + submit → `submitPlanProposal` 액션.
 *   2. DB 트랜잭션 commit 후 `publishAnalysisJob({ planRequestId, s3Key, proposalId })` 호출.
 *   3. eightytwo_judge 파이프라인이 큐를 polling, S3 PDF 분석 → 콜백으로 리포트 전달.
 *
 * 인증 자격은 S3 와 동일한 IAM user 공유. 정책에 큐 ARN 의 `sqs:SendMessage` 추가.
 */

const EnvSchema = z.object({
  AWS_REGION: z.string().min(1, "AWS_REGION missing"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID missing"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY missing"),
  SQS_ANALYSIS_QUEUE_URL: z.string().url("SQS_ANALYSIS_QUEUE_URL missing"),
  /** eightytwo_judge 가 분석 완료 시 POST 할 우리 웹훅 URL (절대 URL, scheme 포함). */
  ANALYSIS_CALLBACK_URL: z.string().url("ANALYSIS_CALLBACK_URL missing"),
});

type SqsEnv = z.infer<typeof EnvSchema>;

/**
 * env 검증 + SQSClient 생성을 **첫 호출 시점으로 지연** (s3.ts 와 동일 패턴).
 * 모듈 로드 시점에 validate 하면 SQS env 미설정인 dev 환경에서 폼 페이지가 안 뜸.
 */
let cached: { env: SqsEnv; client: SQSClient } | null = null;

function getSqs(): { env: SqsEnv; client: SQSClient } {
  if (cached) return cached;
  const env = EnvSchema.parse({
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    SQS_ANALYSIS_QUEUE_URL: process.env.SQS_ANALYSIS_QUEUE_URL,
    ANALYSIS_CALLBACK_URL: process.env.ANALYSIS_CALLBACK_URL,
  });
  const client = new SQSClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  cached = { env, client };
  return cached;
}

/**
 * eightytwo_judge `proposal_analysis` 그래프 잡 발행.
 *
 * 페이로드 스키마 (소비자 측 컨트랙트):
 *   {
 *     "request_id": "<uuid>",           // 메시지마다 새로 생성 — correlation/logging 용
 *     "graph": "proposal_analysis",
 *     "input": { "s3_key": "<proposal-pdf-s3-key>" },
 *     "webhook": { "url": "<absolute webhook url>" },
 *     "metadata": {
 *       "proposal_id": "<proposal-id>",
 *       "plan_request_id": "<plan-request-id>"
 *     }
 *   }
 *
 * `metadata` 는 eightytwo_judge 가 콜백 본문에 그대로 passthrough. 웹훅 라우트는
 * `metadata.proposal_id` 로 proposal 마킹 + 리포트 저장, `metadata.plan_request_id`
 * 로 pending 체크 + plan_request 전이.
 *
 * 콜백은 분석 완료 시 우리 `/api/webhooks/eightytwo-judge-analysis` 로 POST.
 * 페이로드: `{ request_id, status, result|error, metadata, duration_ms }` +
 * `X-Signature: sha256=<hmac>` 헤더.
 *
 * 호출자는 트랜잭션 commit **후** 호출 (`submitPlanProposal`). 실패는 throw —
 * 호출자가 graceful 처리 (로그 후 사용자 응답은 성공).
 */
export async function publishAnalysisJob(input: {
  planRequestId: string;
  s3Key: string;
  proposalId: string;
}): Promise<void> {
  const { env, client } = getSqs();
  const body = {
    request_id: randomUUID(),
    graph: "proposal_analysis",
    input: { s3_key: input.s3Key },
    webhook: { url: env.ANALYSIS_CALLBACK_URL },
    metadata: {
      proposal_id: input.proposalId,
      plan_request_id: input.planRequestId,
    },
  };
  await client.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_ANALYSIS_QUEUE_URL,
      MessageBody: JSON.stringify(body),
    }),
  );
}
