# components/analytics/ — 분석 격리 경계

## 절대 규칙

**이 디렉토리만 `posthog-js` 를 import 한다.** features/, app/ 라우트 코드,
다른 컴포넌트에서 SDK 를 직접 import 하지 말 것. 도메인 로직과 분석이
뒤엉키기 시작하는 출발점이므로 PR 에서 차단.

도메인 코드가 분석에 닿아야 할 때는 [src/lib/analytics.ts](../../lib/analytics.ts)
의 `track()` 만 사용 — 그 파일은 `window.posthog` 만 보고 SDK 를 import 하지
않아 features 모듈에 번들이 끌려 들어가지 않는다.

PII 가 닿는 element 는 [no-track.tsx](no-track.tsx) 의 `NO_TRACK_CLASS` /
`<NoTrack>` 으로 제외 — PostHog 의 `ph-no-capture` class 이름은 이 파일에만
존재. PR 리뷰에서 features/ 에 `ph-no-capture` 또는 `data-ph-*` 가 보이면 reject.

## 책임 분담

| 파일 | 책임 |
|---|---|
| `posthog-bootstrap.tsx` | Server. env (`POSTHOG_KEY`, `POSTHOG_HOST`, `ENV_STAGE`) 읽어 client 에 prop 전달. 키 없으면 null 반환. |
| `posthog-client.tsx` | Client. `posthog.init()` + pathname 변화에 맞춰 `$pageview` 수동 firing + `env` super-property 등록 + first-touch 광고 click ID 등록. |
| `no-track.tsx` | PII 마스킹 도메인-중립 도구 (`NO_TRACK_CLASS` 상수 + `<NoTrack>` wrapper). |
| `attribution.ts` | 광고 플랫폼 click ID 추출 순수 함수 (URL → `initial_*` 객체). |

## 어디에 mount 되어 있나

- [src/app/(marketing)/layout.tsx](../../app/(marketing)/layout.tsx) — 랜딩 +
  `/plan-request/*` 전 흐름.
- [src/app/partner/layout.tsx](../../app/partner/layout.tsx) — 설계사 가입 +
  대시보드 전 흐름.
- **`admin/layout.tsx` 미적용** — operator 행동은 의도적으로 추적 제외.

## 로깅 이벤트 인벤토리

현재 SDK 설정에서 실제로 PostHog 로 전송되는 모든 이벤트 — 이 표가 단일 진실
공급원이다. 새 이벤트 추가/제거 시 여기 동기화.

### 자동 발화 이벤트 (4종)

| 이벤트 | 트리거 | 발화 위치 | 주요 property |
|---|---|---|---|
| `$pageview` | 수동 — pathname / searchParams 변화 | [PageviewTracker](posthog-client.tsx) effect | `$current_url` (query 포함), `$pathname` |
| `$pageleave` | SDK 자동 — `beforeunload` 이벤트 | `capture_pageleave: true` | 이탈 시점의 `$current_url` |
| `$autocapture` | SDK 자동 — 모든 click / submit / change | `autocapture: true` | `$event_type`, `$elements_chain` (DOM 경로 + 텍스트, `ph-no-capture` 자식 제외) |
| `$snapshot` (session replay) | SDK 자동 — rrweb DOM 스냅샷 + 마우스/스크롤/입력 이벤트 | `disable_session_recording: false` | 페이로드는 rrweb 이벤트 배열. `ph-no-capture` 자손 element 는 검은 박스, 모든 `<input>` 값은 별표. PostHog UI 의 "Replays" 탭에서 재생. |

### 모든 이벤트에 자동 부착되는 속성

**프로젝트 super-property (`posthog.register`)**:
- `env` — `production` / `staging` / `preview` / `development` / `unknown` (`ENV_STAGE` env 값. 비면 `"unknown"` 으로 박혀 운영 누락 표면화)
- `lp_variant` — 현재 device 가 배정된 랜딩 변형 ID (예: `v1`). `<ExposureBeacon />`
  ([src/app/(marketing)/_components/exposure-beacon.tsx](../../app/(marketing)/_components/exposure-beacon.tsx)) 가
  page 마운트 시 등록. **첫 방문의 첫 `$pageview` 한 건만 누락 가능** —
  useEffect 실행 순서가 `PageviewTracker (capture queued)` → `posthog.init() (큐 flush)`
  → `ExposureBeacon (register)` 라, init 직후 flush 된 첫 pageview 에는 `lp_variant`
  super-property 가 아직 안 박혀 있을 수 있다. 후속 모든 이벤트엔 정상 첨부.
  `lp_exposure` 이벤트가 funnel 분모 역할이고 그 이벤트 자체엔 `lp_variant` 가
  props 로 직접 박혀 있으므로 측정엔 영향 없음. 변형 결정 흐름은 [src/server/lp-variant.ts](../../server/lp-variant.ts).

**광고 attribution super-property (first-touch, `register_once`)** — 자세한 건
아래 "광고 유입 attribution" 섹션. device cookie 가 살아있는 한 (기본 365일)
모든 이벤트에 자동 첨부:
- `initial_gclid`, `initial_gbraid`, `initial_wbraid` (Google Ads)
- `initial_fbclid` (Meta)
- `initial_n_ad`, `initial_n_query`, `initial_n_keyword`, `initial_n_rank`, `initial_n_campaign_type` (네이버 검색광고)
- `initial_lp_variant` — first-touch 랜딩 변형. 쿠키 만료/재배정 후에도 "어느 변형이
  이 device 를 데려왔나" 보존. `lp_variant` (overwrite) 과 짝.

**SDK 가 first-touch 로 자동 첨부 (`$initial_*`)**:
- `$initial_referrer`, `$initial_referring_domain`
- `$initial_utm_source`, `$initial_utm_medium`, `$initial_utm_campaign`, `$initial_utm_term`, `$initial_utm_content`
- `$initial_current_url`, `$initial_pathname` (랜딩 페이지)
- `$initial_browser`, `$initial_os`, `$initial_device_type`

**SDK 자동 attached** (이벤트마다 현재 값):
- `$browser`, `$browser_version`, `$os`, `$device_type` (Mobile/Desktop/Tablet)
- `$referrer`, `$referring_domain`
- `$current_url`, `$host`, `$pathname`
- `$screen_height`, `$screen_width`, `$viewport_height`, `$viewport_width`
- `$lib`, `$lib_version` (posthog-js 버전)
- `$device_id` (cookie 기반, 익명 식별자)
- `$session_id` (30분 idle 시 회전)
- 서버 측 첨부: `$ip`, `$geoip_*` (city / country / timezone — PostHog 서버가 도착 IP 로 유추)

### 커스텀 이벤트

| 이벤트 | 호출 위치 | property | 의미 |
|---|---|---|---|
| `lp_exposure` | [`<ExposureBeacon />`](../../app/(marketing)/_components/exposure-beacon.tsx) — page 첫 마운트, `justAssigned=true` 일 때만 1회 | `lp_variant` | 가입자 device 에 랜딩 변형이 처음 노출됨. A/B funnel 의 분모 (denominator). 매 페이지뷰가 아니라 **device 당 1회**. 변형 결정 흐름: [src/server/lp-variant.ts](../../server/lp-variant.ts) |

추후 추가 시 [src/lib/analytics.ts](../../lib/analytics.ts) 의 규약 (`snake_case`,
도메인 prefix) 을 따르고 이 표에 한 줄 추가.

### 의도적으로 로깅 안 되는 것

| 항목 | 차단 메커니즘 |
|---|---|
| `/admin/*` 전 영역 | `admin/layout.tsx` 에 `PosthogBootstrap` 미mount |
| `POSTHOG_KEY` 비어있는 환경 (dev 기본) | Bootstrap 이 null 반환 → SDK 번들 자체가 페이지에 포함 X |
| Heatmaps (클릭 좌표 누적) | SDK 기본 off, `enable_heatmaps` 미설정 |
| Person profile (MTU 소비) | `person_profiles: 'identified_only'` + `identify()` 미호출 → 모든 이벤트 anonymous |
| `<input type=password/email>` 값 | autocapture + replay 기본 마스킹 |
| `<input type=text/tel/hidden>` 값 (autocapture) | autocapture 가 value 미캡처 (form name/type 만) |
| 모든 `<input>` 값 (session replay) | `session_recording.maskAllInputs: true` → 별표 마스킹 |
| PII element 의 text + attribute + replay 시각화 | `NO_TRACK_CLASS` / `<NoTrack>` (PostHog 기본 `blockClass` 와 일치 — autocapture 제외 + replay 검은 박스) (아래 audit 표) |
| 결제 흐름 전체 (`/partner/credits/topup/*`) | `<main>` 자체에 `NO_TRACK_CLASS` — replay 가 페이지 전체를 검은 박스로 처리 |

## 광고 유입 attribution (first-touch)

광고 → 랜딩 → 페이지 내 이동 → conversion 동안 "어디서 왔는지" 를 잃지 않도록
하는 메커니즘. 세 가지 데이터 소스가 있고, 처리 주체가 다르다.

| 데이터 | 처리 주체 | 저장 위치 |
|---|---|---|
| UTM (`utm_source` / `utm_medium` / `utm_campaign` / `utm_term` / `utm_content`) | SDK 자동 | `$initial_utm_*` super-property |
| Referrer (`document.referrer`) | SDK 자동 | `$initial_referrer`, `$initial_referring_domain` |
| 광고 플랫폼 click ID (`gclid` / `fbclid` / `n_ad` 등) | **우리 코드** | `initial_*` super-property |

UTM 과 referrer 는 PostHog SDK 가 `$initial_*` super-property 로 알아서 device
cookie 에 박는다 (anonymous 도 동작 — `person_profiles: 'identified_only'` 와 무관).
**우리가 따로 코드 안 짬.**

광고 click ID 는 SDK 가 안 잡아주므로 [PageviewTracker](posthog-client.tsx) 가
매 pageview 마다 [attribution.ts](attribution.ts) 의 `extractAdClickIds()` 를
호출 → 값이 있으면 `posthog.register_once(...)` 로 device 에 first-touch 저장.
`register_once` 는 이미 있는 키를 덮어쓰지 않아 first-touch 정책이 자동 보장.

### 지원 플랫폼

| 플랫폼 | 캡처 파라미터 | 비고 |
|---|---|---|
| Google Ads | `gclid`, `gbraid`, `wbraid` | gclid 가 메인. gbraid/wbraid 는 iOS 14+ ITP 환경의 대체 — 셋 다 캡처해야 누수 없음. auto-tagging 켜져 있어야 자동 부착. |
| Meta (FB/IG) | `fbclid` | |
| 네이버 SA | `n_ad`, `n_query`, `n_keyword`, `n_rank`, `n_campaign_type` | 네이버 검색광고 자동 추적 URL 에 박혀 들어옴. |

다른 플랫폼 (Microsoft Ads `msclkid`, TikTok `ttclid`, Kakao 등) 추가 시
[attribution.ts](attribution.ts) 의 `CLICK_ID_PARAMS` 배열에 한 줄 추가 + 위
표 갱신.

### 운영 측 — UTM 규약

광고 set 마다 랜딩 URL 에 UTM 통일 — 안 그러면 PostHog 에서 데이터가 너저분.
다음을 표준으로:

```
utm_source   = google_ads | meta | naver_sa | kakao_moment | newsletter | partner_referral
utm_medium   = cpc | cpm | display | retargeting | email | social_organic
utm_campaign = q2_launch | brand_keyword | longtail_pain_points  (마케팅 캠페인 ID)
utm_content  = ad_creative_v1 | ad_creative_v2                  (A/B 변형 식별)
utm_term     = (검색광고 키워드 — 네이버는 n_keyword 가 더 정확)
```

광고 set 만들 때마다 마케팅이 위 규약대로 final URL 박기. Google Ads 의
auto-tagging 은 gclid 만 부착하고 UTM 은 따로 입력 필요.

### 분석에서 활용

PostHog UI 의 funnel / insight 만들 때 `breakdown by initial_utm_source` 또는
`breakdown by $initial_utm_campaign` 으로 "이 conversion 의 유입 채널" 을
즉시 분리 가능. 광고 click ID 는 raw 값이라 platform별로 grouping (예:
`initial_gclid is set` → "Google 광고 유입") 으로 segment 정의.

### last-touch 필요해지면

retargeting 캠페인 효과 측정에 last-touch 가 필요해지면 [posthog-client.tsx](posthog-client.tsx)
에서 `register` (덮어쓰기) 로 두 번째 set 을 병행 등록 — 예: `last_gclid`,
`last_utm_source`. first 와 last 둘 다 부착되어 PostHog UI 에서 양쪽 분석 가능.
MVP 는 first-touch 만으로 충분.

## 추적 이벤트 추가하는 법

### 1. 아무것도 안 함 (대부분의 경우)

autocapture 가 모든 button / link / form 의 click·submit·change 를 자동
캡처한다. 일반적인 UI 변경엔 별도 작업 불필요. PostHog UI 의 "Toolbar" 로
실제 DOM 을 클릭해 funnel step element 를 시각적으로 정의.

### 2. `track()` 호출

DOM 이벤트로 표현 못 하는 시점 (server action 성공 후, async 완료, multi-step
진입 등):

```tsx
import { track } from "@/lib/analytics";

const result = await submitPlanRequest(...);
if (result.ok) {
  track("plan_request_submitted", { price_tier: result.tier });
  router.push(...);
}
```

이 호출은 SDK 를 import 하지 않는다 (`lib/analytics.ts` 가 `window.posthog`
만 봄) — 그게 이 경계의 핵심.

호출처가 늘면 위 "커스텀 이벤트" 표에 한 줄씩 동기화. 그래야 분석 담당이
이름·property 를 추측 안 한다.

## PII 보호 (보험 도메인 필수)

PostHog autocapture 는 일부 input (`type=password/email`) 을 자동 마스킹하지만,
**button/link text + element attribute 는 그대로 캡처**한다. PII 가 닿는
element 는 `NO_TRACK_CLASS` 또는 `<NoTrack>` 으로 명시 제외.

```tsx
import { NO_TRACK_CLASS, NoTrack } from "@/components/analytics/no-track";

// 단일 input — className 으로 합성
<Input className={cn("text-base", NO_TRACK_CLASS)} name="phone" />

// 여러 element 가 PII 묶음일 때 — wrapper
<NoTrack>
  <h3>{customer.name}</h3>
  <p>{customer.phone}</p>
</NoTrack>
```

`<NoTrack>` 은 `<div>` 한 겹을 추가하므로 `<section>`/`<header>` 같은
semantic 태그를 유지해야 하면 className 방식 (`NO_TRACK_CLASS`) 을 사용.

### Audit 결과 (2026-05-23 적용 완료)

| 영역 | 파일 | 적용 항목 |
|---|---|---|
| 가입자 본인확인 | `app/(marketing)/plan-request/[id]/confirm/_components/confirm-wizard.tsx` | 실명 / RRN 앞·뒤 / 휴대폰 / OTP `<Input>` + RequestSummary 섹션 (직업·병력 개수·추가요청) |
| 가입자 요청서 | `app/(marketing)/plan-request/new/_components/step1-wizard.tsx` | 직업 `<Input>` + 추가요청 `<textarea>` + MedicalEntryCard 전체 (진단명·치료시작일·입원일수·외래횟수·수술 chip) |
| 가입자 결과 | `app/(marketing)/plan-request/result/[token]/_components/result-view.tsx` | PartnerNoteBubble 호출지점 wrap + attribution 섹션 (파트너명·경력·trustMetric·avatar) + 하단 CTA button 안 파트너명 span (button click 자체는 추적 유지) |
| 파트너 본인인증 | `app/partner/signup/[token]/verify/_components/verify-form.tsx` | 실명 / 휴대폰 readonly `<Input>` + OTP `<Input>` |
| 파트너 제안 | `app/partner/plan-request-assignments/[token]/_components/proposal-form.tsx` | 헤더 파트너명 span + CustomerContext 섹션 (이름·생년월일·성별·직업·휴대폰·병력·고객 추가요청) + 한줄 요약 `<textarea>` |

**confirm-wizard 의 hidden field 는 의도적으로 마스킹 안 함** — autocapture
기본이 `type=text/tel/hidden` 의 value 를 캡처하지 않고 (form name/type 만
첨부), session replay 도 `maskAllInputs: true` 로 모든 input value 를 별표
처리. leak risk 없음.

PII 가 새로 추가되는 화면은 위 audit 표에 한 줄 추가 + 적용. 새 input 만들 때
`name` 이 `phone` / `name` / `birth*` / `rrn*` / `code` 면 자동 의심 대상.

### Session replay (활성, 2026-05-23~)

- 활성 옵션은 [posthog-client.tsx](posthog-client.tsx) 의 `session_recording`
  블록 — `maskAllInputs: true`, `blockClass: "ph-no-capture"` (default 명시).
- 결제 페이지 (`partner/(dashboard)/credits/topup/*`) 는 `topup/page.tsx` 와
  `result/_components/result-shell.tsx` 의 `<main>` 자체에 `NO_TRACK_CLASS` —
  PG 응답 메시지 / 결제 요약 / 에러 코드까지 검은 박스 처리.
- PostHog free plan 의 5K replay/월 + 1개월 보관 한도는 운영 측에서 모니터링.
  한도 초과 임박 시 PostHog UI 의 "Sampling" 으로 sample rate 낮추기 (예 50%).
- last-touch attribution 같은 후속 작업과 무관 — 분석 표면만 추가됨.

## 환경 분리 (2중 방어)

`POSTHOG_KEY` 가 비어 있으면 부트스트랩이 null 을 반환 → posthog-js 번들이
페이지에 포함되지 않는다. dev 머신은 비워두는 게 기본 (운영 데이터 오염
방지). 본인 PostHog 프로젝트로 dev 추적을 보고 싶으면 `.env.local` 에만
키를 박을 것.

**1차 방어 — 키 분리**: prod / staging / preview 별로 다른 `POSTHOG_KEY` 박기
(Vercel per-environment env 또는 PostHog "environments" 기능). 데이터 자체가
물리적으로 안 섞임.

**2차 방어 — `env` super-property 자동 부착**: 부트스트랩이 `ENV_STAGE` 를
모든 이벤트의 super-property 로 등록 (`posthog.register({ env })`). 운영 실수로
같은 키가 양쪽에 박혀도 PostHog UI 의 property filter (`env = "production"`)
로 분리해서 볼 수 있다. `ENV_STAGE` 미설정 시 `env=unknown` 으로 박혀 누락이
즉시 보임 (조용한 fallback 금지).

둘 다 적용 권장 — 1차만 의존하면 누가 prod 키를 staging Vercel project 에
잘못 박는 순간 분석 데이터가 오염되고 되돌릴 방법이 없다.
