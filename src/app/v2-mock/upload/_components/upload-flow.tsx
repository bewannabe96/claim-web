"use client";

import { useRouter } from "next/navigation";

import { UploadForm } from "./upload-form";

/* ============================================================
 * Upload flow — v2 PRD §4.2 외부 제안서 업로드 mock.
 *
 * form submit → 즉시 `/v2-mock/compare?new=pending` 으로 navigate.
 *
 * 중간 "분석 중" 로딩 화면 (옛 AnalyzingScreen) 제거 — workspace 의 분석 중 슬롯
 * placeholder 가 같은 메시지 ("제안서 분석 중이에요" + pulse dots) 를 이미 보여주므로
 * 중복. 사용자는 form 제출 후 곧바로 workspace 로 이동, 새 슬롯이 첫 자리에서 분석
 * 진행 중인 상태로 합류.
 *
 * 실 라우트에서는 form submit → server action (S3 upload + DB INSERT) → 즉시 compare
 * redirect + webhook 콜백으로 분석 완료 시 슬롯 swap.
 * ============================================================ */
export function UploadFlow() {
  const router = useRouter();
  return (
    <UploadForm
      onSubmit={() => router.push("/v2-mock/compare?new=pending")}
    />
  );
}
