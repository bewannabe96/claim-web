# (marketing)/ — 비인증 영역

## 위치 결정

이 그룹에 들어가는 페이지:
- **계정/세션 없이 접근 가능해야 함.**
- 현재 들어 있는 흐름:
  - 랜딩 (`page.tsx`)
  - 가입자 요청 wizard (`request/new`, `request/[id]/{candidates,confirm,dispatched}`) — 계정 없이 `request.id` (nanoid) 로 단계 진행
  - 결과 페이지 (`result/[token]`) — 알림톡 일회용 토큰 진입

운영자 / 설계사 페이지는 이 그룹에 두지 말 것 — `admin/`, `partner/` 최상위 폴더 사용.

## 캐싱 전략

진짜 사용자별 분기가 없는 랜딩/공개 페이지에 한해 `'use cache'` 활용. 가입자 요청 흐름은 `request.id` 별 동적이라 캐시 대상 아님.

```ts
export async function listFeaturedPartners() {
  'use cache'
  cacheTag('partners-featured')
  cacheLife('hours')
  return db.partners.findFeatured()
}
```

설계사 데이터가 바뀔 때 admin 액션에서 `revalidateTag('partners-featured', 'minutes')`.

## 권한 모델 (가입자는 계정 없음)

가입자는 계정/세션이 없다. 권한 boundary 는 두 가지로만:

1. **`request.id` (16자 nanoid, ~96 bit)** — wizard 단계 진입 토큰. 액션 진입부에서 `status` (`selecting`/`confirming`/`dispatched`) 검증으로 단계 우회 차단.
2. **`result.resultToken` (32자, 192 bit)** — 결과 페이지 진입 토큰. 알림톡으로만 발급.

DAL 호출 없음 — Server Action 안에서 token/id → row 조회 + status 검증이 권한 판정의 단일 진입점. 패턴은 [features/requests/actions.ts](../../features/requests/actions.ts), [features/proposals/actions.ts](../../features/proposals/actions.ts) 참조.

> ⚠️ `request.id` 는 nanoid 추측이 비현실적이라는 가정에 의존 — referer/스크린샷으로 leak 되면 status='selecting' 윈도우에서 제3자가 후보 선택 덮어쓰기 가능. 운영 전 ownership cookie 도입 검토.

## 레이아웃

[layout.tsx](layout.tsx)가 가입자용 480px 컨테이너 + 브랜드 헤더를 제공. admin/partner 와 다른 chrome.
