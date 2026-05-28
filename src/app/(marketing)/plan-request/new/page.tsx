import type { Metadata } from "next";

import { listPriceTiers } from "@/features/plan-request-pricing/queries";
import { submitStep1 } from "@/features/plan-requests/actions";

import {
  Step1Wizard,
  type Step1SubmitOutcome,
} from "./_components/step1-wizard";

export const metadata: Metadata = {
  title: "요청서 작성",
  description:
    "관심 보장 분야와 예산을 1분이면 입력 끝. 검증된 설계사가 맞춤 가입설계 제안서를 보내드려요.",
};

/**
 * v1 wizard 의 finalize — `submitStep1` server action 호출 + 성공 시 candidates 경로.
 *
 * step1-wizard 의 `onSubmit` 시그니처는 `(fd) => Promise<Step1SubmitOutcome>` 로
 * 일반화되어 있어 (PRD v2 §5.4), v2 풀 path 가 wizard UI 를 fork 없이 재사용 가능.
 * 본 함수는 v1 의 실 finalize 책임을 outcome 모양으로 어댑팅하는 역할만.
 */
async function handleSubmit(fd: FormData): Promise<Step1SubmitOutcome> {
  "use server";
  const result = await submitStep1(undefined, fd);
  if (result && "ok" in result && result.ok) {
    return {
      ok: true,
      nextHref: `/plan-request/${result.requestId}/candidates`,
    };
  }
  const msg =
    result && "errors" in result && result.errors?._form?.[0]
      ? result.errors._form[0]
      : "매칭에 실패했습니다. 다시 시도해주세요.";
  return { ok: false, errorMessage: msg };
}

export default async function NewRequestPage() {
  const priceTiers = await listPriceTiers();
  return <Step1Wizard priceTiers={priceTiers} onSubmit={handleSubmit} />;
}
