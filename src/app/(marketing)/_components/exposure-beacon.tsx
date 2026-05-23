"use client";

import { useEffect } from "react";

import { registerLpVariant } from "@/lib/analytics";

/**
 * 랜딩 변형을 PostHog 에 등록 + 첫 노출 이벤트 발화 — page.tsx 가 변형을
 * 결정한 직후 한 번 마운트.
 *
 * 실제 PostHog 호출은 [src/lib/analytics.ts](../../../lib/analytics.ts) 의
 * `registerLpVariant()` 가 책임. 이 컴포넌트는 마운트 트리거만.
 *
 * **fromForce 일 때 (`?_lp=` 강제 override)**: PostHog 에 register 자체를 안
 * 함 — QA / 스테이크홀더가 확인용으로 만진 변형이 실험 모집단에 섞이지
 * 않도록 격리. justAssigned 도 항상 false 로 들어오므로 `lp_exposure` 도
 * 안 발화.
 */
export function ExposureBeacon({
  variant,
  justAssigned,
  fromForce,
}: {
  variant: string;
  justAssigned: boolean;
  fromForce: boolean;
}) {
  useEffect(() => {
    if (fromForce) return;
    registerLpVariant(variant, justAssigned);
  }, [variant, justAssigned, fromForce]);

  return null;
}
