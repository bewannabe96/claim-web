import "server-only";

import type {
  PlanRequest as PrismaPlanRequest,
  PlanRequestAssignmentCandidate,
  PlanRequestMedicalHistory,
} from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import type { Gender } from "@/types";

import {
  ACTIVE_STATUSES,
  PRE_SUBMISSION_STATUSES,
  type CoverageRequest,
  type PlanRequest,
  type PlanRequestStatus,
  type TreatmentPeriod,
} from "./schema";

/**
 * 한 요청을 fetch 할 때 항상 같이 가져오는 1:N / M:N 관계.
 * 자식 정렬은 입력 순서 보존을 위해 position / candidateRank 사용.
 */
const PLAN_REQUEST_INCLUDE = {
  medicalHistory: { orderBy: { position: "asc" } },
  candidates: { orderBy: { candidateRank: "asc" } },
} as const;

type PlanRequestRow = PrismaPlanRequest & {
  medicalHistory: PlanRequestMedicalHistory[];
  candidates: PlanRequestAssignmentCandidate[];
};

export async function getRequestById(id: string): Promise<PlanRequest | null> {
  const row = await prisma.planRequest.findUnique({
    where: { id },
    include: PLAN_REQUEST_INCLUDE,
  });
  return row ? mapPlanRequest(row) : null;
}

export async function getRequestByResultToken(
  token: string,
): Promise<PlanRequest | null> {
  const row = await prisma.planRequest.findFirst({
    where: { resultToken: token },
    include: PLAN_REQUEST_INCLUDE,
  });
  return row ? mapPlanRequest(row) : null;
}

/**
 * 같은 번호로 이미 진행 중인 요청이 있는지 확인 — 중복 송부 차단용.
 * 휴대폰 번호는 finalize 단계에서 plan_request.phone 컬럼에 채워지므로 이를 기준.
 *
 * Race-condition 은 DB 의 partial unique index (phone + active status)
 * 가 추가 방어선. 여기선 사용자 친화적 에러 위해 사전 체크만.
 */
export async function hasActiveRequestForPhone(
  phone: string,
  excludeRequestId?: string,
): Promise<boolean> {
  const count = await prisma.planRequest.count({
    where: {
      phone,
      status: { in: [...ACTIVE_STATUSES] },
      ...(excludeRequestId ? { NOT: { id: excludeRequestId } } : {}),
    },
  });
  return count > 0;
}

/**
 * 어드민 — 모니터링. 최신 등록 순.
 * 기본은 제출까지 간 요청만 — `includePreSubmission` 으로 작성·인증 중 임시 요청까지 포함.
 */
export async function listAllRequests(
  opts: { includePreSubmission?: boolean } = {},
): Promise<PlanRequest[]> {
  const rows = await prisma.planRequest.findMany({
    where: opts.includePreSubmission
      ? undefined
      : { status: { notIn: [...PRE_SUBMISSION_STATUSES] } },
    orderBy: { createdAt: "desc" },
    include: PLAN_REQUEST_INCLUDE,
  });
  return rows.map(mapPlanRequest);
}

/** 어드민 모니터링 — 제출 전(작성·선택·인증 중) 임시 요청 수. 기본 뷰 숨김 안내용. */
export async function countPreSubmissionRequests(): Promise<number> {
  return prisma.planRequest.count({
    where: { status: { in: [...PRE_SUBMISSION_STATUSES] } },
  });
}

/**
 * Prisma row → 도메인 nested 형태 (step1/step3).
 *
 * consents 필드: DB 는 boolean, zod Step3Schema 는 "on" | "off" (consentThirdParty) /
 * literal "on" (consentMessaging). consentMessaging 은 finalize 통과 시 항상 true
 * 가 보장되어 "on" 으로 고정. consentThirdParty 는 현재 UI 에서 숨겨져 항상 false
 * 로 저장되므로 row 의 실제 boolean 을 반영 — true 면 "on", 아니면 "off"
 * (어드민 상세가 `=== "on"` 으로 "동의/—" 분기).
 */
function mapPlanRequest(row: PlanRequestRow): PlanRequest {
  return {
    id: row.id,
    gender: (row.gender as Gender | null) ?? undefined,
    step1: {
      occupation: row.occupation,
      monthlyBudgetMin: row.monthlyBudgetMin,
      monthlyBudgetMax: row.monthlyBudgetMax,
      coverage: row.coverage as CoverageRequest,
      medicalHistory: row.medicalHistory.map((m) => ({
        diagnosis: m.diagnosis,
        treatmentPeriod: m.treatmentPeriod as TreatmentPeriod,
        treatmentStartDate: m.treatmentStartDate.toISOString().slice(0, 10),
        hospitalizationDays: m.hospitalizationDays,
        outpatientVisits: m.outpatientVisits,
        hadSurgery: m.hadSurgery,
      })),
      externalProposalKeys: row.externalProposalKeys,
      additionalNotes: row.additionalNotes ?? undefined,
    },
    step3:
      row.name && row.phone
        ? {
            name: row.name,
            phone: row.phone,
            birthDate: row.birthDate?.toISOString().slice(0, 10) ?? undefined,
            consentThirdParty: row.consentThirdParty ? "on" : "off",
            consentMessaging: "on",
          }
        : undefined,
    candidatePartnerIds: row.candidates.map((c) => c.partnerId),
    selectedPartnerIds: row.candidates
      .filter((c) => c.selected)
      .map((c) => c.partnerId),
    status: row.status as PlanRequestStatus,
    createdAt: row.createdAt.toISOString(),
    dispatchedAt: row.dispatchedAt?.toISOString() ?? undefined,
    deadlineAt: row.deadlineAt?.toISOString() ?? undefined,
    resultViewedAt: row.resultViewedAt?.toISOString() ?? undefined,
    rematchCount: row.rematchCount,
    resultToken: row.resultToken ?? undefined,
  };
}
