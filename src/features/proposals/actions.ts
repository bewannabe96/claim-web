"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/server/dal";
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

/* ============================================================
 * 연락 요청 — 결과 페이지 "문자 보내기" CTA
 *
 * 가입자가 제안서 비교 후 특정 설계사에게 연락을 요청한 시점에 호출. 인증은
 * resultToken (가입자의 일회용 토큰) — 페이지 자체가 토큰 기반이라 액션도 동일.
 *
 * 멱등성: 같은 (resultToken, proposalId) 로 여러 번 호출돼도 카운터는 1 만 올라감.
 * `proposal.contactedAt IS NULL` 조건의 updateMany 가 0 row 면 (이미 마킹됨) 카운터
 * 증가 트랜잭션 자체를 스킵. 새 탭 / 새로고침으로 button 재활성 케이스 방어.
 *
 * 검증:
 *   1. resultToken → plan_request 존재 확인
 *   2. proposalId → assignment.requestId 가 위 plan_request 와 일치
 *   3. proposal.contactedAt 이 NULL 일 때만 set + counter +1
 *
 * 외부 SMS 발송은 본 액션 책임 아님 (향후 작업) — 본 액션은 "가입자가 연락을
 * 원했다" 라는 사실의 기록만 담당.
 * ============================================================ */

export type RequestContactResult =
  | { ok: true; alreadyContacted: boolean }
  | { ok: false; error: "not_found" };

export async function requestProposalContact(
  resultToken: string,
  proposalId: string,
): Promise<RequestContactResult> {
  const request = await prisma.planRequest.findFirst({
    where: { resultToken },
    select: { id: true },
  });
  if (!request) return { ok: false, error: "not_found" };

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      contactedAt: true,
      assignment: { select: { requestId: true, partnerId: true } },
    },
  });
  if (!proposal || proposal.assignment.requestId !== request.id) {
    return { ok: false, error: "not_found" };
  }

  if (proposal.contactedAt) {
    // 멱등 — UI 가 button 을 disabled 로 풀어줄 수 있도록 ok=true 로 응답.
    return { ok: true, alreadyContacted: true };
  }

  // race-safe 마킹 + 카운터 증가. updateMany WHERE contactedAt IS NULL 의 count 가
  // 0 이면 다른 호출이 먼저 마킹한 것 — 그 경우 카운터 트랜잭션을 건너뛰어 중복
  // +1 방지.
  const marked = await prisma.proposal.updateMany({
    where: { id: proposalId, contactedAt: null },
    data: { contactedAt: new Date() },
  });
  if (marked.count > 0) {
    await prisma.partnerMatchStats.updateMany({
      where: { partnerId: proposal.assignment.partnerId },
      data: { contactedCount: { increment: 1 } },
    });
  }

  revalidatePath(`/result/${resultToken}`);
  return { ok: true, alreadyContacted: false };
}

/* ============================================================
 * 분석 재시도 — 어드민 전용
 *
 * 외부 파이프라인이 `status=failed` 를 보낸 proposal 에 대해 어드민이 수기 수정
 * (예: product_id_match 시 카탈로그 매핑 추가) 후 재발행. webhook 측에서 이미
 * `analysisError` 가 마킹되어 있고, 우리는:
 *   1. analyzedAt 이 차 있으면 거부 (이미 성공 — 외부에서 늦은 success 콜백이 와서
 *      덮어쓴 케이스).
 *   2. analysisError 두 컬럼 null 로 초기화 (race-safe: WHERE analyzedAt IS NULL).
 *   3. SQS 재발행 — 페이로드는 최초 submit 과 동일 (proposalId/planRequestId/s3Key).
 *      webhook 이 첫 콜백처럼 동일하게 처리.
 *
 * 실패 응답 (`ok: false`) 은 UI 에서 토스트/알럿으로 노출. publish 실패는 throw —
 * 호출부 (client component) 가 catch 해서 사용자에게 알림.
 * ============================================================ */

export type RetryAnalysisResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "already_analyzed" };

export async function retryProposalAnalysis(
  proposalId: string,
): Promise<RetryAnalysisResult> {
  await requireAdminSession();

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      pdfS3Key: true,
      analyzedAt: true,
      assignment: { select: { requestId: true } },
    },
  });

  if (!proposal) return { ok: false, error: "not_found" };
  if (proposal.analyzedAt) return { ok: false, error: "already_analyzed" };

  // race-safe 초기화 — 동시에 webhook 이 success 콜백을 처리 중이면 analyzedAt 이
  // 채워지면서 이 update 가 0 row 가 되고, 그 경우 success 가 이미 들어왔단 뜻이라
  // 재시도 자체가 무의미. 그래도 publish 는 멱등 (webhook 이 또 다른 success 받아도
  // updateMany WHERE analyzedAt IS NULL 로 no-op) 이므로 그대로 진행.
  await prisma.proposal.updateMany({
    where: { id: proposalId, analyzedAt: null },
    // nullable Json 컬럼을 명시적으로 비우려면 sentinel `Prisma.JsonNull` 사용
    // (raw `null` 은 "필드 자체를 건드리지 말라"는 의미라 컴파일 거부).
    data: { analysisError: Prisma.JsonNull, analysisErrorAt: null },
  });

  await publishAnalysisJob({
    planRequestId: proposal.assignment.requestId,
    s3Key: proposal.pdfS3Key,
    proposalId,
  });

  revalidatePath("/admin/analysis-failures");
  revalidatePath(`/admin/requests/${proposal.assignment.requestId}`);

  return { ok: true };
}
