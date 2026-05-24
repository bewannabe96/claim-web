# (marketing)/ — 비인증 영역

## 위치 결정

이 그룹에 페이지를 추가하는 경우:
- **누구나 (로그인 없이) 볼 수 있어야 함.**
- 예: 랜딩, 설계사 둘러보기, 설계사 상세, 약관/FAQ, 블로그.

로그인 후 사용자별 데이터를 보여주는 페이지면 → `(app)/`로.

## 캐싱 전략

비인증 페이지는 사용자별 분기가 없으므로 **`'use cache'` 적극 활용 가능**:

```ts
export async function listFeaturedPartners() {
  'use cache'
  cacheTag('partners-featured')
  cacheLife('hours')
  return db.partners.findFeatured()
}
```

설계사 데이터가 바뀔 때 admin 액션에서 `revalidateTag('partners-featured', 'minutes')`.

## 인증이 필요한 인터랙션

이 그룹의 페이지에서 인증이 필요한 액션(예: 제안 요청)은:
- 페이지 자체는 비인증으로 보여줌.
- Server Action 안에서 `requireSession()` 호출 — 비로그인 사용자는 자동으로 `/login` redirect.

상세 페이지 → 폼 → 액션 → 인증 체크 패턴. [partners/[id]/page.tsx](partners/[id]/page.tsx) 참조.

## 레이아웃

[layout.tsx](layout.tsx)가 마케팅용 nav를 제공. (app)과 다른 chrome — 로그인 버튼/CTA 등 추가 시 여기.

## 랜딩 변형 (A/B)

`/` 는 같은 URL 에서 서버가 device 마다 변형을 라운드로빈으로 배정한다 — Redis
INCR + 쿠키 sticky. 성과는 PostHog 의 `lp_variant` super-property + `lp_exposure`
이벤트로 측정. 전체 흐름:

- 변형 ID / epoch / 쿠키 이름 상수: [src/lib/lp-variant.ts](../../lib/lp-variant.ts)
- 서버측 배정 (Redis INCR + 봇 가드 + fallback): [src/server/lp-variant.ts](../../server/lp-variant.ts)
- PostHog 등록 helper: `registerLpVariant()` in [src/lib/analytics.ts](../../lib/analytics.ts)
- 측정 인벤토리: [src/components/analytics/CLAUDE.md](../../components/analytics/CLAUDE.md)

### 디렉토리 구조

```
(marketing)/
├─ page.tsx                          # dispatcher (slim) — resolve + cookie set + exposure
├─ loading.tsx                       # cookies() 호출로 dynamic 강제 시 fallback
├─ demo/page.tsx                     # `/demo` — v3 "AI 비교 더 알아보기" 진입, VariantV1 직접 렌더 (A/B 우회)
├─ _lib/
│  ├─ demo-proposals.ts              # v1 데모 데이터
│  └─ google-ads.ts                  # `buildGoogleAdsConversionTarget()` — root/demo 공용
└─ _components/
   ├─ landing-variant.tsx            # server. variant prop → variants/<id> 분기
   ├─ cookie-setter.tsx              # client leaf. document.cookie write (justAssigned 만)
   ├─ exposure-beacon.tsx            # client leaf. registerLpVariant() 호출
   └─ variants/
      ├─ v1/index.tsx                # (현재 비활성 in dispatcher) 인터랙티브 데모 랜딩 (스크롤) — `/demo` 에서 재사용
      ├─ v2/index.tsx                # (현재 비활성) a8fc490 이전의 정적 narrative 랜딩
      ├─ v3/index.tsx                # (현재 비활성) 1뷰포트 정적 랜딩 + 단일 CTA + AI 비교 더 알아보기 링크
      └─ v4/                         # **현재 단독 운영** — 챗봇 풀스크린. 같은 화면에서 Step1 → 자동 후보 배정 → Step3 본인인증 → dispatched 까지 페이지 전환 0 회
         ├─ index.tsx                #   server. listPriceTiers prefetch + ChatbotShell 렌더
         ├─ chatbot-shell.tsx        #   client. 풀스크린 [헤더 + 메시지 로그 + 하단 슬롯] + ChatState + Phase 1/3 server action 호출
         ├─ messages/                #   bot/user/typing/system-loading 버블
         └─ prompts/                 #   phase 별 입력 위젯 + prompt-slot dispatcher
```

### `/demo` 라우트 (A/B 우회)

`(marketing)/demo/page.tsx` 는 `VariantV1` 을 직접 렌더해 인터랙티브 스크롤
데모를 보여주는 우회 라우트:
- `resolveLpVariant` 우회 → Redis 카운터 / 쿠키 / PostHog `lp_exposure` 미발화
- 광고 conversion 픽셀은 `(marketing)/layout.tsx` 가 책임이라 그대로 발화
- 과거 v3 의 "AI 비교 더 알아보기" 링크 진입점이었음. 현재 v4 단독 운영
  중이라 일반 사용자 도달 경로는 없지만 라우트는 보존 (스테이크홀더 데모 URL).

> **v1 / v2 / v3 비활성 중, v4 단독 운영** — `VARIANT_IDS = ["v4"]` 로 다른 셋이
> dispatcher 에서 빠져 있다. 모든 디렉토리/컴포넌트는 보존. 재활성 절차는
> [src/lib/lp-variant.ts](../../lib/lp-variant.ts) 의 `VARIANT_IDS` 코멘트 참조.

### v4 챗봇 — 짚고 갈 동작

- **페이지 전환 0** — `submitStep1` / `autoSelectAndAdvance` / `sendOtp` / `finalizeRequest`
  를 모두 client 의 server action 호출로 처리. finalizeRequest 의 redirect 만
  유일한 navigation (→ `/plan-request/{id}/dispatched`).
- **후보 자동 배정** — `features/plan-requests/actions.ts` 의 `autoSelectAndAdvance`
  가 `pickAssignedPartners` (FNV-1a 결정성) 로 selectLimit 명 선택 후
  `persistStep2Selection` 으로 status='confirming' 까지 진행. candidates URL
  의 자동 skip 로직과 같은 helper 를 공유해 같은 partner 셋이 선택됨.
- **consent** — `consentThirdParty="off"` 항상 전송 (사용자에게 묻지 않음, DB 에
  false 저장). `consentMessaging="on"` 은 Q10 chip 선택 시에만 도달. develop
  e282c16 / f58f0d4 가 깔아둔 schema 완화 + partner 화면 phone gate 와 정합.
- **PII** — 모든 자유텍스트 input + user bubble 통째로 `NO_TRACK_CLASS`.

### 새 변형 추가

1. [src/lib/lp-variant.ts](../../lib/lp-variant.ts) 의 `VARIANT_IDS` 에 id 추가 (예: `"v4"`)
2. `_components/variants/v4/index.tsx` 작성 — `VariantV4({ googleAdsConversionTarget })` 동일 시그니처 export
3. [landing-variant.tsx](_components/landing-variant.tsx) 의 switch 에 case 추가 — exhaustive 체크가 누락 잡음

변형 간 컴포넌트 공유: 한 쪽 변형이 다른 변형 디렉토리에서 import 하지 말 것 (변형
삭제 시 의존성 폭발). 공유가 진짜 필요해지면 `_components/shared/` 로 승격.

### 실험 리셋

랜딩 실험 자체를 갈아끼울 때 (변형 셋 재정의 / 카운터 리셋):
[src/lib/lp-variant.ts](../../lib/lp-variant.ts) 의 `EXPERIMENT_EPOCH` 올림 (`e1` → `e2`).
Redis 카운터 키 / 쿠키 이름이 자동으로 바뀌어 옛 데이터가 새 실험에 안 섞임.

### QA / 데모 강제 변형

`?_lp=v4` 쿼리로 쿠키 무시 + 변형 강제. 쿠키 안 박고 PostHog exposure 도 안 발화
(실험 모집단 격리). 스테이크홀더에게 변형 보여줄 때 사용. 비활성 변형 (v1/v2/v3)
은 `isValidVariant` 가 false 처리해 강제 진입 불가 — 일시적으로 보고 싶으면
`VARIANT_IDS` 에 다시 추가했다가 되돌릴 것.

### `cacheComponents` 충돌

`page.tsx` 가 `cookies()` / `searchParams` / Redis 호출로 dynamic 강제됨. loading.tsx
필수 (없으면 빌드 실패). FCP 문제 생기면 page 안에서 `<Suspense fallback={<DefaultHero />}>`
로 변형 결정 서브트리만 감싸고 정적 섹션은 즉시 렌더하는 구조로 격상 가능.
