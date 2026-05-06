# (marketing)/ — 비인증 영역

## 위치 결정

이 그룹에 페이지를 추가하는 경우:
- **누구나 (로그인 없이) 볼 수 있어야 함.**
- 예: 랜딩, 설계사 둘러보기, 설계사 상세, 약관/FAQ, 블로그.

로그인 후 사용자별 데이터를 보여주는 페이지면 → `(app)/`로.

## 캐싱 전략

비인증 페이지는 사용자별 분기가 없으므로 **`'use cache'` 적극 활용 가능**:

```ts
export async function listFeaturedAgents() {
  'use cache'
  cacheTag('agents-featured')
  cacheLife('hours')
  return db.agents.findFeatured()
}
```

설계사 데이터가 바뀔 때 admin 액션에서 `revalidateTag('agents-featured', 'minutes')`.

## 인증이 필요한 인터랙션

이 그룹의 페이지에서 인증이 필요한 액션(예: 제안 요청)은:
- 페이지 자체는 비인증으로 보여줌.
- Server Action 안에서 `requireSession()` 호출 — 비로그인 사용자는 자동으로 `/login` redirect.

상세 페이지 → 폼 → 액션 → 인증 체크 패턴. [agents/[id]/page.tsx](agents/[id]/page.tsx) 참조.

## 레이아웃

[layout.tsx](layout.tsx)가 마케팅용 nav를 제공. (app)과 다른 chrome — 로그인 버튼/CTA 등 추가 시 여기.
