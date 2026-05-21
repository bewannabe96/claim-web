import { customAlphabet } from "nanoid";

/**
 * 프로젝트 표준 ID — nanoid 16자, URL-safe alphabet (`a-zA-Z0-9_-`).
 *
 * 96비트 entropy — 우리 스케일 (수백만 row) 에서 충돌 확률 사실상 0.
 * **모든 DB INSERT 의 PK 는 이 함수로 생성** — DB 사이드 DEFAULT 없음, 누락 시
 * NOT NULL 위반으로 INSERT 실패.
 *
 * 패턴:
 *   const requestId = newId();
 *   const entries = items.map((it, i) => ({ id: newId(), request_id: requestId, ... }));
 *   await supabase.from("plan_request").insert({ id: requestId, ... });
 *   await supabase.from("plan_request_medical_history").insert(entries);
 *
 * 토큰 (보안 용도 — result_token, OTP 등) 은 더 긴 길이 별도 헬퍼 사용 권장.
 */
const ID_ALPHABET =
  "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const generate = customAlphabet(ID_ALPHABET, 16);

export function newId(): string {
  return generate();
}

/**
 * 일회용 토큰 생성 (result_token 등). 32자 / 192비트 entropy — 추측 불가능.
 * URL 노출 전제이므로 alphabet 동일.
 */
const generateToken = customAlphabet(ID_ALPHABET, 32);

export function newToken(): string {
  return generateToken();
}
