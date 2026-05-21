# server/ — 서버 전용 모듈

## 절대 규칙

1. **모든 파일 첫 줄에 `import "server-only"`.** 클라이언트 번들에 실수로 포함되면 빌드가 실패하도록 강제. 빠뜨리지 말 것.
2. **클라이언트에서 절대 import 금지.** Server Component / Server Action / Route Handler에서만.
3. **`server/`에서 client 모듈을 import하지 말 것** (cyclic, 의미 없음).

## 무엇이 들어가나

- `dal.ts` — Data Access Layer. **모든 인증 검사의 단일 진입점.**
  - `getOptionalUser()` — Supabase `auth.getUser()` → `claim.user` (where authId) 조회. `auth.getUser()` 가 throw (refresh 실패 등) 하면 graceful null — `/admin/login` 이 stale cookie 만으로 error.tsx 로 빠지지 않도록. cache 로 same-request dedupe.
  - `requireAdminSession()` — user + `claim.admin.active` 2단계 검증 (admin extension row 존재 + active).
  - `requirePartnerSession()` — user + `claim.partner.active` 2단계 검증 (partner extension row 존재 + active).
  - 한 사용자가 admin/partner 동시 권한 가능 — 각 require\*Session 은 해당 extension 만 확인.
  - 미인증/권한 없음 → 각 영역 login 페이지로 redirect (admin: `/admin/login`, partner: `/partner/login`).
- `supabase.ts` — `@supabase/ssr` 의 `createServerClient` wrap. cookie-based 세션 +
  publishable key 사용 (RLS 적용). Auth flow (signIn/signOut/getUser) 가 이걸 쓰고,
  routine DB 쿼리는 prisma 사용 (분리).
- `db/prisma.ts` — **Prisma client 싱글톤. 모든 DB 쿼리/트랜잭션의 단일 진입점.**
- `s3.ts` — 제안서 PDF 업로드/다운로드 S3 헬퍼. presigned PUT/GET URL + HEAD 검증
  (`verifyUploadedObject`) + 본문 SHA-256 계산 (`fetchObjectSha256`, stream-based — 외부 분석 리포트와 join 할 hash).
- `settings.ts` — single-row `app_settings` 로드/갱신. `SettingsPatch` 가 admin 폼에서 갱신
  가능한 필드 (candidateCount / selectLimit / submissionDeadlineHours / penaltyWindow /
  resultRetentionDays / scenarioPriority).
- `redis.ts` — `RedisClient` 인터페이스 + 어댑터 (`getRedis()`). 키 네임스페이스:
  - `otp:code:{requestId}:{phone}` (EX 180) — 본인인증 6자리 OTP.
  - `otp:rl:{ip}` (EX 3600) — IP 별 OTP 발송 시도 카운터. `OTP_RATE_LIMIT_DISABLED=Y` env 로 카운터 자체를 스킵 (load test / 스테이징 디버깅 편의).
  - `topup:pending:{paymentId}` (EX 3600) — 크레딧 충전 개시 시 `(partnerId, amount)` 보관.
    Stub / PortOne 양 provider 공유 — webhook 와 `acknowledgeTopup` 모두 이 stash 로 partnerId/amount 정규화 + 위변조 금액 검증.

  HMR-safe (globalThis 캐싱). 백엔드 자동 선택:
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` → Upstash REST (HTTP, prod / serverless 권장).
  - 그 외 → `REDIS_URL` 로 ioredis (TCP, 로컬 Docker Redis).
  호출부는 `RedisClient` 만 의존 — 새 백엔드 추가는 어댑터 함수 한 개 추가 + env 분기.
- `aligo.ts` — 알리고 SMS / LMS / 알림톡 게이트웨이.
  - SMS/LMS spec: https://smartsms.aligo.in/admin/api/spec.html
  - 알림톡 spec: https://smartsms.aligo.in/alimapi.html

  공통 호출은 internal `callAligo` (SMS/LMS) 헬퍼가 담당, 세 종류의 export:
  - `sendOtpSms(receiver, code)` — 본인인증 6자리 코드 SMS (90byte 본문 한도).
    `ALIGO_TEST_MODE=Y` 일 때는 **호출자가** 알리고 호출 자체를 생략 + 코드 "000000" 고정 (`isAligoTestMode()`) — 코드가 의미를 가져 호출자 분기 필요.
  - `sendNotificationLms(receiver, message)` — URL 포함 사용자 알림 LMS (2000byte 본문).
    본인인증 이외 알림은 기본 알림톡으로 발송하지만, 템플릿이 검수되지 않은 시나리오(예:
    마감 시간 만료 안내) 폴백 채널로 남겨둠. `ALIGO_TEST_MODE=Y` 일 때는 **함수 내부에서**
    알리고 호출 skip + console.log 만 (OTP 와 다른 패턴).
  - `sendAlimtalk(receiver, { templateCode, subject, message, button?, failover? })` —
    카카오 알림톡. 본인인증 이외 모든 사용자 알림의 기본 발송 채널. **본문/버튼은 알리고
    콘솔에서 검수 받은 템플릿과 1바이트라도 다르면 거부됨** — 본문 작성은
    [kakao-templates.ts](kakao-templates.ts) 의 빌더만 사용. `ALIGO_TEST_MODE=Y` 일 때는
    함수 내부에서 호출 skip + console dry-run.

  운영 (Vercel) 에선 `ALIGO_PROXY_URL` + `ALIGO_PROXY_SECRET` 설정 시 알리고 직접 호출
  대신 고정 IP 프록시 경유 — SMS/LMS 는 `$URL/aligo/send/`, 알림톡은 `$URL/aligo/alimtalk/send/`.
  Vercel egress IP 가 동적이라 알리고 whitelist 통과 불가, 프록시 인프라는
  [infra/aligo-proxy/](../../infra/aligo-proxy/). EnvSchema refine 으로 "URL 만 있고 SECRET
  누락" misconfig 차단.

- `kakao-templates.ts` — 알림톡 템플릿 카탈로그. 알리고 콘솔의 검수본을 **이 파일이
  단일 미러**. 각 빌더는 변수 객체를 받아 `{ subject, message, button?, failover? }` 페이로드
  일부를 반환 — 호출자는 `sendAlimtalk(phone, { templateCode, ...builder(vars) })` 패턴.
  현재 등록 템플릿:
  - `UI_0735` (`buildNewAssignmentAlimtalk`) — 파트너 선택 알림 (가입자 → 설계사)
  - `UI_0738` (`buildContactRequestAlimtalk`) — 연락 요청 알림 (가입자 → 설계사)
  - `UI_0741` (`buildAnalysisCompletedAlimtalk`) — AI 분석 완료 알림 (시스템 → 가입자)
  원본 본문은 [kakao-template.md](../../kakao-template.md). 카카오 검수본이 바뀌면 이 파일
  먼저 갱신 + 알리고 콘솔 동시 반영.
- `branding.ts` — 서비스 표시 이름 (`getServiceName()`). SMS prefix 등 사용자 노출 문구의 단일 진입점.
  env: `SERVICE_NAME`. 추후 이메일/알림톡 문구에서도 재사용.
- `get-client-ip.ts` — `headers()` 기반 client IP 추출 (`x-forwarded-for` → `x-real-ip` → fallback).
  IP 기반 레이트리밋의 best-effort 입력. 강한 보장은 reverse proxy (Vercel/Cloudflare) 단의
  헤더로 격상 가능.
- `origin.ts` — 사용자 노출 base URL (`getPublicBaseUrl()`) 단일 진입점. Kakao OAuth `redirectTo`,
  알림톡 버튼 링크 / LMS 본문 링크, PortOne redirect URL, 어드민 가입 안내 URL 등 외부 노출 절대 URL 생성에
  모두 사용. 우선순위: `PUBLIC_BASE_URL` env → 요청 헤더 (`Origin` > `x-forwarded-*` > `host`) 폴백.
  prod / staging 에선 반드시 env 박을 것 (Vercel branch deployment 의 vercel.app URL 누출 방지).
  로컬 dev 는 env 미설정 시 헤더 폴백으로 LAN IP / ngrok 모두 자동 대응. **Supabase Dashboard 의
  Redirect URLs 화이트리스트**에 해당 호스트 등록 필수 — 누락 시 Supabase 가 redirectTo 무시하고
  Site URL (보통 localhost) 로 fallback.
- `portone.ts` — PortOne v2 API 클라이언트 (`getPortOneClient()`) + 4종 env (`STORE_ID` / `CHANNEL_KEY`
  / `API_SECRET` / `WEBHOOK_SECRET`) 단일 진입점. env 검증을 첫 호출 시점으로 지연 — `CREDIT_PAYMENT_PROVIDER=stub`
  인 dev 환경에선 PortOne env 미설정이어도 모듈 로드 자체는 통과 (s3.ts 패턴). HMR 안전 (globalThis 캐싱).
  사용처는 [src/features/credits/payment/portone.ts](../features/credits/payment/portone.ts) 한 곳뿐 —
  `initiatePayment` / `verifyWebhook` / `fetchPaymentStatus` / `cancelPayment` 모두 이 클라이언트 경유.

## S3 버킷 설정 (제안서 PDF)

- **버킷명**: `S3_BUCKET_PROPOSALS` env 로 지정. 100% private (public access block 켜기).
- **CORS**: presigned PUT 을 위한 브라우저 허용. 우리 도메인만 origin 허용.
  ```json
  [{
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["https://*.vercel.app", "https://<prod-domain>"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 600
  }]
  ```
- **IAM 정책**: dedicated user 에 prefix 한정 권한만.
  ```json
  {
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::<bucket>/proposals/*"
  }
  ```
- **Key 패턴**: `proposals/{assignment_id}/{nanoid(16)}.pdf` — assignment 가 경로에 박혀 있어
  forgery 1차 방어 (`isPlanProposalKeyForAssignment`) 가능. submit 단계의 HEAD 가 2차 방어.
- **Size 한도**: `PROPOSAL_PDF_MAX_BYTES` (default 10MB) — presigned PUT 으론 강제 못 함, HEAD-then-reject 방식.

## SQS (분석 파이프라인 잡 큐)

- **큐 URL**: `SQS_ANALYSIS_QUEUE_URL` env 로 지정. AWS_REGION/ACCESS_KEY 는 위 S3 와 동일 IAM user 공유.
- **IAM 정책 추가**:
  ```json
  {
    "Effect": "Allow",
    "Action": ["sqs:SendMessage"],
    "Resource": "arn:aws:sqs:<region>:<account>:<queue-name>"
  }
  ```
- **발행 시점**: `submitPlanProposal` 액션의 DB 트랜잭션 commit 직후. 실패는 로깅 (graceful) — DB 는 이미 저장됨, 누락 메시지는 별도 backfill 잡으로 재발행.
- **페이로드**: `{ request_id, graph: "proposal_analysis", input: { s3_key }, webhook: { url }, metadata: { proposal_id, plan_request_id } }`. `request_id` 는 메시지마다 새로 생성하는 UUID (correlation/logging 용). 우리 도메인 식별은 `metadata.*_id` 가 책임. 소비자는 eightytwo_judge.
- **콜백 URL**: `ANALYSIS_CALLBACK_URL` env. eightytwo_judge 가 분석 완료 시 그 URL 로 POST → `/api/webhooks/eightytwo-judge-analysis` 라우트 처리. dev 에선 ngrok 같은 tunnel 필요.

## 분석 완료 웹훅

- **라우트**: `/api/webhooks/eightytwo-judge-analysis` (POST) — [src/app/api/webhooks/eightytwo-judge-analysis/route.ts](../app/api/webhooks/eightytwo-judge-analysis/route.ts).
- **인증**: HMAC-SHA256. `ANALYSIS_WEBHOOK_SECRET` env 의 secret 으로 raw body 를 HMAC → `X-Signature: sha256=<hex>` 헤더. 우리 라우트가 동일 계산 후 `timingSafeEqual` 비교.
- **페이로드**:
  ```
  { request_id, status: "succeeded"|"failed", result: AnalysisReportV5|null,
    error: AnalysisError|null,            // { group, type, message, detail? }
    metadata: { proposal_id, plan_request_id }, duration_ms }
  ```
  `metadata.*` 는 우리가 SQS metadata 로 실어 보낸 값이 그대로 passthrough. `request_id` 는 발행 시 생성한 UUID 가 echo 되어 옴 (correlation/log 용, DB 식별엔 사용 안 함). `error.group` 은 `input_error | product_id_match | internal_error` enum 고정 — 미정의 group 은 zod 단계에서 reject (DB 진입 차단).
- **동작**:
  - `failed` → `plan_proposal.analysisError + analysisErrorAt` 마킹 (WHERE id + assignment.requestId 매치 + `analyzedAt IS NULL` — 성공 분석이 들어와 있으면 덮어쓰기 금지, race-safe). `analyzedAt` 은 건드리지 않음 → plan_request 전이 안 일어남. 마킹 성공 시 `/admin/analysis-failures` + `/admin/requests/[id]` revalidate. 어드민이 외부 시스템 수정 후 `retryPlanProposalAnalysis` 액션으로 재발행 (`features/plan-proposals/actions.ts`).
  - `succeeded` → 트랜잭션 안에서:
    1. `plan_proposal.analyzedAt = now()` (WHERE id + assignment.requestId(=plan_request_id) 매치 + analyzedAt IS NULL → 첫 콜백만 기록, 페이로드 위조 차단, race-free).
    2. `updated.count===1` 이면 `plan_proposal_analysis_report` INSERT (proposalId 1:1, schemaVersion=result.schema_version, report=result 본문, durationMs).
    트랜잭션 후, plan_request 의 **모든 plan_request_assignment** 가 submitted + 그 plan_proposal 이 analyzed 인 경우에만 `plan_request.status='analyzing' → 'completed'`. pending/expired assignment 가 하나라도 있으면 전이 안 함 (assignment 총수 vs fully-analyzed 수 비교).
- **저장 책임**: 이 웹훅이 분석 리포트 + 분석 실패 마킹의 단일 writer. read 는 [features/plan-proposals/queries.ts](../features/plan-proposals/queries.ts) 의 `getAnalysisReport(proposalId)` / `listFailedAnalysisPlanProposals()`.
- **재시도 안전**: 정상 처리든 no-op 이든 200 반환. updateMany WHERE 절 + transaction 으로 첫 콜백만 INSERT 보장 (race-free). 발신측 중복 이벤트도 멱등. failed → succeeded 전환도 안전 (succeeded 가 analyzedAt 채우면 이후 failed 는 WHERE 조건으로 no-op).

## DB 컨벤션

- **모든 PK 는 app-side nanoid(16)** — schema.prisma 에 `String @id` (DB DEFAULT 없음).
  INSERT 직전에 `newId()` (`@/lib/id`) 로 생성해 명시적으로 전달.
  - 16자 / 96비트 entropy / URL-safe alphabet (`a-zA-Z0-9_-`). 충돌 확률 사실상 0.
  - **타입 안전성**: Prisma generated 의 `*CreateInput.id` 는 필수 (default 없음) — 누락 시 컴파일 에러.
  - **부모/자식 동시 build**: 부모 id 미리 생성 → 자식들 같은 id 로 build → 트랜잭션
    안에서 한꺼번에 INSERT. `prisma.$transaction(...)` 으로 ACID 보장.
- **토큰 (result_token, OTP 등)** 은 더 긴 entropy 필요 → `newToken()` (32자, 192비트).
- **value/format/range 검증은 zod (앱 레이어) 단일 진실 공급원.** DB 의 CHECK
  제약은 사용하지 않음 — 스키마 변경 시 두 곳 동기화 부담 회피. 모든 도메인
  무결성은 zod + Server Action 에서.
- **DB 는 구조 무결성만 책임** — PK / FK / NOT NULL / UNIQUE / DEFAULT (+ Supabase 가
  자동 enable 하는 RLS).
- **race-safe 제약은 UNIQUE 인덱스로 표현** — 동시성 시점 이슈는 앱 레이어
  단독으론 못 막으므로 UNIQUE 인덱스로 DB 레벨 백업 (예: result_token, assignment 의
  (request, partner) 짝). Prisma 의 `@unique` / `@@unique` 로 표현 — schema.prisma
  안에서 모두 처리.
- **RLS — Supabase 가 새 테이블 자동 enable** (deny-by-default). 정책은 추가하지
  않음 — Prisma 는 PostgreSQL service_role 로 직접 연결해 RLS 를 우회. 추후
  client-side 에서 supabase-js 로 쿼리할 일이 생기면 그때만 정책 추가.
- **updated_at 자동 갱신**: Prisma 의 `@updatedAt` 가 client 레벨에서 INSERT/UPDATE 시
  timestamp 박음. DB 트리거 사용 안 함 — 모든 시점 컨트롤은 앱 레이어가 책임.

## DB 호출 패턴

```ts
// features/<x>/queries.ts — read
import "server-only";
import { prisma } from "@/server/db/prisma";

export async function getPlanRequestById(id: string) {
  return prisma.planRequest.findUnique({
    where: { id },
    include: { medicalHistory: { orderBy: { position: "asc" } } },
  });
}

// features/<x>/actions.ts — write + transaction
import "server-only";
import { prisma } from "@/server/db/prisma";
import { newId } from "@/lib/id";

export async function createPlanRequest(input: Step1Input) {
  const requestId = newId();
  return prisma.$transaction([
    prisma.planRequest.create({
      data: { id: requestId, ...mapStep1ToColumns(input) },
    }),
    prisma.planRequestMedicalHistory.createMany({
      data: input.medicalHistory.map((h, i) => ({
        id: newId(),
        requestId,
        position: i,
        ...h,
      })),
    }),
  ]);
}
```

**경계**: Prisma 의 PascalCase 모델 (camelCase 필드) 은 도메인 코드와 거의 1:1 매핑.
간단한 매핑 (`mapStep1ToColumns`) 만 query/action 내부에 두고, 페이지/액션이 받는 건
항상 도메인 타입 (zod 추론). Prisma 모델 그대로 페이지에 노출 금지 — feature 경계 유지.

## Transaction

```ts
// batch — 순차 실행, 한 트랜잭션
await prisma.$transaction([op1, op2, op3]);

// interactive — 조건부 로직 가능
await prisma.$transaction(async (tx) => {
  const req = await tx.planRequest.create({ data: ... });
  if (someCondition) await tx.planRequestCandidate.createMany({ ... });
  return req;
});
```

Supavisor transaction pooler 모드에서 한 트랜잭션 = 한 connection 점유, 종료 시 반환.
`SET LOCAL` 는 OK, `SET` (세션-wide) 는 NG.

## DAL 사용 패턴

```ts
// 인증 필수 — 비로그인 시 자동 redirect
const session = await requireSession();

// 인증 선택 — 비로그인 시 null
const session = await getOptionalSession();
```

**모든 인증 검사는 DAL 호출로 통일.** `cookies().get('session')` 같은 raw 코드를 페이지/액션에서 직접 쓰지 말 것 — DAL 이 추상화 boundary.

## features/<x>/queries.ts 와의 관계

- `server/`는 **횡단 관심사** (auth, db client).
- `features/<x>/queries.ts`는 **도메인 쿼리** (특정 테이블/리소스).
- 도메인 쿼리도 `import "server-only"` 필수. server/와 동일한 보호.

## ❌ 안티패턴

- `server/queries.ts` 라는 거대 파일 — 도메인별로 `features/<x>/queries.ts` 에 분산.
- DAL 을 우회해 raw cookies/headers 직접 읽기 — 보안 일관성 깨짐.
- DAL 함수가 throw 안 하고 boolean 반환 — 호출부에서 if 까먹으면 인증 없이 통과. **redirect/throw 가 안전.**
- Prisma 모델 객체를 그대로 페이지/액션 응답으로 노출 — 컬럼명 변경 시 외부 영향. 도메인 타입으로 한 번 mapping.
- `supabase.from('x').select(...)` 로 DB 쿼리 — DB 는 Prisma 로 통일. supabase-js 는 Auth/Storage 도입 시 그 영역만.

## 마이그레이션 워크플로우 — schema-first

**schema.prisma 가 DB 구조의 단일 진실 공급원.** 트리거/CHECK/partial index 같이
Prisma 가 모르는 SQL 은 이 프로젝트에선 사용 안 함 (앱 레이어로 통일). RLS 는
Supabase 가 자동 enable. 따라서 마이그레이션 SQL 은 Prisma 가 생성한 그대로
사용 — 수동 보강 불필요.

**핵심 규칙**: PR 에는 `schema.prisma` 만 변경. 사람/AI 가 `prisma migrate dev` 호출하지 말 것
(PR CI `check-no-migrations.yml` 이 차단). `prisma/migrations/` 는 사람이 안 건드림.

로컬 적용: worktree 격리 Docker Postgres 에 `pnpm db:push` 로 즉시 sync (migration 안 만듦).

⚠️ **schema 변경 후 dev 서버 재시작 필수** — `db:push` 가 DB 와 generated client 는 갱신하지만,
실행 중인 next-dev 프로세스는 메모리에 OLD client 를 들고 있어 새 컬럼 호출 시
`PrismaClientValidationError: Unknown argument` 발생. Turbopack HMR 가 `node_modules` 의
generated 모듈은 watch 안 함.

연결 URL:
- **로컬 (Docker postgres)**: `DATABASE_URL` = `DIRECT_URL` (pooler 없음, 같은 포트).
  `pnpm workspace:setup` 이 `.env.local` 에 자동 채움.
- **Vercel / staging / prod**: `DATABASE_URL` = Transaction pooler (6543, `?pgbouncer=true`),
  `DIRECT_URL` = Session pooler (5432, advisory lock / DDL in tx 필요).

전체 흐름: [docs/worktree-workflow.md](../../docs/worktree-workflow.md).

스키마 변경 절차:

```bash
# 1. schema.prisma 수정
# 2. 로컬 격리 DB 에 즉시 sync (migration 안 만듦)
pnpm db:push
# 3. 작동 확인 후 schema.prisma 만 commit/push → PR
# 4. 다른 worktree: git pull && pnpm db:push
```

수동 SQL (data migration / rename 등) 이 필요한 경우만 예외: PR 에 `manual-migration`
label 추가 → CI 차단 우회 → 직접 `prisma/migrations/<...>/migration.sql` 작성.

## 인증 구조 (Supabase + 역할 extension)

모든 인증은 단일 Supabase auth 풀. 역할별로 extension 테이블 1:1 (PK 공유) — 한
사용자가 여러 extension (admin + partner) 을 동시에 가질 수 있음:

```
auth.users (Supabase 관리)
   │ 1:1 via authId (UUID, claim 후 채워짐)
   ▼
claim.user        — 공통 정보 (id=nanoid, email/name/phone[UNIQUE])
   │ 1:1 (PK 공유) — 둘 다 가질 수도 있음
   ├──▶ claim.partner — 설계사 (bio, yearsOfExperience, trustMetric, licenseNumber, active). 1:1 으로 claim.partner_assignment_stats (exposure / selected / contacted 카운터) + claim.partner_credit_balance.
   └──▶ claim.admin   — 운영자 (active, 향후 permissions)

claim.partner_signup_invitation (임시) — partner 가입 진행 중 임시 보관. 가입 완료 시 user+partner 트랜잭션 INSERT + consumed.
```

`User.authId` 는 nullable — admin 은 운영자가 사전 등록 (authId=null) 후 첫 비번 로그인 시 claim.
partner 는 `partner_signup_invitation → Kakao 가입 콜백` 단일 진입점에서 user/partner row 와 authId 가
동시에 INSERT 되므로 nullable 인 채로 남는 케이스가 거의 없음. 이후 로그인은 DAL 이
`where: { authId }` 로 바로 lookup.

구성 파일:

1. **`supabase.ts`** — `@supabase/ssr` 의 `createServerClient` 로 cookie-based 세션. read 는 headers,
   write 는 mutable context (action/route handler/middleware) 에서만.
2. **`dal.ts`** — `getOptionalUser()` 진입점 + 역할별 `getOptional*Session()` / `require*Session()`.
   `requireAdminSession()`, `requirePartnerSession()` 둘 다 user + 해당 extension active
   통과 시에만 세션 반환. extension 존재 자체가 권한 — 둘 다 가진 사용자는 양쪽 모두 통과.
3. **루트 `middleware.ts`** — `/admin/*` + `/partner/*` optimistic 차단.
   **인증 boundary 아님** (docs/architecture.md §7.2) — 세션 cookie 없는 명백한 비로그인 유저를
   즉시 307 로 튕기고, 실제 권한은 DAL 이 판정. PPR 모드의 1초 meta refresh fallback 회피 목적도 겸함.
   `auth.getUser()` 가 `AuthError` (refresh 실패 등) throw 하면 stale `sb-*-auth-token*`
   cookie 명시 청소 — 라이브러리는 `AuthSessionMissingError` 에서만 자동 청소.
   admin 은 knock + X-Robots-Tag 추가. partner 는 `/partner/login` + `/partner/plan-request-assignments/*`
   (알림톡 토큰 진입) + `/partner/signup/*` (가입 초청 token) carve-out.

로그인 흐름:

- **Admin** (`/admin/login`) — 이메일/비번 → `signInWithPassword` → user lookup (admin.active) → authId claim → `/admin`.
- **Partner — 로그인** (`/partner/login`) — 이미 가입된 partner. Kakao OAuth → `signInWithOAuth` → Kakao 인증 → `/api/auth/callback` 가
  code→session 교환 + user lookup (partner.active) → `/partner`.
- **Partner — 가입** (`/partner/signup/<invitation_token>`) — 어드민이 발급한 일회용 초청. Kakao OAuth →
  `/api/auth/callback?signup=<token>` 가 invitation 재확인 + Kakao phone vs invitation.phone 매칭 +
  user/partner 트랜잭션 INSERT + invitation 소비 → `/partner`. 자세한 건 docs/architecture.md §7.4.
