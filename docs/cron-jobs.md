# Cron 작업 — 필요 기능 목록 & 구현 가이드

> 이 프로젝트의 시간 기반 상태 전이는 현재 **lazy evaluation** (페이지 접근/요청 시점 검증)으로만 처리되고 있습니다. 이 문서는 백그라운드 cron 으로 옮겨야 하는 기능을 한눈에 보고 진행 상황을 추적하기 위한 단일 진실 공급원입니다.
>
> - 작성일: 2026-05-19
> - 상태: 분석 완료, **구현 0건**
> - 관련 문서: [prd.md](./prd.md), [architecture.md](./architecture.md)

---

## 0. 한눈에 보기

| # | 작업 | 우선순위 | 주기 | 구현 상태 |
|---|------|---------|------|-----------|
| 1 | 제출 마감 자동 처리 + 요청 상태 전이 | 🔴 필수 | 1~5분 | ❌ |
| 2 | 결과 토큰(resultToken) 만료 정리 | 🔴 필수 | 6~24시간 | ❌ |
| 3 | Partner Invitation 미사용 초청 정리 | 🔴 필수 | 12~24시간 | ❌ |
| 4 | 0건 제출 시 자동 재매칭 | 🟡 권장 | 마감 직후 이벤트 | ❌ |
| 5 | 분석 실패 자동 재시도 | 🟡 권장 | 30분~6시간 | ❌ |
| 6 | SMS OTP 코드 만료 정리 | ⏸ 보류 | — | ⏸ Redis TTL 자동 만료로 cron 불필요 |
| 7 | 일일 운영 통계 사전 집계 | 🟢 선택 | 매일 자정 | ❌ |
| 8 | 설계사 노출 카운트 리셋 | 🟢 선택 | 주/월 단위 | ❌ |
| 9 | 오래된 데이터 아카이빙 | 🟢 선택 | 월 1회 | ❌ |

**진행 표기**: ❌ 미구현 / 🚧 진행 중 / ✅ 완료 / ⏸ 보류

---

## 1. 공통 기술 결정

### 1.1 스케줄러 선택

| 방식 | 장점 | 단점 | 권장 |
|------|------|------|------|
| **Vercel Cron** | Next.js 내장, 별도 인프라 0 | 최소 1분 주기, Hobby 플랜 제한 | ⭐ MVP |
| AWS EventBridge | 초 단위 정밀도, 재시도 강력 | 추가 설정 | 향후 |
| pg_cron | DB 안에서 완결 | 복잡 로직 부적합 | 비추 |
| node-cron | 로컬 간편 | 서버 재시작 시 손실 | 비추 |

**결정**: Phase 1~2 는 Vercel Cron, Phase 3 부터 필요 시 EventBridge 도입.

### 1.2 라우트 패턴

모든 cron 은 `src/app/api/cron/<job-name>/route.ts` (Route Handler) 로 구현.

```ts
// src/app/api/cron/<job>/route.ts
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel 한도 (Hobby 60s / Pro 300s)

export async function GET(req: NextRequest) {
  // 1) Bearer 토큰 검증 — Vercel Cron 은 자동으로 Authorization 헤더 주입
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2) 작업 본문
  const result = await runJob();

  // 3) 구조화된 결과 반환 (로그/모니터링용)
  return Response.json({ ok: true, ...result });
}
```

### 1.3 환경 변수

`.env.local` / Vercel project env 에 추가:

```
CRON_SECRET=<openssl rand -hex 32>
```

### 1.4 vercel.json

```json
{
  "crons": [
    { "path": "/api/cron/assignment-deadline-expiry", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/result-token-expiry", "schedule": "0 4 * * *" },
    { "path": "/api/cron/partner-invitation-cleanup", "schedule": "0 5 * * *" },
    { "path": "/api/cron/retry-failed-analysis", "schedule": "0 */2 * * *" }
  ]
}
```

> Vercel Cron 은 GET 만 호출. Bearer 토큰은 Vercel 이 알아서 주입 (project env `CRON_SECRET` 자동 연결).

### 1.5 멱등성 원칙

모든 cron job 은 **재실행 안전 (idempotent)** 해야 함:

- `updateMany WHERE <조건>` 패턴으로 이미 처리된 행 제외.
- 상태 전이는 트랜잭션 내부에서.
- 메시지 발행 (SQS) 실패는 graceful — 다음 회차가 재발행.

### 1.6 로깅/모니터링

- 각 cron 시작/완료/실패는 `console.log` + 구조화 객체 (job name, affected count, duration).
- Vercel 로그 → 후속 단계에서 Sentry/Datadog 연동.

### 1.7 Timezone

모든 DB 시간 컬럼은 `@db.Timestamptz(6)`. 비교는 항상 UTC 기준 (`new Date()`). 사용자 노출은 표시 단계에서 KST 변환.

---

## 2. Phase 1 — 필수 (즉시 착수)

### 2.1 🔴 작업 #1: 제출 마감 자동 처리 + 요청 상태 전이

**상태**: ❌ 미구현
**주기**: `*/5 * * * *` (5분 권장; 마감 정밀도가 필요하면 `*/1 * * * *`)
**라우트**: `src/app/api/cron/assignment-deadline-expiry/route.ts`

#### 배경

- `PlanRequest.deadlineAt` 은 `dispatchedAt + AppSettings.submissionDeadlineHours` 로 set ([src/features/requests/actions.ts:331-349](../src/features/requests/actions.ts)).
- `MatchAssignment.status` 는 `pending → submitted` 또는 `pending → expired` 둘 중 하나로만 종결됨.
- 현재 `expired` 로 마킹하는 코드 경로는 **존재하지 않음**. 마감 후에도 영구 `pending` 으로 남음.
- 분석 완료 웹훅 ([src/app/api/webhooks/eightytwo-judge-analysis/route.ts:197-220](../src/app/api/webhooks/eightytwo-judge-analysis/route.ts)) 의 `plan_request.status='analyzing' → 'completed'` 전이는 **모든 assignment 가 종결** 됐을 때만 발생 → 1명이라도 `pending` 으로 남으면 영원히 `analyzing` 에 갇힘.

#### 무엇을 한다

1. `MatchAssignment WHERE status='pending' AND request.deadlineAt <= NOW()` 조회 (request 와 join).
2. 해당 행을 `status='expired'` 로 일괄 업데이트.
3. 영향받은 각 `requestId` 에 대해 **상태 전이 함수** 호출:
   - 모든 assignment 가 종결됐고 (`pending=0`)
   - 종결 중 submitted 가 1개 이상이면 `dispatched → analyzing` (이미 그렇지만 멱등).
   - 모든 submitted assignment 의 proposal 이 analyzed 면 `analyzing → completed` (웹훅과 동일 로직).
   - submitted 가 0개 (전부 expired) 면 `→ rematching` 또는 `→ failed` (작업 #4 트리거).
4. `/admin/requests` revalidatePath.

#### 사전 작업: 상태 전이 로직 추출

웹훅의 [route.ts:197-220](../src/app/api/webhooks/eightytwo-judge-analysis/route.ts) 의 전이 코드를 **공용 함수로 추출**:

```ts
// src/features/requests/state-transition.ts (신규)
import "server-only";
import { prisma } from "@/server/db/prisma";

/**
 * plan_request 의 모든 match_assignment 가 종결됐을 때 다음 상태로 전이.
 * 멱등 — WHERE 조건으로 잘못된 시점 호출은 no-op.
 *
 * 호출처:
 *  - 웹훅 (proposal 분석 완료 콜백) — 마지막 analyzed 가 들어왔을 때
 *  - cron (assignment-deadline-expiry) — pending 을 expired 로 바꾼 직후
 */
export async function finalizeRequestStatus(requestId: string): Promise<void> {
  const [total, pending, submitted, analyzed] = await Promise.all([
    prisma.matchAssignment.count({ where: { requestId } }),
    prisma.matchAssignment.count({ where: { requestId, status: "pending" } }),
    prisma.matchAssignment.count({ where: { requestId, status: "submitted" } }),
    prisma.matchAssignment.count({
      where: {
        requestId,
        status: "submitted",
        proposal: { analyzedAt: { not: null } },
      },
    }),
  ]);

  // 아직 미종결 assignment 있으면 대기
  if (pending > 0) return;

  // 전부 expired (0건 제출) → rematching 트리거 (작업 #4 가 픽업)
  if (submitted === 0) {
    await prisma.planRequest.updateMany({
      where: { id: requestId, status: { in: ["dispatched", "analyzing"] } },
      data: { status: "rematching" },
    });
    return;
  }

  // 모든 submitted 가 analyzed → completed
  if (total > 0 && submitted === analyzed) {
    await prisma.planRequest.updateMany({
      where: { id: requestId, status: "analyzing" },
      data: { status: "completed" },
    });
  }
}
```

웹훅의 라인 201-220 는 이 함수 호출로 교체.

#### 구현 골격

```ts
// src/app/api/cron/assignment-deadline-expiry/route.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { finalizeRequestStatus } from "@/features/requests/state-transition";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 마감 지난 pending assignment 의 requestId 수집
  const now = new Date();
  const stale = await prisma.matchAssignment.findMany({
    where: {
      status: "pending",
      request: { deadlineAt: { lte: now } },
    },
    select: { id: true, requestId: true },
  });

  if (stale.length === 0) {
    return Response.json({ ok: true, expired: 0, transitioned: 0 });
  }

  await prisma.matchAssignment.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: "expired" },
  });

  // 영향받은 request 별로 상태 전이 (중복 제거)
  const requestIds = [...new Set(stale.map((s) => s.requestId))];
  await Promise.all(requestIds.map(finalizeRequestStatus));

  revalidatePath("/admin/requests");

  return Response.json({
    ok: true,
    expired: stale.length,
    transitioned: requestIds.length,
  });
}
```

#### 체크리스트

- [ ] `src/features/requests/state-transition.ts` 신규 + 웹훅 리팩토링
- [ ] `src/app/api/cron/assignment-deadline-expiry/route.ts` 추가
- [ ] `vercel.json` 에 schedule 등록
- [ ] `CRON_SECRET` 환경변수 등록 (Vercel + .env.local)
- [ ] 로컬 테스트: `deadlineAt` 을 과거로 수동 set → curl 로 호출 → DB 확인

#### 알림 발송 (현황)

- 분석 완료 (`analyzing → completed`) 시 가입자 결과 페이지 링크 LMS — **구현 완료** ([webhook route 의 `notifyAnalysisCompleted`](../src/app/api/webhooks/eightytwo-judge-analysis/route.ts), `server/aligo.ts:sendNotificationLms` 사용).
- 작업 #1 (deadline 만료) 트리거 시점의 부수 알림은 미구현 — `pending → expired` 전이 시 설계사 마감 안내 LMS (시점 2-4), 그리고 작업 #4 의 `dispatched → rematching` 전이 시 가입자 재매칭 알림 LMS (시점 1-4) 가 함께 발송돼야 함. 두 시점 모두 `proposals/schema.ts` / `requests/schema.ts` 의 status enum 옆에 TODO 주석 표기. 알리고 LMS 모듈은 이미 존재하므로 cron 구현 시 `sendNotificationLms` 호출만 추가.

---

### 2.2 🔴 작업 #2: 결과 토큰(resultToken) 만료 정리

**상태**: ❌ 미구현
**주기**: `0 4 * * *` (매일 04:00 UTC = KST 13:00)
**라우트**: `src/app/api/cron/result-token-expiry/route.ts`

#### 배경

- `AppSettings.resultRetentionDays` (기본 7일) — [prisma/schema.prisma:408](../prisma/schema.prisma).
- 결과 페이지 [src/app/(marketing)/request/[id]/result/page.tsx](../src/app/(marketing)/request/%5Bid%5D/result/page.tsx) 가 `dispatchedAt + N일` 비교로 차단.
- DB 행은 무한 적재 → 장기 운영 시 스토리지 + 개인정보 누적.

#### 무엇을 한다

1. `getSettings()` 으로 `resultRetentionDays` 로드.
2. `PlanRequest WHERE dispatchedAt IS NOT NULL AND dispatchedAt + N일 < NOW() AND status IN ('completed', 'failed', 'rematching')` 조회.
3. **정책 결정 필요**:
   - **A안 (권장)**: `resultToken` 만 `null` 로 비우고 `status='ended'` 마킹 (감사 로그용 row 보존).
   - **B안**: 전체 행 `delete` (proposal + match_assignment + medicalHistory 까지 cascade).
4. revalidatePath('/admin/requests').

> 정책 결정 전까지는 A안 (soft expire) 로 시작.

#### 신규 상태 `ended` 추가

`PLAN_REQUEST_STATUSES` ([src/features/requests/schema.ts:287](../src/features/requests/schema.ts)) 에 이미 정의되어 있는지 확인 — 현재는 없음. 추가 필요:

```ts
export const PLAN_REQUEST_STATUSES = [
  "draft",
  "selecting",
  "confirming",
  "dispatched",
  "analyzing",
  "completed",
  "rematching",
  "failed",
  "ended",     // ← NEW: 결과 보관 기간 경과
] as const;
```

#### 구현 골격

```ts
// src/app/api/cron/result-token-expiry/route.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { resultRetentionDays } = await getSettings();
  const cutoff = new Date(Date.now() - resultRetentionDays * 86_400_000);

  const result = await prisma.planRequest.updateMany({
    where: {
      dispatchedAt: { lt: cutoff },
      status: { in: ["completed", "failed", "rematching"] },
    },
    data: { status: "ended", resultToken: null },
  });

  revalidatePath("/admin/requests");
  return Response.json({ ok: true, expired: result.count });
}
```

#### 체크리스트

- [ ] `PLAN_REQUEST_STATUSES` 에 `ended` 추가 + 사용처 (`ACTIVE_STATUSES` 등) 확인
- [ ] `src/app/api/cron/result-token-expiry/route.ts` 추가
- [ ] 결과 페이지 가드: `status='ended'` 시 404 처리 확인
- [ ] vercel.json schedule 등록
- [ ] (향후) hard delete 정책 결정

---

### 2.3 🔴 작업 #3: Partner Invitation 미사용 초청 정리

**상태**: ❌ 미구현
**주기**: `0 5 * * *` (매일 05:00 UTC = KST 14:00)
**라우트**: `src/app/api/cron/partner-invitation-cleanup/route.ts`

#### 배경

- `PartnerInvitation.expiresAt` 기본 TTL = `PARTNER_INVITATION_TTL_DAYS` (기본 7일, env override) — [src/features/partners/schema.ts:85](../src/features/partners/schema.ts).
- `consumedAt` null 인 행이 만료 후에도 잔존.
- 가입 흐름은 `expiresAt < NOW()` 를 lazy 검증 ([src/features/partners/queries.ts:139](../src/features/partners/queries.ts)).

#### 무엇을 한다

1. `PartnerInvitation WHERE consumedAt IS NULL AND expiresAt < NOW()` 조회.
2. `prisma.partnerInvitation.deleteMany({ ... })`.
3. `revalidatePath('/admin/partners')`.

> 소비된 초청 (`consumedAt IS NOT NULL`) 은 감사 로그용으로 보존 — 누가 언제 가입했는지 추적.

#### 구현 골격

```ts
// src/app/api/cron/partner-invitation-cleanup/route.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await prisma.partnerInvitation.deleteMany({
    where: {
      consumedAt: null,
      expiresAt: { lt: new Date() },
    },
  });

  revalidatePath("/admin/partners");
  return Response.json({ ok: true, deleted: result.count });
}
```

#### 체크리스트

- [ ] 라우트 추가
- [ ] vercel.json 등록
- [ ] 로컬 테스트: invitation 의 `expiresAt` 을 과거로 수동 set → 호출 → DELETE 확인

---

## 3. Phase 2 — 권장 (1개월 내)

### 3.1 🟡 작업 #4: 0건 제출 시 자동 재매칭

**상태**: ❌ 미구현
**주기**: 작업 #1 직후 트리거 (별도 cron 보다 chain 이 자연)
**라우트**: 작업 #1 안에서 호출 OR 별도 `/api/cron/auto-rematch`

#### 배경

- PRD §5.7: "1회 자동 재매칭 — 새 N명 후보 추천 → 가입자에게 알림으로 재선택 요청" (현재 알림 채널은 알리고 LMS).
- `PlanRequest.rematchCount` 필드 존재 ([prisma/schema.prisma:68](../prisma/schema.prisma)), 기본 0.
- `PlanRequestStatus.rematching` 상태 정의됨 ([src/features/requests/schema.ts:294](../src/features/requests/schema.ts)).
- 재매칭 실행 로직은 **구현 안 됨**.

#### 무엇을 한다

작업 #1 의 `finalizeRequestStatus` 가 "전부 expired 면 `rematching`" 으로 마킹한 후, 별도 cron 또는 같은 cron 의 후속 단계가:

1. `PlanRequest WHERE status='rematching' AND rematchCount=0` 조회.
2. 각 요청에 대해:
   - 기존 `findMatchCandidates()` 재호출 (이전 후보 제외).
   - 새 `PlanRequestCandidate` rows insert.
   - 새 `MatchAssignment` rows 생성 (가입자가 다시 선택해야 하므로 즉시 송부 아님 — UX 결정 필요).
   - **UX 분기 결정 필요**:
     - 옵션 A: 가입자에게 "재선택" 알림 (LMS) → 가입자가 새 후보 중 K명 다시 골라야 함.
     - 옵션 B: 시스템이 자동으로 상위 K명 선택 → 즉시 송부 (UX 단순, 가입자 의사 무시).
   - `rematchCount = 1`, `dispatchedAt = now`, `deadlineAt = now + submissionDeadlineHours`.
3. 2회 실패하면 `status='failed'` 로 종결.

#### 의존성

- [ ] **UX 결정**: 옵션 A vs B
- [ ] `findMatchCandidates()` 의 "이전 후보 제외" 옵션 — 현재 시그니처 확인 필요

(알림 발송 인프라는 `server/aligo.ts:sendNotificationLms` 로 이미 제공됨 — cron 구현 시 호출만 추가.)

#### 구현 우선순위

작업 #1 완료 후 착수.

---

### 3.2 🟡 작업 #5: 분석 실패 자동 재시도

**상태**: ❌ 미구현
**주기**: `0 */2 * * *` (2시간마다)
**라우트**: `src/app/api/cron/retry-failed-analysis/route.ts`

#### 배경

- 외부 분석 파이프라인 (eightytwo_judge) 일시 장애 → `proposal.analysisError + analysisErrorAt` 마킹.
- 어드민이 `/admin/analysis-failures` 에서 수동 "재시도" 클릭 — [src/features/proposals/actions.ts:204](../src/features/proposals/actions.ts) 의 `retryProposalAnalysis()`.
- 일시 장애의 경우 사람 개입 없이 자동 재시도가 충분.

#### 무엇을 한다

1. `Proposal WHERE analyzedAt IS NULL AND analysisErrorAt IS NOT NULL AND analysisErrorAt < NOW() - 30분` 조회.
2. 각 proposal 에 대해 `retryProposalAnalysis()` 의 코어 로직 호출 (admin 검증 제외 → 함수 분리 필요).
3. 최대 재시도 횟수 추적 — **schema 확장 필요**.

#### Schema 확장 (`Proposal` 모델)

```prisma
model Proposal {
  // 기존 필드 ...

  /// 자동 재시도 횟수. cron 이 증가시키며, 최대 3 회까지.
  /// 어드민 수동 retry 는 카운터를 0 으로 리셋 (admin override).
  retryCount Int @default(0) @map("retry_count")
}
```

마이그레이션 필요 — PR 시 `schema.prisma` 만 변경하고 CI 통과 확인.

#### 그룹별 재시도 정책

`analysisError.group` 에 따라:

| group | 의미 | 자동 재시도? |
|-------|------|-----------|
| `internal_error` | 외부 파이프라인 일시 장애 | ✅ 예 |
| `input_error` | PDF 파싱 실패 등 — 어드민 개입 필요 | ❌ 아니오 |
| `product_id_match` | 외부 카탈로그 매칭 실패 — 카탈로그 수정 후 수동 | ❌ 아니오 |

→ cron 은 `group='internal_error'` 만 자동 재시도.

#### 구현 골격

```ts
// src/features/proposals/actions.ts — 함수 분리
export async function _retryProposalAnalysisCore(proposalId: string) {
  // requireAdminSession() 제외, 본 로직만
  // ...
}

export async function retryProposalAnalysis(proposalId: string) {
  await requireAdminSession();
  return _retryProposalAnalysisCore(proposalId);
}

// src/app/api/cron/retry-failed-analysis/route.ts
import { _retryProposalAnalysisCore } from "@/features/proposals/actions";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const MAX_RETRIES = 3;
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const candidates = await prisma.proposal.findMany({
    where: {
      analyzedAt: null,
      analysisErrorAt: { lt: cutoff },
      retryCount: { lt: MAX_RETRIES },
      // group='internal_error' 만 — Json 필드 path 쿼리
      analysisError: { path: ["group"], equals: "internal_error" },
    },
    select: { id: true },
  });

  for (const { id } of candidates) {
    await prisma.proposal.update({
      where: { id },
      data: { retryCount: { increment: 1 } },
    });
    await _retryProposalAnalysisCore(id);
  }

  return Response.json({ ok: true, retried: candidates.length });
}
```

#### 체크리스트

- [ ] `Proposal.retryCount` schema 추가 + `pnpm db:push` (worktree 한정)
- [ ] `retryProposalAnalysis` 를 `_retryProposalAnalysisCore` 로 분리
- [ ] 어드민 수동 재시도 시 `retryCount = 0` 으로 리셋 (admin override)
- [ ] cron 라우트 추가
- [ ] vercel.json 등록

---

### 3.3 ⏸ 작업 #6: SMS OTP 코드 만료 정리

**상태**: ⏸ 보류 — Redis TTL 자동 만료로 cron 불필요

#### 현재 구현

- 알리고 SMS / LMS 게이트웨이 통합 완료: [src/server/aligo.ts](../src/server/aligo.ts) (`sendOtpSms` + `sendNotificationLms`).
- 가입자 본인인증 OTP 발송: [src/features/requests/actions.ts](../src/features/requests/actions.ts) `sendOtp`.
- 설계사 가입 OTP 발송: [src/app/partner/signup/[token]/actions.ts](../src/app/partner/signup/[token]/actions.ts).
- 코드 저장: Redis 키 `otp:code:{requestId}:{phone}`, TTL = **180초** (`OTP_TTL_SECONDS`). TTL 이 곧 재전송 쿨다운 + 만료.
- `ALIGO_TEST_MODE=Y` 일 때만 코드 `"000000"` 고정 + 알리고 호출 생략 (dev/test 편의).

#### 결론

- Redis 가 TTL 만료 시 키를 자동 삭제하므로 별도 cron 작업 불필요.
- 향후 OTP 를 PostgreSQL (`OtpCode` 테이블 등) 로 영속화할 경우에만 본 작업 재개. 그 때는 `5~15분` 주기로 `expiresAt < NOW()` 행 삭제.

---

## 4. Phase 3 — 선택 (2~3개월)

### 4.1 🟢 작업 #7: 일일 운영 통계 사전 집계

**상태**: ❌ 미구현
**주기**: `0 15 * * *` (UTC 15:00 = KST 자정)

#### 동기

PRD §9 "성공 지표" 중 설계사 제출률, 제안서 도착률 등을 실시간 계산하면 어드민 대시보드 로딩이 느려짐. 일일 배치로 사전 계산.

#### 새 테이블 제안

```prisma
model DailyMetrics {
  date              DateTime @id @db.Date

  newRequests       Int @default(0)
  dispatchedRequests Int @default(0)
  completedRequests Int @default(0)
  rematchedRequests Int @default(0)
  failedRequests    Int @default(0)

  submittedProposals Int @default(0)
  analyzedProposals  Int @default(0)
  failedAnalyses     Int @default(0)

  submissionRate    Float? // 전송된 assignment 대비 submitted 비율
  analysisSuccessRate Float?

  updatedAt DateTime @updatedAt @db.Timestamptz(6)

  @@map("daily_metrics")
  @@schema("claim")
}
```

#### 무엇을 한다

어제 00:00~24:00 (KST) 데이터 집계 후 `upsert`. 멱등 — 같은 날짜 재실행 시 덮어쓰기.

---

### 4.2 🟢 작업 #8: 설계사 선택 카운트 리셋

**상태**: ❌ 미구현
**주기**: 매주 일요일 자정 OR 매월 1일

#### 동기

- PRD §5.2: "누적 선택 횟수 적은 순 — 형평성 핵심".
- 시간이 흐르면 누적이 커져 한 번 선택을 받은 설계사가 영구히 뒤로 밀림.
- 정책 결정 필요: 주간 / 월간 / 분기.

#### 무엇을 한다

```ts
await prisma.partnerMatchStats.updateMany({
  data: { selectedCount: 0 },
});
```

**주의**: 선택 카운트는 매칭 알고리즘 ([src/features/partners/queries.ts](../src/features/partners/queries.ts)) 의 핵심 — 운영 정책 검토 후 시행. 단순 리셋 대신 "decay" (예: 매주 50% 감산) 가 더 적절할 수도 있음. `exposureCount` 는 운영 지표로 누적 유지 (리셋 대상 아님).

---

### 4.3 🟢 작업 #9: 오래된 데이터 아카이빙

**상태**: ❌ 미구현
**주기**: 월 1회

#### 동기

- 개인정보 보존 정책 (PIPA 등).
- 운영 DB 크기 관리.

#### 무엇을 한다

- 6개월 이상 경과한 `status='ended'` 요청을 S3 / BigQuery 로 export.
- 원본 행 hard delete.

#### 의존성

- 외부 데이터 웨어하우스 결정.
- 법무팀 보존 기간 정책 합의.

---

## 5. 구현 순서 권장

```
Phase 1 (1~2주)
  ├─ 2.1 작업 #1 + state-transition 함수 추출       ← 가장 시급
  ├─ 2.2 작업 #2 (resultToken 만료)
  └─ 2.3 작업 #3 (invitation 정리)

Phase 2 (1개월 후)
  ├─ 3.1 작업 #4 (자동 재매칭) — LMS 알림 인프라 이미 존재
  └─ 3.2 작업 #5 (분석 재시도)

Phase 3 (필요 시)
  └─ 작업 #7~#9
```

---

## 6. 운영 체크리스트

### 6.1 배포 전 점검

- [ ] `CRON_SECRET` env 등록 (Vercel + GitHub Actions secret 미적용 시 prod 만)
- [ ] `vercel.json` schedule 검증 (cron syntax)
- [ ] 각 job 로컬 수동 호출 테스트: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/<job>`
- [ ] 멱등성 확인 — 같은 job 2번 호출해도 결과 동일한지
- [ ] revalidatePath 확인 — 어드민 화면이 갱신되는지

### 6.2 배포 후 모니터링

- [ ] Vercel Dashboard → Cron 로그 1주 관찰
- [ ] 처리 row count 가 비정상적으로 크거나 0 인 경우 alert
- [ ] 실패 시 알림 채널 (현재 Slack 채널 미정)

### 6.3 알려진 위험

- **Vercel Hobby 플랜**: cron 호출 1일 2회 제한 → MVP 가 Hobby 면 작업 #1 (5분 주기) 부적합. **Pro 플랜 필수**.
- **maxDuration**: Vercel 함수 60초 제한 (Hobby) / 300초 (Pro). 한 회차 처리량이 많아지면 페이지네이션 필요.
- **DB connection pool**: 모든 cron 이 동시 실행될 때 Supavisor pooler 한도 (기본 200) 내인지 확인.

---

## 7. 진행 로그

날짜 / 작업 / 변경 내용 / 담당.

| 날짜 | 작업 | 변경 | 담당 |
|------|------|------|------|
| 2026-05-19 | 문서 | 초안 작성 | - |
| 2026-05-20 | #6 | OTP 는 알리고 + Redis TTL 로 이미 구현 — cron 불필요로 보류 처리 | - |
