import { NextResponse, type NextRequest } from "next/server";

import { getPlanProposalById } from "@/features/plan-proposals/queries";
import { requireAdminSession } from "@/server/dal";
import { presignPlanProposalDownload } from "@/server/s3";

/**
 * GET /admin/api/proposals/[id]/download
 *
 * 어드민 전용 PDF 다운로드 트램펄린. 매 요청마다 presigned GET URL (60s TTL) 을
 * 발급해 302 redirect — 짧은 수명이라 HTML 에 박혀 만료될 일이 없고, S3 키도
 * 브라우저에 노출되지 않음 (우리 도메인 endpoint 만 보임).
 *
 * 가드 두 단계:
 *   1. 루트 middleware — knock cookie + Supabase 세션 optimistic 검사 (admin 매처).
 *   2. 이 핸들러 — `requireAdminSession()` 으로 admin extension active 진짜 검증.
 *
 * (dashboard) route group 안에 두지만 layout 의 `requireAdminSession()` 은 페이지
 * 렌더에만 적용 — route handler 는 별도 가드가 필요해 함수 진입부에서 직접 호출.
 *
 * 파일명: `<proposalId>__<basename>.pdf` — 어드민이 여러 PDF 다운받을 때 식별 편의.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  await requireAdminSession();

  const { id } = await params;
  const proposal = await getPlanProposalById(id);
  if (!proposal) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const basename = proposal.pdfS3Key.split("/").pop() ?? "proposal.pdf";
  const filename = `${id}__${basename}`;

  const url = await presignPlanProposalDownload(proposal.pdfS3Key, { filename });
  return NextResponse.redirect(url, 302);
}
