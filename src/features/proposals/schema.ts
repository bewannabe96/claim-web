import { z } from "zod";

/* ============================================================
 * MatchAssignment — (Request × Partner) 1대1 슬롯
 * ============================================================ */

export const ASSIGNMENT_STATUSES = [
  "pending",   // 설계사에게 송부됨, 미제출
  "submitted", // 제출 완료
  "expired",   // 시간 초과 미제출
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export type MatchAssignment = {
  id: string;
  requestId: string;
  partnerId: string;
  /** 일회용 토큰 — 알림톡 URL 진입용. T 시간 내 만료. */
  token: string;
  status: AssignmentStatus;
  createdAt: string;
  submittedAt?: string;
  proposalId?: string;
};

/* ============================================================
 * Proposal — 제안서 (S3 PDF + 한줄 설계 요약)
 *
 * 정형 필드 (보험료, 담보, 갱신/환급 등) 는 AI 가 PDF 에서 추출하므로 설계사
 * 입력에서 받지 않음. 설계사는 진설계 PDF (S3 저장) + "어떤 점에 집중했는지"
 * 100자 한 줄만 작성.
 *
 * 업로드 흐름 (2-step):
 *   1. `requestPdfUpload(token)` → presigned PUT URL + s3Key 반환
 *   2. 클라가 S3 로 직접 PUT (우리 함수 메모리 안 거침)
 *   3. `submitProposal(token, { pdfS3Key, note })` → HEAD 검증 + DB insert
 * ============================================================ */

/**
 * 폼 검증 schema — `pdfS3Key` 는 step (1) 에서 발급된 키, `note` 는 사용자 입력.
 * 키 패턴 검증은 server-side (`isProposalKeyForAssignment`) 가 추가로 수행.
 */
export const ProposalSubmissionSchema = z.object({
  pdfS3Key: z.string().min(1, "제안서 PDF를 첨부해주세요."),
  note: z
    .string()
    .min(1, "설계 한줄 요약을 작성해주세요.")
    .max(100, "한줄 요약은 100자 이내로 작성해주세요."),
});

export type ProposalSubmissionInput = z.infer<typeof ProposalSubmissionSchema>;

export type ProposalSubmissionState =
  | { ok: true }
  | {
      ok?: false;
      errors?: Partial<
        Record<keyof ProposalSubmissionInput | "_form", string[]>
      >;
    }
  | undefined;

/** 1단계 presign 응답 — 클라가 URL 로 PUT 후 s3Key 를 2단계 submit 에 전달. */
export type PresignUploadState =
  | { ok: true; url: string; s3Key: string }
  | { ok?: false; errors?: { _form?: string[] } }
  | undefined;

export type Proposal = {
  id: string;
  assignmentId: string;
  pdfS3Key: string;
  /** HEAD 검증 시점에 capture. presigned PUT 으론 size 강제 불가, 대신 사후 검증. */
  pdfSizeBytes: number | null;
  /**
   * PDF 본문 SHA-256 (hex, 64자). 업로드 시 항상 채워짐 — hash 계산 실패 시 제출
   * 자체가 실패한다. 동일 PDF 식별 / audit 용도 (분석 리포트 join 키는 proposal.id).
   */
  pdfHash: string;
  note: string;
  submittedAt: string;
  /** 외부 분석 파이프라인 콜백 수신 시각. null = 아직. */
  analyzedAt?: string;
};
