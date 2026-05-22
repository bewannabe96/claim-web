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
 *   - `sendAlimtalk`         — 카카오 알림톡. 본인인증 이외 모든 사용자 알림(파트너
 *                              배정 / 연락 요청 / 분석 완료)의 기본 발송 채널. 알리고
 *                              콘솔의 검수 템플릿을 `template/list` 로 가져와 `#{변수}`
 *                              만 치환해 발송 — 코드가 본문을 미러링하지 않음.
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
 *                              ${url}/aligo/* 로 호출 (프록시가 SMS/알림톡/템플릿 분기).
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
 * 알리고 호출 공통 헤더. 폼 인코딩은 SMS/LMS/알림톡/템플릿 공통, 프록시 경유 시
 * Bearer 인증 헤더 추가 (직접 호출이면 Authorization 없음).
 */
function proxyHeaders(env: AligoEnv): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (env.ALIGO_PROXY_SECRET) {
    headers.Authorization = `Bearer ${env.ALIGO_PROXY_SECRET}`;
  }
  return headers;
}

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

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: proxyHeaders(env),
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
 * 발송 모델: 알리고 콘솔의 검수 템플릿이 본문/버튼의 단일 진실 공급원.
 *   1. `template/list` 로 검수본(`templtContent` + `buttons`)을 가져온다.
 *   2. 본문 / 버튼 / 강조 타이틀의 `#{변수}` 자리를 호출자 변수맵으로 치환한다.
 *   3. `alimtalk/send/` 로 발송한다.
 * 코드가 본문을 미러링하지 않으므로 "검수본과 1바이트라도 다르면 거부" 문제가
 * 원천 차단된다. 도메인 데이터 → 변수맵 변환은 kakao-templates.ts 의 빌더가 담당.
 *
 * 엔드포인트 (POST, x-www-form-urlencoded):
 *   - 템플릿 조회: https://kakaoapi.aligo.in/akv10/template/list/
 *   - 발송:        https://kakaoapi.aligo.in/akv10/alimtalk/send/
 * 인증: apikey + userid (SMS 와 공유) + senderkey (카카오 비즈채널 발신프로파일).
 * 응답: { code, message, ... } — code=0 성공. (SMS 의 result_code=1 규약과 다름.)
 * ============================================================ */

/** template/list 응답의 버튼 한 개. 모든 string 필드에 `#{변수}` 가 올 수 있음. */
const TemplateButtonSchema = z.object({
  ordering: z.string().optional(),
  name: z.string(),
  linkType: z.string(),
  linkTypeName: z.string().optional(),
  linkMo: z.string().optional(),
  linkPc: z.string().optional(),
  linkIos: z.string().optional(),
  linkAnd: z.string().optional(),
});
type TemplateButton = z.infer<typeof TemplateButtonSchema>;

/** template/list 응답. tpl_code 를 지정하면 list 는 해당 1건. */
const TemplateListResponseSchema = z.object({
  code: z.coerce.number(),
  message: z.string().optional(),
  list: z
    .array(
      z.object({
        templtCode: z.string(),
        templtName: z.string().optional(),
        templtContent: z.string(),
        templtTitle: z.string().optional(),
        buttons: z.array(TemplateButtonSchema).optional(),
        inspStatus: z.string().optional(),
      }),
    )
    .optional(),
});

/** 알리고 알림톡 발송 응답 — code=0 성공, 그 외 실패 (예: -99 포인트 부족). */
const AlimtalkResponseSchema = z.object({
  code: z.coerce.number(),
  message: z.string().optional(),
  info: z
    .object({ mid: z.union([z.string(), z.number()]).optional() })
    .partial()
    .optional(),
});

/** 정규화한 검수 템플릿 — 본문/버튼은 `#{변수}` 가 치환되기 전 상태. */
interface AlimtalkTemplate {
  /** 콘솔 표시용 템플릿명 — subject_1 로 사용 (수신자 화면 비노출). */
  name: string;
  /** 검수본 본문 (`#{변수}` 포함). */
  content: string;
  /** 강조표기형 템플릿의 타이틀 (`#{변수}` 포함). 일반 템플릿은 null. */
  emphasizeTitle: string | null;
  /** 검수본 버튼 목록 (`#{변수}` 포함). */
  buttons: TemplateButton[];
}

/**
 * 검수 템플릿 캐시. 검수본은 재심사 없이는 안 바뀌므로 안전하게 캐시 가능.
 * 값이 아닌 Promise 를 캐시 — finalizeRequest 처럼 같은 템플릿으로 N건을 동시
 * 발송할 때 fetch 가 1회로 합쳐진다. 실패한 Promise 는 evict (다음 호출이 재시도).
 */
const TEMPLATE_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const templateCache = new Map<
  string,
  { promise: Promise<AlimtalkTemplate>; fetchedAt: number }
>();

/** template/list 한 번 호출 — 캐시 미스 시 fetchAlimtalkTemplate 가 위임. */
async function fetchAlimtalkTemplateUncached(
  templateCode: string,
): Promise<AlimtalkTemplate> {
  const env = getEnv();
  if (!env.ALIGO_KAKAO_SENDER_KEY) {
    throw new Error(
      "ALIGO_KAKAO_SENDER_KEY missing — required for Alimtalk template fetch",
    );
  }

  const body = new URLSearchParams({
    apikey: env.ALIGO_KEY,
    userid: env.ALIGO_USER_ID,
    senderkey: env.ALIGO_KAKAO_SENDER_KEY,
    tpl_code: templateCode,
  });

  const targetUrl = env.ALIGO_PROXY_URL
    ? `${env.ALIGO_PROXY_URL}/aligo/template/list/`
    : "https://kakaoapi.aligo.in/akv10/template/list/";

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: proxyHeaders(env),
    body,
  });
  if (!res.ok) {
    throw new Error(`Aligo template/list HTTP ${res.status}`);
  }

  const json = await res.json();
  const parsed = TemplateListResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Aligo template/list response shape invalid: ${JSON.stringify(json)}`,
    );
  }
  if (parsed.data.code !== 0) {
    throw new Error(
      `Aligo template/list code=${parsed.data.code} message=${parsed.data.message ?? ""}`,
    );
  }

  const entry = parsed.data.list?.find((t) => t.templtCode === templateCode);
  if (!entry) {
    throw new Error(
      `Aligo template/list: template ${templateCode} not found in response`,
    );
  }
  if (entry.inspStatus && entry.inspStatus !== "APR") {
    console.warn("[aligo] alimtalk template not approved", {
      templateCode,
      inspStatus: entry.inspStatus,
    });
  }

  return {
    name: entry.templtName ?? templateCode,
    content: entry.templtContent,
    emphasizeTitle:
      entry.templtTitle && entry.templtTitle.length > 0
        ? entry.templtTitle
        : null,
    buttons: entry.buttons ?? [],
  };
}

/** 검수 템플릿 조회 — TTL 캐시 + 동시호출 dedupe. */
function fetchAlimtalkTemplate(templateCode: string): Promise<AlimtalkTemplate> {
  const cached = templateCache.get(templateCode);
  if (cached && Date.now() - cached.fetchedAt < TEMPLATE_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchAlimtalkTemplateUncached(templateCode);
  templateCache.set(templateCode, { promise, fetchedAt: Date.now() });
  // 실패한 fetch 는 캐시에 남기지 않음 — 동일 entry 일 때만 삭제 (경쟁 안전).
  promise.catch(() => {
    if (templateCache.get(templateCode)?.promise === promise) {
      templateCache.delete(templateCode);
    }
  });
  return promise;
}

/** `#{변수}` placeholder. 변수명은 공백 trim 후 변수맵에서 조회. */
const ALIMTALK_PLACEHOLDER_RE = /#\{([^}]+)\}/g;

/** text 의 `#{key}` 를 variables[key] 로 치환. variables 에 없는 키는 빈 문자열로 치환. */
function substituteAlimtalkVariables(
  text: string,
  variables: Record<string, string>,
): string {
  return text.replace(ALIMTALK_PLACEHOLDER_RE, (_match, rawName: string) => {
    const key = rawName.trim();
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : "";
  });
}

/**
 * 비프로덕션 환경 마커 — 운영 환경이 아닐 때 알림톡 변수값 앞에 붙는 접두사.
 * 검수 템플릿 본문은 못 바꾸므로, 치환되는 변수값에 prefix 를 박아 수신자가 운영
 * 환경 메시지가 아님을 한눈에 인지하게 한다.
 */
const NON_PRODUCTION_VARIABLE_PREFIX = "(운영환경x)";

/**
 * 운영 환경 여부 — `ENV_STAGE` 가 `production` / `prod` (대소문자 무시) 일 때만 true.
 * env-banner.tsx 와 동일한 prod allowlist (fail-safe) 정책 — ENV_STAGE 누락/오타
 * 시에도 비운영으로 간주되어 마커가 붙는다.
 */
function isProductionStage(): boolean {
  const stage = process.env.ENV_STAGE?.trim().toLowerCase();
  return stage === "production" || stage === "prod";
}

/**
 * 비운영 환경이면 변수맵의 모든 값 앞에 마커를 붙인 새 맵을 반환, 운영 환경이면
 * 원본을 그대로 반환. 메시지 본문/강조 타이틀에 노출되는 변수에만 사용 — 버튼
 * 변수(토큰 등)는 URL 경로에 들어가므로 마커를 붙이면 링크가 깨진다.
 */
function markNonProductionVariables(
  variables: Record<string, string>,
): Record<string, string> {
  if (isProductionStage()) return variables;
  const marked: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    marked[key] = `${NON_PRODUCTION_VARIABLE_PREFIX}${value}`;
  }
  return marked;
}

/**
 * 알림톡 발송 — 검수 템플릿 코드 + 변수맵.
 *
 *   1. `template/list` 로 검수본을 가져온다 (TTL 캐시).
 *   2. 본문 / 버튼 / 강조 타이틀의 `#{변수}` 를 `variables` 로 치환한다.
 *      (`variables` 에 없는 placeholder 는 빈 문자열로 치환.)
 *   3. `alimtalk/send/` 로 발송한다.
 *
 * `variables` 키는 검수본의 `#{...}` placeholder 이름과 정확히 일치해야 함.
 * 도메인 데이터 → 변수맵 변환은 kakao-templates.ts 의 typed 빌더 사용.
 *
 * 비운영 환경(`ENV_STAGE` 가 production/prod 아님)에서는 본문/강조 타이틀에
 * 치환되는 모든 변수값 앞에 `(운영환경x)` 마커를 붙여 발송 — 수신자가 운영 메시지가
 * 아님을 인지하게 함. 버튼 변수는 URL 경로라 마커 제외 (링크 깨짐 방지).
 *
 * test mode 일 때는 알리고 호출 자체를 skip + console.log 로 dry-run — dev 에서
 * 자격 없이도 동작. 실패 throw — 호출자가 fire-and-forget 으로 .catch(log) 처리.
 */
export async function sendAlimtalk(
  receiver: string,
  templateCode: string,
  variables: Record<string, string>,
): Promise<void> {
  if (isAligoTestMode()) {
    console.log("[aligo:test-mode] Alimtalk dry-run", {
      receiver,
      templateCode,
      variables,
    });
    return;
  }

  const env = getEnv();
  if (!env.ALIGO_KAKAO_SENDER_KEY) {
    throw new Error(
      "ALIGO_KAKAO_SENDER_KEY missing — required for Alimtalk send",
    );
  }

  const template = await fetchAlimtalkTemplate(templateCode);

  // 본문/강조 타이틀은 비운영 환경에서 마커를 박은 변수값으로 치환. 버튼은 URL
  // 경로에 변수가 들어가므로 마커 없는 원본 variables 를 그대로 사용한다.
  const displayVariables = markNonProductionVariables(variables);

  const message = substituteAlimtalkVariables(template.content, displayVariables);
  const emphasizeTitle = template.emphasizeTitle
    ? substituteAlimtalkVariables(template.emphasizeTitle, displayVariables)
    : null;
  const buttons = template.buttons.map((btn) => {
    const substituted: Record<string, string> = {};
    for (const [field, value] of Object.entries(btn)) {
      if (typeof value === "string") {
        substituted[field] = substituteAlimtalkVariables(value, variables);
      }
    }
    return substituted;
  });

  const body = new URLSearchParams({
    apikey: env.ALIGO_KEY,
    userid: env.ALIGO_USER_ID,
    senderkey: env.ALIGO_KAKAO_SENDER_KEY,
    tpl_code: templateCode,
    sender: env.ALIGO_SENDER,
    receiver_1: receiver,
    subject_1: template.name,
    message_1: message,
    testMode: "N",
  });
  if (emphasizeTitle) {
    body.append("emtitle_1", emphasizeTitle);
  }
  if (buttons.length > 0) {
    body.append("button_1", JSON.stringify({ button: buttons }));
  }

  // 프록시 설정 시 ${url}/aligo/alimtalk/send/ 로 라우팅. 미설정 시 알리고 직접 호출 —
  // SMS 와 마찬가지로 Vercel 운영에선 IP whitelist 통과 위해 프록시 필요.
  const targetUrl = env.ALIGO_PROXY_URL
    ? `${env.ALIGO_PROXY_URL}/aligo/alimtalk/send/`
    : "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: proxyHeaders(env),
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
