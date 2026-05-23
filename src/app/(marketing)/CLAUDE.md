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
      └─ v3/index.tsx                # **현재 단독 운영** — 1뷰포트 정적 랜딩 + 정체성 인용구 + 단일 CTA + AI 비교 더 알아보기 링크
```

### `/demo` 라우트 (A/B 우회)

`v3` 의 "AI 비교 더 알아보기 →" 링크는 별도 `(marketing)/demo/page.tsx` 로 보낸다. 이
라우트는:
- `resolveLpVariant` 우회 → Redis 카운터 / 쿠키 / PostHog `lp_exposure` 미발화
- `VariantV1` 컴포넌트 직접 렌더 — 광고 변형 풀에서는 비활성이지만 디렉토리/
  컴포넌트는 보존되어 import 가능
- 광고 conversion 픽셀은 `(marketing)/layout.tsx` 가 책임이라 그대로 발화

v3 광고 클릭 → v3 의 "AI 비교 더 알아보기" → `/demo` 흐름은 모두 v3 의 단일 `lp_variant`
super-property 로 측정됨 (실험 모집단 통계 안 섞임).

> **v1 / v2 비활성 중, v3 단독 운영** — `VARIANT_IDS = ["v3"]` 으로 v1 / v2 가
> dispatcher 에서 빠져 있다. 디렉토리/컴포넌트는 보존. 재활성 절차는
> [src/lib/lp-variant.ts](../../lib/lp-variant.ts) 의 `VARIANT_IDS` 코멘트 참조.

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

`?_lp=v3` 쿼리로 쿠키 무시 + 변형 강제. 쿠키 안 박고 PostHog exposure 도 안 발화
(실험 모집단 격리). 스테이크홀더에게 변형 보여줄 때 사용.

### `cacheComponents` 충돌

`page.tsx` 가 `cookies()` / `searchParams` / Redis 호출로 dynamic 강제됨. loading.tsx
필수 (없으면 빌드 실패). FCP 문제 생기면 page 안에서 `<Suspense fallback={<DefaultHero />}>`
로 변형 결정 서브트리만 감싸고 정적 섹션은 즉시 렌더하는 구조로 격상 가능.
