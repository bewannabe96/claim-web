import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestById } from "@/features/plan-requests/queries";

import { ConfirmWizard } from "./_components/confirm-wizard";

export const metadata: Metadata = {
  title: "요청 확인 및 본인인증",
  description:
    "선택한 설계사에게 요청서를 전달하기 전, 본인인증으로 마무리해주세요.",
};

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequestById(id);
  if (!req || req.status !== "confirming") notFound();

  return (
    <ConfirmWizard
      requestId={id}
      selectedCount={req.selectedPartnerIds.length}
      step1={req.step1}
    />
  );
}
