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
 * Proposal — 진설계 (정형 필드 + PDF + 메모)
 * PRD §5.4 — 카테고리 무관 공통 필드
 * ============================================================ */

export const RENEWAL_TYPES = ["renewable", "non_renewable"] as const;
export type RenewalType = (typeof RENEWAL_TYPES)[number];

export const RENEWAL_TYPE_LABEL: Record<RenewalType, string> = {
  renewable: "갱신형",
  non_renewable: "비갱신형",
};

export const REFUND_TYPES = ["maturity_refund", "no_refund"] as const;
export type RefundType = (typeof REFUND_TYPES)[number];

export const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  maturity_refund: "만기 환급",
  no_refund: "순수 보장",
};

export const ProposalSubmissionSchema = z.object({
  monthlyPremium: z.coerce
    .number({ message: "월 보험료는 숫자여야 합니다." })
    .int()
    .positive("월 보험료는 0보다 커야 합니다."),
  paymentYears: z.coerce.number().int().min(1).max(100),
  totalCoverage: z.coerce.number().int().min(0),
  keyBenefit1: z.string().min(1, "핵심 담보 1을 입력해주세요.").max(60),
  keyBenefit2: z.string().min(1, "핵심 담보 2를 입력해주세요.").max(60),
  keyBenefit3: z.string().min(1, "핵심 담보 3을 입력해주세요.").max(60),
  renewalType: z.enum(RENEWAL_TYPES as unknown as [RenewalType, RenewalType]),
  refundType: z.enum(REFUND_TYPES as unknown as [RefundType, RefundType]),
  pdfFileName: z.string().min(1, "PDF 파일을 첨부해주세요."),
  note: z.string().max(2000).optional(),
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
