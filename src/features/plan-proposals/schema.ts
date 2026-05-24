import { z } from "zod";

/* ============================================================
 * 연락 수단 — 결과 페이지 "상담 진행하기" CTA 에서 가입자가 선택.
 * 설계사 LMS 본문에 노출되어 어떤 채널로 연락할지 지시.
 * ============================================================ */

export const CONTACT_CHANNELS = ["kakao", "sms"] as const;
export const ContactChannelSchema = z.enum(CONTACT_CHANNELS);
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

/** 알림톡 본문의 `연락 요청 방법 : {label}` 슬롯에 들어가는 한글 라벨. */
export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  kakao: "카카오톡",
  sms: "문자",
};

/* ============================================================
 * PlanRequestAssignment — (Request × Partner) 1대1 슬롯
 * ============================================================ */

export const ASSIGNMENT_STATUSES = [
  "pending",   // 설계사에게 송부됨, 미제출
  "submitted", // 제출 완료
  // TODO: 알림 발송 (2-4) — `deadlineAt` 임박 (예: T-1h) + status='pending' 인 설계사
  // 에게 리마인더 LMS. deadline 도과 시 `pending → expired` 전이 + 마감 안내 LMS 는
  // `/api/cron/assignment-deadline-expiry` 에서 구현 완료. T-1h 리마인더는 별도 cron
  // 으로 미구현.
  "expired",   // 시간 초과 미제출
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export type PlanRequestAssignment = {
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
 * PlanProposal — 제안서 (S3 PDF + 한줄 설계 요약)
 *
 * 정형 필드 (보험료, 담보, 갱신/환급 등) 는 AI 가 PDF 에서 추출하므로 설계사
 * 입력에서 받지 않음. 설계사는 진설계 PDF (S3 저장) + "어떤 점에 집중했는지"
 * 100자 한 줄만 작성.
 *
 * 업로드 흐름 (2-step):
 *   1. `requestPdfUpload(token)` → presigned PUT URL + s3Key 반환
 *   2. 클라가 S3 로 직접 PUT (우리 함수 메모리 안 거침)
 *   3. `submitPlanProposal(token, { pdfS3Key, note })` → HEAD 검증 + DB insert
 * ============================================================ */

/**
 * 폼 검증 schema — `pdfS3Key` 는 step (1) 에서 발급된 키, `note` 는 사용자 입력.
 * 키 패턴 검증은 server-side (`isPlanProposalKeyForAssignment`) 가 추가로 수행.
 */
export const PlanProposalSubmissionSchema = z.object({
  pdfS3Key: z.string().min(1, "제안서 PDF를 첨부해주세요."),
  note: z
    .string()
    .min(1, "설계 한줄 요약을 작성해주세요.")
    .max(100, "한줄 요약은 100자 이내로 작성해주세요."),
});

export type PlanProposalSubmissionInput = z.infer<typeof PlanProposalSubmissionSchema>;

export type PlanProposalSubmissionState =
  | { ok: true }
  | {
      ok?: false;
      errors?: Partial<
        Record<keyof PlanProposalSubmissionInput | "_form", string[]>
      >;
    }
  | undefined;

/** 1단계 presign 응답 — 클라가 URL 로 PUT 후 s3Key 를 2단계 submit 에 전달. */
export type PresignUploadState =
  | { ok: true; url: string; s3Key: string }
  | { ok?: false; errors?: { _form?: string[] } }
  | undefined;

export type PlanProposal = {
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
  /** 가입자가 결과 페이지에서 이 제안서를 보고 "상담 진행하기" 한 시각 (요청 트리거 시각). */
  contactRequestedAt?: string;
  /**
   * 외부 분석 파이프라인이 returned `status=failed` 시 마지막 실패 정보.
   * 성공 시점이 와도 명시적으로 비우지 않으므로, read 측은 `analyzedAt` 우선 분기.
   * 재시도 (retryPlanProposalAnalysis) 시점에 두 필드 모두 초기화 — `analyzedAt`
   * 까지 함께 리셋되고 기존 분석 리포트 row 도 삭제됨 (이미 분석 완료된 제안서도
   * 재분석 가능).
   */
  analysisError?: AnalysisError;
  analysisErrorAt?: string;
  /**
   * 어드민이 분석 실패를 "건너뜀" 처리한 시각. 마킹된 제안서는 결과 화면에서
   * "분석 불가" 안내로 표시되고, 조기 마감 (closePlanRequest) 에선 analyzedAt 과
   * 동급으로 취급. 분석 실패 (analysisErrorAt) 가 있을 때만 set 가능.
   */
  analysisSkippedAt?: string;
};

/* ============================================================
 * 분석 실패 페이로드 — webhook `status=failed` 시 외부 파이프라인이 보내는 본문.
 *
 * group 분류:
 *   - input_error      → 입력 자체 문제 (잘못된 PDF, 파싱 불능 등)
 *   - product_id_match → 카탈로그에 없는 상품 — 어드민 수기 매핑 후 재시도
 *   - internal_error   → 파이프라인 내부 오류 — 보통 재시도로 회복
 *
 * `type` 은 그룹별 세부 사유 (no_catalog_match 등) — 외부에서 확장될 수 있으므로
 * enum 으로 고정하지 않고 open string. `detail` 은 타입별 자유 JSON (디버깅 용).
 * ============================================================ */

export const ANALYSIS_ERROR_GROUPS = [
  "input_error",
  "product_id_match",
  "internal_error",
] as const;

export type AnalysisErrorGroup = (typeof ANALYSIS_ERROR_GROUPS)[number];

export const AnalysisErrorSchema = z.object({
  group: z.enum(ANALYSIS_ERROR_GROUPS),
  type: z.string().min(1),
  message: z.string().min(1),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export type AnalysisError = z.infer<typeof AnalysisErrorSchema>;

export const ANALYSIS_ERROR_GROUP_LABEL: Record<AnalysisErrorGroup, string> = {
  input_error: "입력 오류",
  product_id_match: "상품 매칭 실패",
  internal_error: "내부 오류",
};
