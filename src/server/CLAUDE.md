# server/ — 서버 전용 모듈

## 절대 규칙

1. **모든 파일 첫 줄에 `import "server-only"`.** 클라이언트 번들에 실수로 포함되면 빌드가 실패하도록 강제. 빠뜨리지 말 것.
2. **클라이언트에서 절대 import 금지.** Server Component / Server Action / Route Handler에서만.
3. **`server/`에서 client 모듈을 import하지 말 것** (cyclic, 의미 없음).

## 무엇이 들어가나

- `dal.ts` — Data Access Layer. **Admin / Partner 인증 검사의 단일 진입점.**
  - `getOptionalUser()` — Supabase `auth.getUser()` → `claim.user` (`where authId`) 조회. React.cache 로 same-request dedupe.
  - `requireAdminSession()` / `getOptionalAdminSession()` — user + role='admin' + `claim.admin.active` 2단계 검증.
  - `requirePartnerSession()` / `getOptionalPartnerSession()` — user + role='partner' + `claim.partner.active` 2단계 검증.
  - 미인증/권한 없음 → 각 영역 login 페이지로 redirect (admin: `/admin/login`, partner: `/partner/login`).
  - 가입자 + partner 토큰 진입(`/partner/assignments/[token]`)은 DAL 미사용 — 액션 진입부에서 token → row + status 검증이 권한 판정 역할.
- `supabase.ts` — `@supabase/ssr` 의 `createServerClient` wrap. cookie-based 세션 +
  publishable key 사용 (RLS 적용). Auth flow (signIn/signOut/getUser) 가 이걸 쓰고,
  routine DB 쿼리는 prisma 사용 (분리).
- `db/prisma.ts` — **Prisma client 싱글톤. 모든 DB 쿼리/트랜잭션의 단일 진입점.**
- `s3.ts` — 제안서 PDF 업로드/다운로드 S3 헬퍼. presigned PUT/GET URL + HEAD 검증
  (`verifyUploadedObject`) + 본문 SHA-256 계산 (`fetchObjectSha256`, stream-based — 외부 분석 리포트와 join 할 hash).
- `settings.ts` — single-row `app_settings` 로드/갱신. `SettingsPatch` 가 admin 폼에서 갱신
  가능한 필드 (candidateCount / selectLimit / submissionDeadlineHours / penaltyWindow /
  resultRetentionDays / scenarioPriority).

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
  forgery 1차 방어 (`isProposalKeyForAssignment`) 가능. submit 단계의 HEAD 가 2차 방어.
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
- **발행 시점**: `submitProposal` 액션의 DB 트랜잭션 commit 직후. 실패는 로깅 (graceful) — DB 는 이미 저장됨, 누락 메시지는 별도 backfill 잡으로 재발행.
- **페이로드**: `{ request_id, graph: "proposal_analysis", input: { s3_key }, webhook: { url }, metadata: { proposal_id, plan_request_id } }`. `request_id` 는 메시지마다 새로 생성하는 UUID (correlation/logging 용). 우리 도메인 식별은 `metadata.*_id` 가 책임. 소비자는 eightytwo_judge.
- **콜백 URL**: `ANALYSIS_CALLBACK_URL` env. eightytwo_judge 가 분석 완료 시 그 URL 로 POST → `/api/webhooks/eightytwo-judge-analysis` 라우트 처리. dev 에선 ngrok 같은 tunnel 필요.

## 분석 완료 웹훅

- **라우트**: `/api/webhooks/eightytwo-judge-analysis` (POST) — [src/app/api/webhooks/eightytwo-judge-analysis/route.ts](../app/api/webhooks/eightytwo-judge-analysis/route.ts).
- **인증**: HMAC-SHA256. `ANALYSIS_WEBHOOK_SECRET` env 의 secret 으로 raw body 를 HMAC → `X-Signature: sha256=<hex>` 헤더. 우리 라우트가 동일 계산 후 `timingSafeEqual` 비교.
- **페이로드**:
  ```
  { request_id, status: "succeeded"|"failed", result: AnalysisReportV5|null,
    error: { code, message }|null,
    metadata: { proposal_id, plan_request_id }, duration_ms }
  ```
  `metadata.*` 는 우리가 SQS metadata 로 실어 보낸 값이 그대로 passthrough. `request_id` 는 발행 시 생성한 UUID 가 echo 되어 옴 (correlation/log 용, DB 식별엔 사용 안 함).
- **동작**:
  - `failed` → 로그만 (proposal.analyzedAt=null 유지, 발신측 재시도 가능).
  - `succeeded` → 트랜잭션 안에서:
    1. `proposal.analyzedAt = now()` (WHERE id + assignment.requestId(=plan_request_id) 매치 + analyzedAt IS NULL → 첫 콜백만 기록, 페이로드 위조 차단, race-free).
    2. `updated.count===1` 이면 `proposal_analysis_report` INSERT (proposalId 1:1, schemaVersion=result.schema_version, report=result 본문, durationMs).
    트랜잭션 후, plan_request 의 **모든 match_assignment** 가 submitted + 그 proposal 이 analyzed 인 경우에만 `plan_request.status='analyzing' → 'completed'`. pending/expired assignment 가 하나라도 있으면 전이 안 함 (assignment 총수 vs fully-analyzed 수 비교).
- **저장 책임**: 이 웹훅이 분석 리포트의 단일 writer. read 는 [features/proposals/queries.ts](../features/proposals/queries.ts) 의 `getAnalysisReport(proposalId)`.
- **재시도 안전**: 정상 처리든 no-op 이든 200 반환. updateMany WHERE 절 + transaction 으로 첫 콜백만 INSERT 보장 (race-free). 발신측 중복 이벤트도 멱등.

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
// Admin — 비로그인 / 비-admin 시 /admin/login 으로 자동 redirect
const session = await requireAdminSession();   // 또는 getOptionalAdminSession() (null 반환)

// Partner — 비로그인 / 비-partner 시 /partner/login 으로 자동 redirect
const session = await requirePartnerSession(); // 또는 getOptionalPartnerSession()
```

**Admin/Partner 인증 검사는 DAL 호출로 통일.** `cookies().get('sb-...')` 같은 raw Supabase
cookie 직접 파싱 금지 — DAL 이 추상화 boundary.

가입자 + partner 토큰 진입 (`/partner/assignments/[token]`) 은 DAL 미사용 — 액션 진입부에서 token → row 조회 + status 검증이 권한 판정:

```ts
// features/proposals/actions.ts 패턴
const assignment = await prisma.matchAssignment.findUnique({
  where: { token }, select: { id: true, status: true, requestId: true },
});
if (!assignment) return { ok: false, errors: { _form: ["유효하지 않은 링크입니다."] } };
if (assignment.status !== "pending") return { ok: false, ... };
```

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

**핵심 규칙**: PR 에는 `schema.prisma` 만 변경. `prisma/migrations/` 는 develop merge
후 GitHub Actions (`.github/workflows/auto-migration.yml`) 이 단일 writer 로 자동 생성.
사람/AI 가 `prisma migrate dev` 호출하지 말 것 (PR CI `check-no-migrations.yml` 이 차단).

3단 계층:

| 환경 | DB | 적용 방식 |
|---|---|---|
| 로컬 worktree | 격리 Docker Postgres | `pnpm db:push` (즉시 sync, migration 안 만듦) |
| develop dev | 원격 Supabase dev project | develop push → CI 가 `prisma migrate dev` 자동 호출 + commit |
| 운영 prod | 원격 Supabase prod | master push (migrations/ 변경) → GitHub Actions `deploy-migrations.yml` 가 `prisma migrate deploy` 자동 (Vercel build 와 분리) |

연결 URL:
- **로컬 (Docker postgres)**: `DATABASE_URL` = `DIRECT_URL` (pooler 없음, 같은 포트).
  `pnpm db:start` 가 `.env.local` 에 자동 채움.
- **Vercel / staging / prod**: `DATABASE_URL` = Transaction pooler (6543, `?pgbouncer=true`),
  `DIRECT_URL` = Session pooler (5432, advisory lock / DDL in tx 필요).

전체 흐름과 충돌 카탈로그: [docs/worktree-workflow.md](../../docs/worktree-workflow.md).

스키마 변경 절차:

```bash
# 1. schema.prisma 수정
# 2. 로컬 격리 DB 에 즉시 sync (migration 안 만듦)
pnpm db:push
# 3. 작동 확인 후 schema.prisma 만 commit/push → PR
# 4. develop merge 후 CI 가 정식 migration 생성/commit/push
# 5. 다른 worktree: git pull && pnpm db:migrate:deploy
```

수동 SQL (data migration / rename 등) 이 필요한 경우만 예외: PR 에 `manual-migration`
label 추가 → CI 차단 우회 → 직접 `prisma/migrations/<...>/migration.sql` 작성.

## Admin 인증 구조 (Supabase + 화이트리스트)

도입 완료 (`server/supabase.ts` + `server/dal.ts` + 루트 `middleware.ts`):

1. **`supabase.ts`** — `@supabase/ssr` 의 `createServerClient` 로 cookie-based 세션.
2. **`dal.ts:getOptionalAdminSession()`** — `auth.getUser()` (JWT 서버 검증) →
   `admin_users` 화이트리스트 lookup. 둘 다 통과해야 `AdminSession` 반환.
   `requireAdminSession()` 는 null 시 `/admin/login` 으로 redirect.
3. **루트 `middleware.ts`** — `/admin/*` 전용 optimistic 차단 + knock 게이트 +
   X-Robots-Tag. **인증 boundary 아님** (docs/architecture.md §7.2) — 세션 cookie
   없는 명백한 비로그인 봇/유저를 즉시 307 로 튕기고, 실제 권한은 DAL 이 판정.
   PPR 모드에서 layout `redirect()` 가 1초 meta refresh fallback 으로 처리되는
   문제를 우회하는 목적도 겸함.

## Partner 인증 도입 시

1. `dal.ts:getOptionalPartnerSession()` 의 demo 반환 → `supabase.auth.getUser()` +
   `partner` 테이블 (uuid 매핑) 조회로 교체. 시그니처 동일 → 호출부 무수정.
2. `middleware.ts` matcher 에 `/partner/:path*` 추가 + 동일한 optimistic 분기.
3. Partner.id 를 nanoid → `auth.users.id` (UUID) 마이그레이션 (prisma/schema.prisma
   에 명시된 계획).
