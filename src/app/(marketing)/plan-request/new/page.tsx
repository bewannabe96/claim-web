import type { Metadata } from "next";

import { listPriceTiers } from "@/features/plan-request-pricing/queries";

import { Step1Wizard } from "./_components/step1-wizard";

export const metadata: Metadata = {
  title: "요청서 작성",
  description:
    "관심 보장 분야와 예산을 1분이면 입력 끝. 검증된 설계사가 맞춤 가입설계 제안서를 보내드려요.",
};

export default async function NewRequestPage() {
  const priceTiers = await listPriceTiers();
  return <Step1Wizard priceTiers={priceTiers} />;
}
