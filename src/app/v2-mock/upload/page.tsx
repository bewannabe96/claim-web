import type { Metadata } from "next";

import { UploadFlow } from "./_components/upload-flow";

export const metadata: Metadata = {
  title: "v2 Mock · 제안서 업로드",
  description: "v2 PRD §4.2 외부 제안서 업로드 mock (PDF/사진) — form → 분석 → 슬롯 합류.",
};

/**
 * /v2-mock/upload — 외부 제안서 (PDF 또는 사진) 업로드 진입.
 *
 * v2 PRD §4.2 의 흐름을 single client component 상태 머신으로:
 *   form → analyzing → done(indexed | missing)
 *
 * mock 단계라 실 S3 업로드 / external_analyzer 호출 없음. 파일 선택은 이름만
 * 표시. 약관 indexed 여부는 form 에 토글로 노출 — 한 URL 에서 두 분기를 다 시연.
 */
export default function V2MockUploadPage() {
  return <UploadFlow />;
}
