import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * PII 가 닿는 element 를 분석 autocapture 에서 제외하는 도메인-중립 도구.
 *
 * PostHog 의 구현 디테일 (`ph-no-capture` 클래스명) 은 이 파일에만 존재 —
 * features/ 와 라우트 코드는 `NO_TRACK_CLASS` / `<NoTrack>` 이라는 도메인-중립
 * 심볼만 본다. 추후 분석 SDK 가 바뀌어도 여기 한 곳만 갱신.
 *
 * **언제 쓰나** — PII 가 닿는 element. 보험 도메인 기준 audit 결과:
 * - 휴대폰 번호 (input + 화면 표시)
 * - 본인인증 OTP / 주민등록번호
 * - 실명, 생년월일, 성별
 * - 직업, 병력, 진단명
 * - 사용자 작성 자유 텍스트 (추가 요청 등) — 어떤 PII 가 들어갈지 통제 불가
 *
 * **언제 안 써도 되나** — autocapture 가 기본적으로 마스킹:
 * - `<input type="password">`, `<input type="email">`
 * - 신용카드 번호 패턴 — PortOne iframe 안이라 어차피 우리 DOM 밖
 *
 * 자세한 정책 / audit 리스트: [src/components/analytics/CLAUDE.md](./CLAUDE.md).
 */

// PostHog autocapture 가 이 class 를 가진 element + 모든 자식의 캡처를 스킵.
// SDK 가 미로드여도 무해 (CSS 효과 없는 inert class).
const POSTHOG_IGNORE_CLASS = "ph-no-capture";

/**
 * className 으로 합성 — 단일 element (특히 form `<input>`) 에 추가 wrapper
 * 없이 적용할 때.
 *
 * @example
 *   <Input className={cn("text-base", NO_TRACK_CLASS)} name="phone" />
 */
export const NO_TRACK_CLASS = POSTHOG_IGNORE_CLASS;

/**
 * 여러 element 가 같이 PII 일 때의 wrapping. 부수적으로 `<div>` 가 한 겹
 * 추가되므로 단일 input 에는 `NO_TRACK_CLASS` 를 권장.
 *
 * @example
 *   <NoTrack>
 *     <h3>{customer.name}</h3>
 *     <p>{customer.phone}</p>
 *   </NoTrack>
 */
export function NoTrack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(POSTHOG_IGNORE_CLASS, className)}>{children}</div>;
}
