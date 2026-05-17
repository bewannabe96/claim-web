# server/ — 서버 전용 모듈

## 절대 규칙

1. **모든 파일 첫 줄에 `import "server-only"`.** 클라이언트 번들에 실수로 포함되면 빌드가 실패하도록 강제. 빠뜨리지 말 것.
2. **클라이언트에서 절대 import 금지.** Server Component / Server Action / Route Handler에서만.
3. **`server/`에서 client 모듈을 import하지 말 것** (cyclic, 의미 없음).

## 무엇이 들어가나

- `dal.ts` — Data Access Layer. **모든 인증 검사의 단일 진입점.**
- `auth.ts` (TODO) — Supabase Auth 클라이언트 wrap. 인증 도입 시 추가
  (`@supabase/ssr` 의 `createServerClient` / `createBrowserClient` 패턴, 서버 cookie-based 세션).
- `db/prisma.ts` — **Prisma client 싱글톤. 모든 DB 쿼리/트랜잭션의 단일 진입점.**
- `s3.ts` — 제안서 PDF 업로드/다운로드 S3 헬퍼. presigned PUT/GET URL + HEAD 검증
  (`verifyUploadedObject`) + 본문 SHA-256 계산 (`fetchObjectSha256`, stream-based — 외부 분석 리포트와 join 할 hash).
- `settings.ts` — single-row `app_settings` 로드/갱신. `SettingsPatch` 가 admin 폼에서 갱신
  가능한 필드 (candidateCount / selectLimit / submissionDeadlineHours / penaltyWindow /
  scenarioPriority).

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

## DB 컨벤션

- **모든 PK 는 app-side nanoid(16)** — schema.prisma 에 `String @id` (DB DEFAULT 없음).
  INSERT 직전에 `newId()` (`@/lib/id`) 로 생성해 명시적으로 전달.
  - 16자 / 96비트 entropy / URL-safe alphabet (`a-zA-Z0-9_-`). 충돌 확률 사실상 0.
  - **타입 안전성**: Prisma generated 의 `*CreateInput.id` 는 필수 (default 없음) — 누락 시 컴파일 에러.
  - **부모/자식 동시 build**: 부모 id 미리 생성 → 자식들 같은 id 로 build → 트랜잭션
    안에서 한꺼번에 INSERT. `prisma.$transaction(...)` 으로 ACID 보장.
- **토큰 (result_token, OTP 등)** 은 더 긴 entropy 필요 → `newToken()` (32자, 192비트).
- **value/format/range 검증은 zod (앱 레이어) 단일 진실 공급원.** DB 의 CHECK
  제약은 추가하지 않음 — 스키마 변경 시 두 곳 동기화 부담 회피.
- **DB 는 구조 무결성만 책임** — PK / FK / NOT NULL / UNIQUE / RLS / DEFAULT.
- **race-safe 제약은 UNIQUE 인덱스로 표현** — 동시성 시점 이슈는 앱 레이어
  단독으론 못 막으므로 partial unique index 등으로 DB 레벨 백업 (예: phone
  중복 송부 방지, result_token 충돌 방지). Prisma 가 partial index 를 native 지원 안 해
  생성된 migration SQL 을 수동 보강.
- **모든 테이블 RLS enabled + 정책 0** = anon/authenticated deny-by-default.
  REST API endpoint 는 살림 — 추후 client-side 가 필요해지면 정책만 추가.
  Prisma 는 PostgreSQL 사용자로 직접 연결 (RLS 우회). Auth 도입 후 client-side 에서
  Supabase JS 로 쿼리할 일이 생기면 그때 정책 추가.
- **updated_at 자동 갱신**: DB 트리거 `tg_set_updated_at` 가 UPDATE 시 갱신.
  Prisma 의 `@updatedAt` 은 사용 안 함 (트리거와 이중 처리됨).

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

## 마이그레이션 워크플로우

**Prisma 가 schema (테이블/컬럼/FK/일반 인덱스) 의 진실 공급원.** `prisma/migrations/`
가 적용 이력. Prisma 가 모르는 부분 (partial unique index, 트리거, RLS 정책) 은
생성된 migration SQL 을 수동 보강.

연결 분리: 런타임 쿼리는 `DATABASE_URL` (Transaction pooler 6543), migrate 명령은
`DIRECT_URL` (Session pooler 5432). 무료 플랜에서 Direct connection (5432, 진짜 DB 호스트)
은 IPv4 유료라 둘 다 pooler 호스트 사용.

스키마 변경 절차:

```bash
# 1. schema.prisma 수정
# 2. dev migration 생성 + 적용 (DIRECT_URL 필요)
pnpm prisma migrate dev --name <설명>
# 3. 생성된 migration SQL 검수 — partial index / RLS 등 Prisma 가 모르는 부분
#    수동 보강 필요시 SQL 직접 수정 후 prisma migrate dev 재실행
# 4. Prisma client 재생성 (자동 호출됨, 수동 시 `pnpm prisma generate`)
```

production 배포:

```bash
pnpm prisma migrate deploy  # 대기 중 migration 적용 (DATABASE_URL 사용)
```

## 인증 도입 시 (Supabase Auth)

1. `server/auth.ts` 작성 — `@supabase/ssr` 의 `createServerClient` 로 cookie-based 세션.
2. `server/dal.ts` 의 `getOptionalSession` 이 `auth.getUser()` 호출하도록 교체.
3. 호출부 무수정 — 시그니처 동일.
