/**
 * 로그인 / OAuth 콜백 흐름의 `?next` 파라미터 화이트리스트 validator.
 *
 * partner 영역 post-login redirect 만 허용 — open redirect 취약점 (`?next=//evil.com`,
 * `?next=https://evil.com`, `?next=/\\evil.com`) 차단. 화이트리스트 외 입력은
 * fallback (기본 `/partner`) 으로 silent 치환.
 *
 * 호출 위치:
 *   - middleware: 미인증 partner 경로 → /partner/login 으로 redirect 시 원래 경로 보존
 *   - /partner/login page: 이미 로그인 상태면 next 로 즉시 redirect
 *   - signInWithKakao action: Kakao 콜백 URL 의 `?next=` 로 forward
 *   - /api/auth/callback: defense in depth — 외부에서 redirectTo 위조했어도 차단
 *
 * 규칙:
 *   - 반드시 단일 `/` 로 시작 (relative path)
 *   - `//`, `/\` 금지 (protocol-relative / backslash bypass)
 *   - `/partner` 또는 `/partner/` 로 시작하는 경로만 허용 — partner 영역 밖으로
 *     post-login 점프 금지 (현재는 그럴 일이 없으나 사고 방지)
 *   - query string 보존 OK (next 자체에 `?` 포함 가능)
 */
export function safeNextPath(raw: unknown, fallback = "/partner"): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw !== "/partner" && !raw.startsWith("/partner/") && !raw.startsWith("/partner?")) {
    return fallback;
  }
  return raw;
}
