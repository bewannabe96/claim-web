import "server-only";

import { z } from "zod";

import { getServiceName } from "./branding";

/**
 * 알리고 SMS / LMS / 알림톡 발송 게이트웨이.
 *   - SMS / LMS : https://smartsms.aligo.in/admin/api/spec.html
 *   - 알림톡    : https://smartsms.aligo.in/alimapi.html
 *
 * 사용처:
 *   - `sendOtpSms`           — 본인인증 6자리 코드 SMS (90byte 본문 한도).
 *   - `sendNotificationLms`  — URL 포함 알림 LMS (2000byte 본문 한도). 알림톡 미적용
 *                              시나리오(예: 만료 안내) 폴백용으로 남겨둠.
 *   - `sendAlimtalk`         — 카카오 알림톡 (사전 검수 템플릿). 본인인증 이외 모든
 *                              사용자 알림(파트너 배정 / 연락 요청 / 분석 완료)의 기본
 *                              발송 채널. failover=Y 시 알리고가 LMS 로 자동 대체.
 *
 * 자격:
 *   - ALIGO_KEY              : 알리고 콘솔의 API key (SMS/LMS/알림톡 공용)
 *   - ALIGO_USER_ID          : 알리고 계정 ID
 *   - ALIGO_SENDER           : 사전 등록된 발신번호 (SMS/LMS + 알림톡 failover 발신)
 *   - ALIGO_KAKAO_SENDER_KEY : 알림톡 발신프로파일 키 (카카오 비즈채널 연동 후 발급).
 *                              알림톡 미사용 환경(테스트모드/SMS 전용)에선 비어 있어도 됨.
 *   - ALIGO_TEST_MODE        : Y → 발송 skip + console dry-run (실제 발송/과금 X), N → 실 발송
 *   - ALIGO_PROXY_URL        : (선택) 고정 IP 프록시 base URL. 알리고 IP whitelist 통과용
 *                              (Vercel egress 가 동적이라 직접 호출 불가). 설정 시
 *                              https://apis.aligo.in / https://kakaoapi.aligo.in 대신
 *                              ${url}/aligo/send/ + ${url}/aligo/alimtalk/send/ 로 호출.
 *                              인프라: infra/aligo-proxy/ (Lightsail + Caddy + Node).
 *   - ALIGO_PROXY_SECRET     : (선택) 프록시 Bearer 인증 secret. ALIGO_PROXY_URL 설정 시 필수.
 *
 * 사용자 노출 문구의 서비스명은 `branding.getServiceName()` 으로 분리 — SMS prefix /
 * 폴백 LMS 등에서 재사용. 알림톡 템플릿 본문은 사전 검수된 그대로 사용해야 하므로
 * `[Claim]` 같은 prefix 도 템플릿 등록 문자열을 그대로 박는다 (검수 본문과 1바이트라도
 * 달라지면 알리고가 거부).
 *
 * dev 편의: test mode 일 때는 호출자가 `sendOtpSms` 자체를 호출하지 않고 코드를
 * "000000" 으로 고정함 (`isAligoTestMode()` 가 그 판단). 따라서 ALIGO_KEY 등이
 * 비어있어도 dev 가 동작. 실 SMS / 알림톡 흐름 검증은 ALIGO_TEST_MODE=N + 실 자격으로.
 */

const EnvSchema = z
  .object({
    ALIGO_KEY: z.string().min(1, "ALIGO_KEY missing"),
    ALIGO_USER_ID: z.string().min(1, "ALIGO_USER_ID missing"),
    ALIGO_SENDER: z.string().min(1, "ALIGO_SENDER missing"),
    // 알림톡 전용. SMS/LMS 만 쓰는 환경(과거 셋업 / 부분 사용)에선 비어 있어도 통과.
    // `sendAlimtalk` 가 호출 시점에 별도 검증.
    ALIGO_KAKAO_SENDER_KEY: z.string().min(1).optional(),
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
    ALIGO_KAKAO_SENDER_KEY: process.env.ALIGO_KAKAO_SENDER_KEY,
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

/* ============================================================
 * 알림톡 (KakaoTalk Alimtalk)
 *
 * 엔드포인트: POST https://kakaoapi.aligo.in/akv10/alimtalk/send/
 * 인증: apikey + userid (SMS 와 공유)
 * 발신자: senderkey (카카오 비즈채널 발신프로파일 — SMS sender 와 별개)
 * 템플릿: tpl_code 로 사전 검수된 본문 식별. message_1 은 검수 본문과 글자/개행이
 *         완전히 일치해야 통과 (변수 치환만 다름).
 *
 * 응답: { code, message, info? } — code=0 성공, 그 외 실패.
 *       SMS/LMS 의 result_code=1 성공 규약과 다르므로 별도 스키마.
 * ============================================================ */

/** 알림톡 버튼. 템플릿 등록 시 검수된 형태와 일치해야 함 (이름/타입/링크 도메인). */
export interface AlimtalkButton {
  /** 버튼 라벨. 템플릿에 등록된 텍스트와 1바이트라도 다르면 거부. */
  name: string;
  /**
   * 링크 종류:
   *   - WL: 웹 링크 (linkMo + linkPc 필수)
   *   - AL: 앱 링크 (linkIos + linkAnd 필수)
   *   - AC: 채널 추가
   *   - DS: 배송 조회
   *   - BK: 봇 키워드
   *   - MD: 메시지 전달
   */
  linkType: "WL" | "AL" | "AC" | "DS" | "BK" | "MD";
  linkMo?: string;
  linkPc?: string;
  linkIos?: string;
  linkAnd?: string;
}

/** 알리고 알림톡 응답 — code=0 성공, 그 외 실패 (예: -99 포인트 부족). */
const AlimtalkResponseSchema = z.object({
  code: z.coerce.number(),
  message: z.string().optional(),
  info: z
    .object({
      mid: z.union([z.string(), z.number()]).optional(),
    })
    .partial()
    .optional(),
});

/**
 * 알림톡 발송 — 사전 검수 템플릿 코드 + 치환된 본문 + (선택) 버튼.
 *
 * 검수 규칙(중요):
 *   - `message` 는 템플릿 본문과 글자/개행 모두 동일해야 함. 변수 자리만 치환.
 *   - `subject` 는 알리고 콘솔 표시용 — 강조표기형이 아닌 일반 템플릿에선 수신자
 *     화면에 직접 노출 안 됨. 호출자가 식별 가능한 짧은 라벨을 넘기면 됨.
 *   - 버튼은 템플릿 등록된 그대로 (이름/타입/링크 도메인 일치). 변수는 URL 안에서만.
 *
 * 실패 처리: 발송 실패 시 자동 SMS/LMS 폴백 원하면 `failover` 전달. 알리고가
 * 알림톡 실패 시 fsubject/fmessage 로 자동 대체 발송.
 *
 * test mode 일 때는 알리고 호출 자체를 skip + console.log 로 dry-run — dev 에서
 * ALIGO_KAKAO_SENDER_KEY 등 자격 없이도 동작 (LMS 와 동일 패턴, 호출자 분기 불필요).
 * 실패 throw — 호출자가 fire-and-forget 으로 .catch(log) 처리.
 */
export async function sendAlimtalk(
  receiver: string,
  args: {
    /** 알리고 콘솔에서 검수 받은 템플릿 코드 (예: "UI_0735"). */
    templateCode: string;
    /** 알리고 콘솔 표시용 식별 라벨 — 수신자 화면엔 노출 안 됨. */
    subject: string;
    /** 템플릿 본문에 변수 치환을 적용한 결과 문자열 (개행 포함). */
    message: string;
    /** 강조표기형 템플릿의 타이틀. 일반 템플릿에선 미사용. */
    emphasizeTitle?: string;
    /** 템플릿 등록된 버튼 (현재 0~1개). 미정의면 버튼 없음. */
    button?: AlimtalkButton[];
    /** 발송 실패 시 알리고가 대체 발송할 SMS/LMS 본문. 미정의면 폴백 없음. */
    failover?: { subject?: string; message: string };
  },
): Promise<void> {
  if (isAligoTestMode()) {
    console.log("[aligo:test-mode] Alimtalk dry-run", { receiver, ...args });
    return;
  }

  const env = getEnv();
  if (!env.ALIGO_KAKAO_SENDER_KEY) {
    throw new Error(
      "ALIGO_KAKAO_SENDER_KEY missing — required for Alimtalk send",
    );
  }

  const body = new URLSearchParams({
    apikey: env.ALIGO_KEY,
    userid: env.ALIGO_USER_ID,
    senderkey: env.ALIGO_KAKAO_SENDER_KEY,
    tpl_code: args.templateCode,
    sender: env.ALIGO_SENDER,
    receiver_1: receiver,
    subject_1: args.subject,
    message_1: args.message,
    testMode: "N",
  });

  if (args.emphasizeTitle) {
    body.append("emtitle_1", args.emphasizeTitle);
  }
  if (args.button && args.button.length > 0) {
    body.append("button_1", JSON.stringify({ button: args.button }));
  }
  if (args.failover) {
    body.append("failover", "Y");
    if (args.failover.subject) {
      body.append("fsubject_1", args.failover.subject);
    }
    body.append("fmessage_1", args.failover.message);
  }

  // 프록시 설정 시 ${url}/aligo/alimtalk/send/ 로 라우팅. 미설정 시 알리고 직접 호출 —
  // SMS 와 마찬가지로 Vercel 운영에선 IP whitelist 통과 위해 프록시 필요.
  const targetUrl = env.ALIGO_PROXY_URL
    ? `${env.ALIGO_PROXY_URL}/aligo/alimtalk/send/`
    : "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

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
    throw new Error(`Aligo alimtalk HTTP ${res.status}`);
  }

  const json = await res.json();
  const parsed = AlimtalkResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Aligo alimtalk response shape invalid: ${JSON.stringify(json)}`,
    );
  }
  if (parsed.data.code !== 0) {
    throw new Error(
      `Aligo alimtalk code=${parsed.data.code} message=${parsed.data.message ?? ""}`,
    );
  }
}
