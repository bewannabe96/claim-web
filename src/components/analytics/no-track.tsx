import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * PII 가 닿는 element 를 분석 캡처에서 제외하는 도메인-중립 도구.
 *
 * PostHog 의 구현 디테일 (`ph-no-capture` 클래스명) 은 이 파일에만 존재 —
 * features/ 와 라우트 코드는 `NO_TRACK_CLASS` / `<NoTrack>` 이라는 도메인-중립
 * 심볼만 본다. 추후 분석 SDK 가 바뀌어도 여기 한 곳만 갱신.
 *
 * **하나의 심볼이 두 가지를 함께 책임진다** — `ph-no-capture` 가 PostHog 의
 * 기본 `blockClass` 와 동일해서:
 *   1) **autocapture**: 마킹된 element + 자손의 click/submit/change 이벤트가
 *      `$autocapture` 페이로드에서 제외.
 *   2) **session replay**: 마킹된 element + 자손이 rrweb 녹화에서 검은
 *      박스로 가려짐 (DOM 자체가 추출 안 됨).
 *
 * [posthog-client.tsx](./posthog-client.tsx) 의 `session_recording.blockClass`
 * 가 default 와 동일한 값을 명시해 이 의미를 코드 단에서 고정 — PostHog UI
 * 의 project 설정 변경에 영향받지 않음.
 *
 * **언제 쓰나** — PII 가 닿는 element. 보험 도메인 기준 audit 결과:
 * - 휴대폰 번호 (input + 화면 표시)
 * - 본인인증 OTP / 주민등록번호
 * - 실명, 생년월일, 성별
 * - 직업, 병력, 진단명
 * - 사용자 작성 자유 텍스트 (추가 요청 등) — 어떤 PII 가 들어갈지 통제 불가
 * - PG 결제 페이지 전체 (`partner/(dashboard)/credits/topup/*`) — 결제
 *   요약/이력이 replay 에 남지 않도록 `<main>` 자체에 부여
 *
 * **언제 안 써도 되나**:
 * - `<input type="password">`, `<input type="email">` — autocapture / replay
 *   모두 기본 마스킹
 * - 일반 `<input>` value — replay 가 `maskAllInputs: true` 로 별표 처리
 * - 신용카드 번호 — PortOne iframe 안이라 우리 DOM 밖
 *
 * 자세한 정책 / audit 리스트: [src/components/analytics/CLAUDE.md](./CLAUDE.md).
 */

// PostHog autocapture (캡처 제외) + session replay (블록 처리) 의 단일 마킹 class.
// PostHog 의 default `blockClass` 와 일치 — SDK 가 미로드여도 무해 (CSS 효과
// 없는 inert class).
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
