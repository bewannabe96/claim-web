"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { newId } from "@/lib/id";
import { prisma } from "@/server/db/prisma";
import {
  fetchObjectSha256,
  isProposalKeyForAssignment,
  presignProposalUpload,
  verifyUploadedObject,
} from "@/server/s3";
import { publishAnalysisJob } from "@/server/sqs";

import {
  ProposalSubmissionSchema,
  type PresignUploadState,
  type ProposalSubmissionInput,
  type ProposalSubmissionState,
} from "./schema";

/**
 * 1단계 — presigned PUT URL 발급.
 *
 * token 으로 assignment 조회 + pending 검증 → s3Key 생성 (path 에 assignmentId
 * 박혀 forgery 차단) → presigned URL 반환. 클라가 이 URL 로 PDF 직접 PUT.
 *
 * 호출은 클라이언트 client component 에서 fetch/action 으로. 형 검증 후 2단계
 * (`submitProposal`) 에 s3Key 전달.
 */
export async function requestPdfUpload(
  token: string,
): Promise<PresignUploadState> {
  const assignment = await prisma.matchAssignment.findUnique({
    where: { token },
    select: { id: true, status: true },
  });

  if (!assignment) {
    return { ok: false, errors: { _form: ["유효하지 않은 링크입니다."] } };
  }
  if (assignment.status !== "pending") {
    return {
      ok: false,
      errors: { _form: ["이미 제출되었거나 만료된 요청입니다."] },
    };
  }

  try {
    const { url, s3Key } = await presignProposalUpload(assignment.id);
    return { ok: true, url, s3Key };
  } catch {
    return {
      ok: false,
      errors: { _form: ["업로드 URL 발급에 실패했어요. 잠시 후 다시 시도해주세요."] },
    };
  }
}

/**
 * 2단계 — 제안서 제출. 클라가 S3 에 PUT 한 뒤 호출.
 *
 * 검증 순서:
 *   1. token → assignment (pending)
 *   2. zod schema (pdfS3Key, note)
 *   3. s3Key 가 우리 assignment 의 path prefix 와 일치하는지
 *   4. S3 HEAD — 실제 객체 존재 + size ≤ MAX_BYTES
 *   5. proposal insert + assignment status='submitted' — 트랜잭션
 *
 * 시그니처는 FormData 가 아니라 객체 — 클라 client component 에서 직접 호출.
 */
export async function submitProposal(
  token: string,
  input: ProposalSubmissionInput,
): Promise<ProposalSubmissionState> {
  const assignment = await prisma.matchAssignment.findUnique({
    where: { token },
    select: { id: true, status: true, requestId: true },
  });

  if (!assignment) {
    return { ok: false, errors: { _form: ["유효하지 않은 링크입니다."] } };
  }
  if (assignment.status !== "pending") {
    return {
      ok: false,
      errors: { _form: ["이미 제출되었거나 만료된 요청입니다."] },
    };
  }

  const parsed = ProposalSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // path forgery 1차 방어 — assignment.id 가 키 경로에 박혀 있어야 함.
  if (!isProposalKeyForAssignment(parsed.data.pdfS3Key, assignment.id)) {
    return {
      ok: false,
      errors: { pdfS3Key: ["잘못된 PDF 키입니다. 다시 시도해주세요."] },
    };
  }

  // HEAD — 실제 업로드 확인 + 크기 한도 검증.
  const head = await verifyUploadedObject(parsed.data.pdfS3Key);
  if (head === null) {
    return {
      ok: false,
      errors: { pdfS3Key: ["업로드된 파일을 찾을 수 없어요. 다시 첨부해주세요."] },
    };
  }
  if (head === "too-large") {
    return {
      ok: false,
      errors: { pdfS3Key: ["파일이 너무 커요. 10MB 이하만 업로드 가능합니다."] },
    };
  }

  // PDF 본문 SHA-256 — 동일 PDF 식별 / audit 용. NOT NULL 컬럼이므로 계산 실패 시
  // 제출 자체를 막아 fail-fast (사용자는 재시도).
  const pdfHash = await fetchObjectSha256(parsed.data.pdfS3Key);
  if (!pdfHash) {
    return {
      ok: false,
      errors: { _form: ["PDF 검증에 실패했어요. 잠시 후 다시 시도해주세요."] },
    };
  }

  // proposal id 를 트랜잭션 진입 전에 생성 — SQS metadata.proposal_id 로 함께
  // 전달해 콜백이 정확히 이 proposal 을 마킹할 수 있게.
  const proposalId = newId();

  // 트랜잭션:
  //   1. proposal insert + assignment status='submitted'
  //   2. plan_request.status='dispatched' → 'analyzing' 전이 (첫 제출 시점)
  //      updateMany + WHERE status='dispatched' 로 조건부 → 이미 analyzing/completed
  //      면 no-op (idempotent, race-safe).
  await prisma.$transaction([
    prisma.proposal.create({
      data: {
        id: proposalId,
        assignmentId: assignment.id,
        pdfS3Key: parsed.data.pdfS3Key,
        pdfSizeBytes: BigInt(head.size),
        pdfHash,
        note: parsed.data.note,
      },
    }),
    prisma.matchAssignment.update({
      where: { id: assignment.id },
      data: { status: "submitted", submittedAt: new Date() },
    }),
    prisma.planRequest.updateMany({
      where: { id: assignment.requestId, status: "dispatched" },
      data: { status: "analyzing" },
    }),
  ]);

  // DB commit 후 SQS publish — eightytwo_judge 파이프라인 트리거.
  // proposal.id + plan_request.id 를 metadata 로 실어 보내 콜백이 정확히 이 row 들을
  // 식별. 실패는 로깅만 (사용자 응답은 성공). 누락 메시지는 별도 backfill 잡으로 재발행.
  try {
    await publishAnalysisJob({
      planRequestId: assignment.requestId,
      s3Key: parsed.data.pdfS3Key,
      proposalId,
    });
  } catch (e) {
    console.error("[sqs] publishAnalysisJob failed", {
      planRequestId: assignment.requestId,
      s3Key: parsed.data.pdfS3Key,
      error: e,
    });
  }

  revalidatePath("/partner/assignments");
  revalidatePath("/admin/requests");
  redirect("/partner/assignments/done");
}
