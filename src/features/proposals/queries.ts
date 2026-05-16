import "server-only";

import type {
  MatchAssignment as PrismaMatchAssignment,
  Proposal as PrismaProposal,
} from "@prisma/client";

import { getPartnerCardsByIds } from "@/features/partners/queries";
import type { PartnerCard } from "@/features/partners/schema";
import { prisma } from "@/server/db/prisma";

import type {
  AssignmentStatus,
  MatchAssignment,
  Proposal,
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
 */
function mapProposal(row: PrismaProposal): Proposal {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    pdfS3Key: row.pdfS3Key,
    pdfSizeBytes:
      row.pdfSizeBytes !== null ? Number(row.pdfSizeBytes) : null,
    note: row.note,
    submittedAt: row.submittedAt.toISOString(),
  };
}
