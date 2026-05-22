# features/notifications/ — 어드민 알림

도메인 이벤트(요청 송부 등) 발생 시 `admin_notification` row 를 쌓고, 어드민
대시보드 클라이언트가 폴링으로 읽어 **브라우저 알림(Notification API)** + 헤더 벨
배지로 표시한다. 알림톡/SMS 같은 외부 발송 채널과는 무관 — in-app/브라우저 전용.

백그라운드 푸시(Service Worker/VAPID)는 미도입 — **어드민 탭이 열려 있을 때만**
동작한다. 운영자가 대시보드를 띄워두는 전제의 모니터링 보조 기능.

## 파일

- `schema.ts` — `ADMIN_NOTIFICATION_TYPES` (유형 레지스트리) + zod 입력 스키마 +
  직렬화 타입. 클라/서버 공유.
- `emit.ts` — `emitAdminNotification()`. **`'server-only'`, `'use server'` 아님** —
  서버 내부 호출 전용 헬퍼. **절대 throw 안 함**: 알림 실패가 호출부(요청 송부
  트랜잭션 등)의 성공을 뒤집으면 안 되므로 실패는 로그만 남기고 흡수한다.
- `queries.ts` — `'server-only'` 읽기. 폴링/배지용.
- `actions.ts` — `'use server'`. `pollAdminNotifications` (클라 폴링),
  `getRecentAdminNotifications` (드롭다운 목록), `markAdminNotificationsRead`.
  모두 첫 줄 `requireAdminSession()` 가드 필수.

## 새 알림 유형 추가

1. `schema.ts` 의 `ADMIN_NOTIFICATION_TYPES` 에 `"<도메인>.<이벤트>"` 추가.
2. 이벤트 발생부(보통 `features/<x>/actions.ts`)에서 한 줄:
   `await emitAdminNotification({ type, title, body, linkPath?, entityId? })`.

`title`/`body` 는 emit 시점에 완성 문구로 저장된다 — 폴링/표시 코드는 유형을
몰라도 되며, 테이블 / 폴링 액션 / `NotificationBell` 컴포넌트는 손대지 않는다.

## 표시 (클라이언트)

`src/app/admin/(dashboard)/_components/notification-bell.tsx` 가 `(dashboard)`
layout 에 마운트돼 폴링한다. layout 은 admin 영역 내 네비게이션 간 unmount 되지
않으므로 폴링 루프와 커서(`since`)가 영역 내내 유지된다.

벨 클릭 시 최근 알림 드롭다운을 열고 — 열람과 동시에 미확인 알림을 일괄 확인
처리한다. 폴링이 갱신하는 미확인 배지와, 드롭다운이 보여주는 목록은 별개 surface:
배지 카운트는 `pollAdminNotifications`, 목록은 `getRecentAdminNotifications`.
