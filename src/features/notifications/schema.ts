import { z } from "zod";

/* ============================================================
 * 어드민 알림 — 브라우저(Notification API) + 헤더 벨 배지용 이벤트.
 *
 * 발송 채널(알림톡/SMS) 과는 별개. admin_notification 테이블에 쌓인 row 를
 * 어드민 클라이언트가 폴링으로 읽어 브라우저 알림으로 띄운다. 백그라운드 푸시
 * (Service Worker/VAPID) 는 미도입 — 탭이 열려 있을 때만 동작.
 *
 * 새 유형 추가: ADMIN_NOTIFICATION_TYPES 에 문자열 추가 + emit 호출부 작성.
 * title/body 는 emit 시점에 완성 문구로 저장되므로 표시 코드는 유형을 몰라도 된다.
 * ============================================================ */

export const ADMIN_NOTIFICATION_TYPES = [
  /** 가입자가 요청서를 확정해 설계사에게 송부됨 (status → dispatched). */
  "plan_request.dispatched",
] as const;

export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

const TYPE_TUPLE = ADMIN_NOTIFICATION_TYPES as unknown as [
  AdminNotificationType,
  ...AdminNotificationType[],
];

/**
 * emit 입력 — 도메인 이벤트 발생부에서 emitAdminNotification 에 넘기는 형태.
 * title/body 는 사람이 읽는 완성 문구.
 */
export const AdminNotificationInputSchema = z.object({
  type: z.enum(TYPE_TUPLE),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  linkPath: z.string().min(1).max(300).optional(),
  entityId: z.string().min(1).max(64).optional(),
});

export type AdminNotificationInput = z.infer<typeof AdminNotificationInputSchema>;

/**
 * 클라이언트로 건너가는 직렬화 형태 — Date 는 ISO 문자열.
 * (Server Action 반환값은 client 경계를 넘으므로 Date 객체 금지.)
 */
export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  linkPath: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

/** 폴링 응답 — features/notifications/actions.ts 의 pollAdminNotifications. */
export type AdminNotificationPoll = {
  /** since 이후 새로 생긴 알림 (createdAt 오름차순). since=null 첫 호출 시 빈 배열. */
  notifications: AdminNotification[];
  /** 미확인(readAt=null) 알림 총 개수 — 벨 배지. */
  unreadCount: number;
  /** 다음 폴링에 since 로 넘길 커서 (관측한 최신 createdAt, ISO). */
  cursor: string;
};
