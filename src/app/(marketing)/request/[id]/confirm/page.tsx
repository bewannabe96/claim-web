import { notFound } from "next/navigation";

import { getRequestById } from "@/features/requests/queries";

import { ConfirmWizard } from "./_components/confirm-wizard";

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
      selectedCount={req.selectedAgentIds.length}
      step1={req.step1}
    />
  );
}
