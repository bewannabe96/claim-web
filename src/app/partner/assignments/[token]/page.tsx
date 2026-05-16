import { notFound } from "next/navigation";

import { AlertIcon, StatusScreen } from "@/components/status-screen";
import { getPartnerById } from "@/features/partners/queries";
import { getAssignmentByToken } from "@/features/proposals/queries";
import { getRequestById } from "@/features/requests/queries";
import { nowMs } from "@/lib/wall-clock";

import { ProposalForm } from "./_components/proposal-form";

/**
 * 설계사 제안서 제출 — 알림톡 일회용 토큰으로 진입.
 * PRD §5.4. 로그인 불필요.
 *
 * 토큰 상태 → UI 분기:
 *   pending  : 폼 노출
 *   submitted: "이미 제출하셨어요" 안내
 *   expired  : "마감되었어요" 안내
 */
export default async function PartnerAssignmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const assignment = await getAssignmentByToken(token);
  if (!assignment) notFound();

  const [request, partner] = await Promise.all([
    getRequestById(assignment.requestId),
    getPartnerById(assignment.partnerId),
  ]);
  if (!request || !partner) notFound();

  // 데드라인 도과 시 — 폼 노출 차단
  const now = nowMs();
  const deadlineMs = request.deadlineAt ? Date.parse(request.deadlineAt) : null;
  const expired = deadlineMs !== null && deadlineMs <= now;

  if (assignment.status === "submitted" || assignment.status === "expired") {
    return (
      <StatusScreen
        showBrand={false}
        icon={<AlertIcon />}
        tone="neutral"
        title={
          assignment.status === "submitted"
            ? "이미 제출하셨어요"
            : "마감된 요청이에요"
        }
        description={
          assignment.status === "submitted"
            ? "이 가입자에게는 이미 제안서를 보내셨어요. 다른 새 요청을 기다려주세요."
            : "제출 가능 시간이 지났어요. 미제출 이력으로 기록될 수 있어요."
        }
      />
    );
  }

  if (expired) {
    return (
      <StatusScreen
        showBrand={false}
        icon={<AlertIcon />}
        tone="neutral"
        title="마감되었어요"
        description="제출 가능 시간이 지났어요. 다음 요청을 더 빠르게 잡아주세요."
      />
    );
  }

  return (
    <ProposalForm
      token={token}
      partnerName={partner.name}
      remainingMs={deadlineMs !== null ? deadlineMs - now : null}
      request={request}
    />
  );
}
