import "server-only";

import { z } from "zod";

import { getServiceName } from "./branding";

/**
 * 알리고 SMS / LMS 발송 게이트웨이.
 * https://smartsms.aligo.in/admin/api/spec.html
 *
 * 사용처:
 *   - `sendOtpSms`           — 본인인증 6자리 코드 SMS (90byte 본문 한도).
 *   - `sendNotificationLms`  — URL 포함 알림 LMS (2000byte 본문 한도). 분석 완료 →
 *                              가입자, 제안서 요청 배정 → 설계사, 연락 요청 → 설계사.
 *
 * 자격:
 *   - ALIGO_KEY          : 알리고 콘솔의 API key
 *   - ALIGO_USER_ID      : 알리고 계정 ID
 *   - ALIGO_SENDER       : 사전 등록된 발신번호 (미등록 번호로는 발송 불가)
 *   - ALIGO_TEST_MODE    : Y → testmode_yn=Y 로 호출 (실제 발송/과금 X), N → 실 발송
 *   - ALIGO_PROXY_URL    : (선택) 고정 IP 프록시 base URL. 알리고 IP whitelist 통과용
 *                          (Vercel egress 가 동적이라 직접 호출 불가). 설정 시
 *                          https://apis.aligo.in 대신 ${url}/aligo/send/ 로 호출.
 *                          인프라: infra/aligo-proxy/ (Lightsail + Caddy + Node).
 *   - ALIGO_PROXY_SECRET : (선택) 프록시 Bearer 인증 secret. ALIGO_PROXY_URL 설정 시 필수.
 *
 * 사용자 노출 문구의 서비스명은 `branding.getServiceName()` 으로 분리됨 — 다른
 * 채널(이메일/알림톡)에서도 재사용.
 *
 * dev 편의: test mode 일 때는 호출자가 `sendOtpSms` 자체를 호출하지 않고 코드를
 * "000000" 으로 고정함 (`isAligoTestMode()` 가 그 판단). 따라서 ALIGO_KEY 등이
 * 비어있어도 dev 가 동작. 실 SMS 흐름 검증은 ALIGO_TEST_MODE=N + 실 자격으로.
 */

const EnvSchema = z
  .object({
    ALIGO_KEY: z.string().min(1, "ALIGO_KEY missing"),
    ALIGO_USER_ID: z.string().min(1, "ALIGO_USER_ID missing"),
    ALIGO_SENDER: z.string().min(1, "ALIGO_SENDER missing"),
    ALIGO_PROXY_URL: z.string().url().optional(),
    ALIGO_PROXY_SECRET: z.string().min(1).optional(),
  })
  .refine((env) => !env.ALIGO_PROXY_URL || !!env.ALIGO_PROXY_SECRET, {
    message: "ALIGO_PROXY_SECRET required when ALIGO_PROXY_URL is set",
    path: ["ALIGO_PROXY_SECRET"],
  });

type AligoEnv = z.infer<typeof EnvSchema>;

let cached: AligoEnv | null = null;

function getEnv(): AligoEnv {
  if (cached) return cached;
  cached = EnvSchema.parse({
    ALIGO_KEY: process.env.ALIGO_KEY,
    ALIGO_USER_ID: process.env.ALIGO_USER_ID,
    ALIGO_SENDER: process.env.ALIGO_SENDER,
    ALIGO_PROXY_URL: process.env.ALIGO_PROXY_URL,
    ALIGO_PROXY_SECRET: process.env.ALIGO_PROXY_SECRET,
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
 * 알리고 send/ 엔드포인트 호출 공통 — SMS/LMS 분기는 호출자 책임.
 *
 * 실패 시 throw. 알리고 result_code: 1=성공, 그 외=실패.
 */
async function callAligo(params: {
  receiver: string;
  msg: string;
  msg_type: "SMS" | "LMS";
}): Promise<void> {
  const env = getEnv();
  const testMode = isAligoTestMode();

  const body = new URLSearchParams({
    key: env.ALIGO_KEY,
    user_id: env.ALIGO_USER_ID,
    sender: env.ALIGO_SENDER,
    receiver: params.receiver,
    msg: params.msg,
    msg_type: params.msg_type,
    testmode_yn: testMode ? "Y" : "N",
  });

  // 프록시 설정 시 ${url}/aligo/send/ 로 라우팅 (infra/aligo-proxy 가 /aligo/* → apis.aligo.in/* 패스).
  // 미설정 시 알리고 직접 호출 — Vercel 에선 IP whitelist 못 통과하므로 prod 는 항상 프록시 사용.
  const targetUrl = env.ALIGO_PROXY_URL
    ? `${env.ALIGO_PROXY_URL}/aligo/send/`
    : "https://apis.aligo.in/send/";

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (env.ALIGO_PROXY_SECRET) {
    headers.Authorization = `Bearer ${env.ALIGO_PROXY_SECRET}`;
  }

  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
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
  await callAligo({
    receiver,
    msg: `[${getServiceName()}] 본인확인을 위해 인증번호 [${code}]를 입력해주세요`,
    msg_type: "SMS",
  });
}

/**
 * 알림 LMS 발송 — URL/마감 등 SMS 90byte 한도 초과 안내 문구에 사용.
 *
 * 90byte 초과 시 메시지가 잘리지 않도록 일괄 LMS 로 발송. 호출자가 본문을 그대로
 * 전달 (서비스명 prefix 포함). 실패는 throw — fire-and-forget 호출 시 .catch(log).
 *
 * test mode 일 때는 알리고 호출 자체를 skip + console.log 로 dry-run 만 — dev 에서
 * ALIGO_KEY 등 자격 없이도 동작하도록. 호출자가 매번 분기하지 않게 함수 내부 결정
 * (OTP 와 다른 패턴: OTP 는 코드 "000000" 고정 의미를 호출자가 알아야 했음).
 */
export async function sendNotificationLms(
  receiver: string,
  message: string,
): Promise<void> {
  if (isAligoTestMode()) {
    console.log("[aligo:test-mode] LMS dry-run", { receiver, message });
    return;
  }
  await callAligo({ receiver, msg: message, msg_type: "LMS" });
}
