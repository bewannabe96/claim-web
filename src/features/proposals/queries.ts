import "server-only";

import type {
  MatchAssignment as PrismaMatchAssignment,
  Proposal as PrismaProposal,
} from "@prisma/client";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import type { PartnerCard } from "@/features/partners/schema";
import { prisma } from "@/server/db/prisma";

import {
  AnalysisReportV5Schema,
  CURRENT_REPORT_VERSION,
  type AnalysisReportV5,
} from "./analysis-schema";
import {
  AnalysisErrorSchema,
  type AnalysisError,
  type AssignmentStatus,
  type MatchAssignment,
  type Proposal,
} from "./schema";

/** 결과 페이지에서 카드 1개를 그릴 때 필요한 모든 정보 */
export type ProposalCard = {
  proposal: Proposal;
  partner: PartnerCard;
};

/**
 * proposalId 가 도메인 타입에 남아 있으므로, fetch 시 proposal.id 만 가볍게 join.
 * 전체 proposal 객체가 필요한 곳에서는 별도 query 또는 mapProposal 사용.
 */
const ASSIGNMENT_WITH_PROPOSAL_ID = {
  proposal: { select: { id: true } },
} as const;

type AssignmentRow = PrismaMatchAssignment & {
  proposal: { id: string } | null;
};

export async function getAssignmentByToken(
  token: string,
): Promise<MatchAssignment | null> {
  const row = await prisma.matchAssignment.findUnique({
    where: { token },
    include: ASSIGNMENT_WITH_PROPOSAL_ID,
  });
  return row ? mapAssignment(row) : null;
}

export async function getAssignmentById(
  id: string,
): Promise<MatchAssignment | null> {
  const row = await prisma.matchAssignment.findUnique({
    where: { id },
    include: ASSIGNMENT_WITH_PROPOSAL_ID,
  });
  return row ? mapAssignment(row) : null;
}

export async function listAssignmentsForRequest(
  requestId: string,
): Promise<MatchAssignment[]> {
  const rows = await prisma.matchAssignment.findMany({
    where: { requestId },
    include: ASSIGNMENT_WITH_PROPOSAL_ID,
  });
  return rows.map(mapAssignment);
}

export async function listAssignmentsForPartner(
  partnerId: string,
): Promise<MatchAssignment[]> {
  const rows = await prisma.matchAssignment.findMany({
    where: { partnerId },
    include: ASSIGNMENT_WITH_PROPOSAL_ID,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapAssignment);
}

export async function listSubmittedProposalsForRequest(
  requestId: string,
): Promise<Proposal[]> {
  const rows = await prisma.proposal.findMany({
    where: {
      assignment: { requestId, status: "submitted" },
    },
    orderBy: { submittedAt: "asc" },
  });
  return rows.map(mapProposal);
}

export async function getProposalById(id: string): Promise<Proposal | null> {
  const row = await prisma.proposal.findUnique({ where: { id } });
  return row ? mapProposal(row) : null;
}

/**
 * 어드민 요청 상세 — 모든 assignment + 작성자 카드 + (있으면) 제안서 묶음.
 * pending/submitted/expired 모두 포함. 운영자는 미제출 케이스도 봐야 함.
 */
export type AssignmentDetail = {
  assignment: MatchAssignment;
  partner: PartnerCard;
  proposal: Proposal | null;
};

export async function listAssignmentDetailsForRequest(
  requestId: string,
): Promise<AssignmentDetail[]> {
  const rows = await prisma.matchAssignment.findMany({
    where: { requestId },
    include: { proposal: true },
    orderBy: { createdAt: "asc" },
  });

  const partners = await getPartnerCardsByIds(rows.map((r) => r.partnerId));
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  return rows
    .map((row) => {
      const partner = partnerById.get(row.partnerId);
      if (!partner) return null;
      const assignment = mapAssignment({
        ...row,
        proposal: row.proposal ? { id: row.proposal.id } : null,
      });
      const proposal = row.proposal ? mapProposal(row.proposal) : null;
      return { assignment, partner, proposal };
    })
    .filter((d): d is AssignmentDetail => d !== null);
}

/**
 * 결과 페이지 — 제출된 제안서와 작성 설계사 카드를 함께. 빠른 제출 순.
 */
export async function listProposalCardsForRequest(
  requestId: string,
): Promise<ProposalCard[]> {
  const rows = await prisma.matchAssignment.findMany({
    where: { requestId, status: "submitted" },
    include: { proposal: true },
    orderBy: { submittedAt: "asc" },
  });

  const partners = await getPartnerCardsByIds(rows.map((r) => r.partnerId));
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  return rows
    .map((row) => {
      const partner = partnerById.get(row.partnerId);
      if (!row.proposal || !partner) return null;
      return { proposal: mapProposal(row.proposal), partner };
    })
    .filter((c): c is ProposalCard => c !== null);
}

/* ============================================================
 * 분석 리포트 (claim.proposal_analysis_report) — read
 *
 * 저장 책임은 웹훅 (/api/webhooks/eightytwo-judge-analysis) 이 보유. 여기선 read 만.
 * 호출자는 항상 parsed `AnalysisReportV5` 만 봄.
 *
 * 버전 정책: `WHERE schemaVersion = CURRENT_REPORT_VERSION` 로 고정 — 호출자는
 * 버전 신경 안 씀. v6 도입 시 새 row 가 v6 로 들어오고, analysis-schema.ts 의
 * zod + CURRENT_REPORT_VERSION 갱신하면 자연스럽게 새 버전 통과.
 * ============================================================ */

export async function getAnalysisReport(
  proposalId: string,
): Promise<AnalysisReportV5 | null> {
  const row = await prisma.proposalAnalysisReport.findUnique({
    where: { proposalId },
    select: { report: true, schemaVersion: true },
  });
  if (!row || row.schemaVersion !== CURRENT_REPORT_VERSION) return null;
  return AnalysisReportV5Schema.parse(row.report);
}

/* ============================================================
 * Mappers — Prisma row → 도메인 타입
 * ============================================================ */

function mapAssignment(row: AssignmentRow): MatchAssignment {
  return {
    id: row.id,
    requestId: row.requestId,
    partnerId: row.partnerId,
    token: row.token,
    status: row.status as AssignmentStatus,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? undefined,
    proposalId: row.proposal?.id,
  };
}

/**
 * Prisma row → 도메인 Proposal. pdfSizeBytes 는 BigInt (Prisma) → number (app)
 * 변환 — 우리 한도 10MB 라 number 범위 안전.
 *
 * `analysisError` 는 raw JSON 이라 zod 로 parse — 외부 페이로드를 직접 저장한
 * 컬럼이므로 read 시 schema 검증 후 도메인 타입으로 노출. parse 실패한 row 는
 * 노출하지 않음 (undefined). 페이로드 컨트랙트가 깨졌다는 신호이므로 로그만 남기고
 * 어드민 UI 에선 단순 "분석 중" 으로 보이게 됨 — 필요 시 별도 모니터링 추가.
 */
function mapProposal(row: PrismaProposal): Proposal {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    pdfS3Key: row.pdfS3Key,
    pdfSizeBytes:
      row.pdfSizeBytes !== null ? Number(row.pdfSizeBytes) : null,
    pdfHash: row.pdfHash,
    note: row.note,
    submittedAt: row.submittedAt.toISOString(),
    analyzedAt: row.analyzedAt?.toISOString() ?? undefined,
    analysisError: parseAnalysisError(row.analysisError),
    analysisErrorAt: row.analysisErrorAt?.toISOString() ?? undefined,
  };
}

function parseAnalysisError(raw: unknown): AnalysisError | undefined {
  if (raw == null) return undefined;
  const parsed = AnalysisErrorSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[proposals/queries] analysisError parse failed", {
      issues: parsed.error.flatten(),
    });
    return undefined;
  }
  return parsed.data;
}

/* ============================================================
 * 분석 실패 모니터링 — 어드민 "분석 실패" 페이지 전용
 *
 * `analyzedAt IS NULL AND analysisErrorAt IS NOT NULL` 인 proposal —
 * 콜백을 받았으나 마지막 시도가 실패 상태로 남은 것. 성공이 한 번이라도 들어오면
 * (analyzedAt 채워짐) 더 이상 실패로 표시하지 않음.
 *
 * partner + request 정보를 함께 join 해서 어드민이 컨텍스트 한 화면에 보도록.
 * ============================================================ */

export type FailedProposalRow = {
  proposal: Proposal;
  partner: PartnerCard;
  /** 부모 plan_request 의 id — 어드민 상세 페이지로 link 용. */
  planRequestId: string;
};

export async function listFailedAnalysisProposals(): Promise<
  FailedProposalRow[]
> {
  const rows = await prisma.proposal.findMany({
    where: { analyzedAt: null, analysisErrorAt: { not: null } },
    include: {
      assignment: { select: { partnerId: true, requestId: true } },
    },
    orderBy: { analysisErrorAt: "desc" },
  });

  const partners = await getPartnerCardsByIds(
    rows.map((r) => r.assignment.partnerId),
  );
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  return rows
    .map((row) => {
      const partner = partnerById.get(row.assignment.partnerId);
      if (!partner) return null;
      return {
        proposal: mapProposal(row),
        partner,
        planRequestId: row.assignment.requestId,
      };
    })
    .filter((r): r is FailedProposalRow => r !== null);
}
