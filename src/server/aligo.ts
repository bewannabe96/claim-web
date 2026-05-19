import "server-only";

import { z } from "zod";

import { getServiceName } from "./branding";

/**
 * 알리고 SMS 발송 게이트웨이.
 * https://smartsms.aligo.in/admin/api/spec.html
 *
 * 사용처: `features/requests/actions.ts:sendOtp` — 본인인증 6자리 코드 SMS.
 *
 * 자격:
 *   - ALIGO_KEY       : 알리고 콘솔의 API key
 *   - ALIGO_USER_ID   : 알리고 계정 ID
 *   - ALIGO_SENDER    : 사전 등록된 발신번호 (미등록 번호로는 발송 불가)
 *   - ALIGO_TEST_MODE : Y → testmode_yn=Y 로 호출 (실제 발송/과금 X), N → 실 발송
 *
 * 사용자 노출 문구의 서비스명은 `branding.getServiceName()` 으로 분리됨 — 다른
 * 채널(이메일/알림톡)에서도 재사용.
 *
 * dev 편의: test mode 일 때는 호출자가 `sendOtpSms` 자체를 호출하지 않고 코드를
 * "000000" 으로 고정함 (`isAligoTestMode()` 가 그 판단). 따라서 ALIGO_KEY 등이
 * 비어있어도 dev 가 동작. 실 SMS 흐름 검증은 ALIGO_TEST_MODE=N + 실 자격으로.
 */

const EnvSchema = z.object({
  ALIGO_KEY: z.string().min(1, "ALIGO_KEY missing"),
  ALIGO_USER_ID: z.string().min(1, "ALIGO_USER_ID missing"),
  ALIGO_SENDER: z.string().min(1, "ALIGO_SENDER missing"),
});

type AligoEnv = z.infer<typeof EnvSchema>;

let cached: AligoEnv | null = null;

function getEnv(): AligoEnv {
  if (cached) return cached;
  cached = EnvSchema.parse({
    ALIGO_KEY: process.env.ALIGO_KEY,
    ALIGO_USER_ID: process.env.ALIGO_USER_ID,
    ALIGO_SENDER: process.env.ALIGO_SENDER,
  });
  return cached;
}

/** test mode 여부 — 호출자가 코드 생성/발송 분기에 사용. */
export function isAligoTestMode(): boolean {
  return process.env.ALIGO_TEST_MODE === "Y";
}

/** 알리고 응답 — result_code: 1=성공, 그 외=실패 (사양 문서 참조). */
const AligoResponseSchema = z.object({
  result_code: z.coerce.number(),
  message: z.string().optional(),
  msg_id: z.union([z.string(), z.number()]).optional(),
});

/**
 * OTP 6자리 SMS 발송. 실패 시 throw — 호출자가 사용자 응답 분기.
 *
 * SMS 본문 90byte 한도 안에서 한글로 작성 (안내 + 코드). LMS/MMS 로 승급할 필요
 * 없도록 짧게 유지.
 */
export async function sendOtpSms(
  receiver: string,
  code: string,
): Promise<void> {
  const env = getEnv();
  const testMode = isAligoTestMode();

  const body = new URLSearchParams({
    key: env.ALIGO_KEY,
    user_id: env.ALIGO_USER_ID,
    sender: env.ALIGO_SENDER,
    receiver,
    msg: `[${getServiceName()}] 본인확인을 위해 인증번호 [${code}]를 입력해주세요`,
    msg_type: "SMS",
    testmode_yn: testMode ? "Y" : "N",
  });

  const res = await fetch("https://apis.aligo.in/send/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Aligo HTTP ${res.status}`);
  }

  const json = await res.json();
  const parsed = AligoResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Aligo response shape invalid: ${JSON.stringify(json)}`);
  }
  if (parsed.data.result_code !== 1) {
    throw new Error(
      `Aligo result_code=${parsed.data.result_code} message=${parsed.data.message ?? ""}`,
    );
  }
}
