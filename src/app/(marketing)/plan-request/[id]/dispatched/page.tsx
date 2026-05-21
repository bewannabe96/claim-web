import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MailIcon, StatusScreen } from "@/components/status-screen";
import { getRequestById } from "@/features/plan-requests/queries";
import { nowMs } from "@/lib/wall-clock";

export const metadata: Metadata = {
  title: "요청 전달 완료",
  description:
    "선택하신 설계사가 제안서를 준비하고 있어요. 도착하면 카카오 알림톡으로 알려드릴게요.",
};

/**
 * dispatched 상태 안내 — 가입자에게 "보냈어요, 기다리시면 돼요" + 도착 예상 시간.
 *
 * deadlineAt 은 설계사 제출 마감 시각. 그 안에 들어온 제안서를 묶어 AI 분석 → 결과
 * 알림톡 발송. 가입자 입장에선 "최대 N시간 안에 결과가 옴" 이라는 expectation 이 핵심.
 */
export default async function DispatchedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req) notFound();

  const remainingHours = computeRemainingHours(req.deadlineAt);

  return (
    <StatusScreen
      icon={<MailIcon />}
      title="요청서가 전달됐어요"
      description={
        <>
          선택하신{" "}
          <span className="font-semibold text-black">
            {req.selectedPartnerIds.length}명
          </span>
          의 설계사가 제안서를 준비하고 있어요.
          {remainingHours !== null && (
            <>
              {" "}
              최대{" "}
              <span className="font-semibold text-black">
                {remainingHours}시간
              </span>{" "}
              안에 모두 도착해요.
            </>
          )}
          <br />
          도착하면 카카오 알림톡으로 알려드릴게요.
        </>
      }
      primary={{ label: "홈으로", href: "/" }}
    />
  );
}

/** 마감까지 남은 시간 (올림). 마감 지났거나 deadline 없으면 null. */
function computeRemainingHours(deadlineAt: string | undefined): number | null {
  if (!deadlineAt) return null;
  const remainingMs = Date.parse(deadlineAt) - nowMs();
  if (remainingMs <= 0) return null;
  return Math.ceil(remainingMs / 3_600_000);
}
