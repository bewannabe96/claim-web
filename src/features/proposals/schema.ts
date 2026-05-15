import { z } from "zod";

/* ============================================================
 * MatchAssignment — (Request × Agent) 1대1 슬롯
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
  agentId: string;
  /** 일회용 토큰 — 알림톡 URL 진입용. T 시간 내 만료. */
  token: string;
  status: AssignmentStatus;
  createdAt: string;
  submittedAt?: string;
  proposalId?: string;
};

/* ============================================================
 * Proposal — 제안서 (PDF + 한줄 설계 요약)
 *
 * 정형 필드 (보험료, 담보, 갱신/환급 등) 는 AI 가 PDF 에서 추출하므로
 * 설계사 입력에서 받지 않음. 설계사는 PDF 한 장과 "어떤 점에 집중해서
 * 설계했는지" 한 줄만 작성 — 인사말·자기소개 제외, 설계 의도에 집중.
 * ============================================================ */

export const ProposalSubmissionSchema = z.object({
  pdfFileName: z.string().min(1, "제안서 PDF를 첨부해주세요."),
  note: z
    .string()
    .min(1, "설계 한줄 요약을 작성해주세요.")
    .max(100, "한줄 요약은 100자 이내로 작성해주세요."),
});

export type ProposalSubmissionInput = z.infer<typeof ProposalSubmissionSchema>;

export type ProposalSubmissionState =
  | {
      ok?: false;
      errors?: Partial<
        Record<keyof ProposalSubmissionInput | "_form", string[]>
      >;
    }
  | undefined;

export type Proposal = ProposalSubmissionInput & {
  id: string;
  assignmentId: string;
  submittedAt: string;
};
