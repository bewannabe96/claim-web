import "server-only";

import { createHash } from "node:crypto";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

import { newId } from "@/lib/id";

/**
 * S3 client + presigned URL 헬퍼.
 *
 * 흐름:
 *   1. `presignProposalUpload(assignmentId)` → presigned PUT URL + s3Key.
 *      클라가 직접 PUT 으로 업로드.
 *   2. `verifyUploadedObject(s3Key)` → HEAD 로 실제 업로드 확인 + size 캡처.
 *   3. (다운로드용) `presignProposalDownload(s3Key)` → presigned GET URL.
 *
 * Vercel 함수 body 4.5MB 한도 + 메모리 효율 이유로 PDF 바이트는 우리 함수를
 * 거치지 않음. 검증은 키 패턴 + HEAD 만.
 */

const EnvSchema = z.object({
  AWS_REGION: z.string().min(1, "AWS_REGION missing"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID missing"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY missing"),
  S3_BUCKET_PROPOSALS: z.string().min(1, "S3_BUCKET_PROPOSALS missing"),
  PROPOSAL_PDF_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
});

type S3Env = z.infer<typeof EnvSchema>;

/**
 * env 검증 + S3Client 생성을 **첫 호출 시점으로 지연**.
 * 모듈 로드 시점에 validate 하면 AWS env 가 미설정인 dev 환경에서 폼 페이지
 * 자체가 안 뜸. lazy 초기화로 read-only 페이지 영향 차단.
 */
let cached: { env: S3Env; client: S3Client } | null = null;

function getS3(): { env: S3Env; client: S3Client } {
  if (cached) return cached;
  const env = EnvSchema.parse({
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET_PROPOSALS: process.env.S3_BUCKET_PROPOSALS,
    PROPOSAL_PDF_MAX_BYTES: process.env.PROPOSAL_PDF_MAX_BYTES,
  });
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    // SDK v3.5+ default 가 "WHEN_SUPPORTED" — presigned URL signature 에
    // `x-amz-checksum-*` / `x-amz-sdk-checksum-algorithm` 헤더를 박아 넣음. 브라우저
    // PUT 은 그 헤더 없이 호출 → signature mismatch. "WHEN_REQUIRED" 로 끔.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  cached = { env, client };
  return cached;
}

export const PROPOSAL_PDF_KEY_PREFIX = "proposals/";

/**
 * 제안서 PDF 업로드용 presigned PUT URL 발급.
 *
 * Key 형태: `proposals/{assignmentId}/{nanoid}.pdf`. assignmentId 가 path 에
 * 박혀 있어 submit 단계에서 "본인 assignment 의 key 인지" 검증 가능.
 *
 * URL TTL: 10분. ContentType=application/pdf 강제 — 클라가 다른 타입 PUT 하면
 * signature mismatch 로 거부.
 */
export async function presignProposalUpload(
  assignmentId: string,
): Promise<{ url: string; s3Key: string }> {
  const { env, client } = getS3();
  const s3Key = `${PROPOSAL_PDF_KEY_PREFIX}${assignmentId}/${newId()}.pdf`;
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET_PROPOSALS,
    Key: s3Key,
    ContentType: "application/pdf",
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: 600 });
  return { url, s3Key };
}

/**
 * 제안서 PDF 다운로드용 presigned GET URL. 가입자 결과 페이지 / 어드민에서 사용.
 * TTL 짧게 (10분) — 새로고침마다 새로 발급.
 */
export async function presignProposalDownload(s3Key: string): Promise<string> {
  const { env, client } = getS3();
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET_PROPOSALS,
    Key: s3Key,
  });
  return getSignedUrl(client, cmd, { expiresIn: 600 });
}

/**
 * 업로드된 객체가 실제 존재하는지 + 크기 검증. submit 액션에서 호출.
 *
 *   - 없으면 → null
 *   - PROPOSAL_PDF_MAX_BYTES 초과 → 'too-large'
 *   - 정상 → { size }
 */
export async function verifyUploadedObject(
  s3Key: string,
): Promise<{ size: number } | "too-large" | null> {
  const { env, client } = getS3();
  try {
    const cmd = new HeadObjectCommand({
      Bucket: env.S3_BUCKET_PROPOSALS,
      Key: s3Key,
    });
    const res = await client.send(cmd);
    const size = res.ContentLength ?? 0;
    if (size > env.PROPOSAL_PDF_MAX_BYTES) return "too-large";
    return { size };
  } catch {
    return null;
  }
}

/**
 * 업로드된 PDF 본문의 SHA-256 hex (64자) 계산.
 *
 * `submitProposal` 이 HEAD 검증 직후 호출 → `Proposal.pdfHash` 컬럼에 저장
 * (동일 PDF 식별 / audit 용도). NOT NULL 컬럼이라 null 반환 시 호출자가
 * 제출 자체를 실패시킴 (fail-fast).
 *
 * stream-based — 본문을 메모리에 통째로 올리지 않고 chunk 단위로 hash 에 흘려
 * 보냄. 10MB 이하 파일이라 buffer 방식도 충분하지만, 후속 한도 상향 대비.
 *
 * 실패 처리: GetObject 자체 실패 또는 Body 없음 시 null 반환.
 */
export async function fetchObjectSha256(s3Key: string): Promise<string | null> {
  const { env, client } = getS3();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_PROPOSALS,
        Key: s3Key,
      }),
    );
    const body = res.Body;
    if (!body) return null;

    const hash = createHash("sha256");
    // SDK v3 의 Body 는 Node 환경에서 Readable (AsyncIterable<Uint8Array>).
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
    }
    return hash.digest("hex");
  } catch (e) {
    console.warn("[s3] fetchObjectSha256 failed for", s3Key, e);
    return null;
  }
}

/**
 * 키가 우리가 발급한 패턴 + 해당 assignment 소유인지 검증.
 * forgery 차단 1차 방어선 (HEAD 와 함께).
 */
export function isProposalKeyForAssignment(
  s3Key: string,
  assignmentId: string,
): boolean {
  const expectedPrefix = `${PROPOSAL_PDF_KEY_PREFIX}${assignmentId}/`;
  if (!s3Key.startsWith(expectedPrefix)) return false;
  const suffix = s3Key.slice(expectedPrefix.length);
  return /^[A-Za-z0-9_-]+\.pdf$/.test(suffix);
}
