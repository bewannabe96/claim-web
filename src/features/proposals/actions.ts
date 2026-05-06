"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MOCK_ASSIGNMENTS, MOCK_PROPOSALS } from "@/mocks/proposals";

import { getAssignmentByToken } from "./queries";
import {
  ProposalSubmissionSchema,
  type ProposalSubmissionState,
} from "./schema";

/**
 * 진설계 제출 — 설계사 측. 일회용 토큰으로 인증.
 */
export async function submitProposal(
  token: string,
  _prev: ProposalSubmissionState,
  formData: FormData,
): Promise<ProposalSubmissionState> {
  const assignment = await getAssignmentByToken(token);
  if (!assignment) {
    return { ok: false, errors: { _form: ["유효하지 않은 링크입니다."] } };
  }
  if (assignment.status !== "pending") {
    return {
      ok: false,
      errors: { _form: ["이미 제출되었거나 만료된 요청입니다."] },
    };
  }

  // PDF 파일은 MVP에서 파일명만 저장 (업로드 인프라는 추후)
  const pdf = formData.get("pdf");
  const pdfFileName = pdf instanceof File && pdf.size > 0 ? pdf.name : "";

  const parsed = ProposalSubmissionSchema.safeParse({
    monthlyPremium: formData.get("monthlyPremium"),
    paymentYears: formData.get("paymentYears"),
    totalCoverage: formData.get("totalCoverage"),
    keyBenefit1: formData.get("keyBenefit1"),
    keyBenefit2: formData.get("keyBenefit2"),
    keyBenefit3: formData.get("keyBenefit3"),
    renewalType: formData.get("renewalType"),
    refundType: formData.get("refundType"),
    pdfFileName,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  const proposalId = `proposal-${Date.now()}`;
  const now = new Date().toISOString();

  MOCK_PROPOSALS.push({
    ...parsed.data,
    id: proposalId,
    assignmentId: assignment.id,
    submittedAt: now,
  });

  // mutate assignment
  const idx = MOCK_ASSIGNMENTS.findIndex((a) => a.id === assignment.id);
  if (idx >= 0) {
    MOCK_ASSIGNMENTS[idx] = {
      ...MOCK_ASSIGNMENTS[idx],
      status: "submitted",
      submittedAt: now,
      proposalId,
    };
  }

  revalidatePath("/agent/assignments");
  revalidatePath("/admin/requests");
  redirect("/agent/assignments/done");
}
