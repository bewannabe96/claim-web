import { notFound } from "next/navigation";

import { MailIcon, StatusScreen } from "@/components/status-screen";
import { getRequestById } from "@/features/requests/queries";

export default async function DispatchedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req) notFound();

  return (
    <StatusScreen
      icon={<MailIcon />}
      title="요청서가 전달됐어요"
      description={
        <>
          선택하신 <span className="font-semibold text-black">{req.selectedAgentIds.length}명</span>
          의 설계사가 진설계를 준비하고 있어요. 도착하면 카카오 알림톡으로 알려드릴게요.
        </>
      }
      primary={{ label: "홈으로", href: "/" }}
    />
  );
}
