"use server";

import { requireAdminSession } from "@/server/dal";
import { prisma } from "@/server/db/prisma";

import {
  countUnreadAdminNotifications,
  getNewestAdminNotificationTimestamp,
  listAdminNotificationsSince,
  listRecentAdminNotifications,
} from "./queries";
import type { AdminNotification, AdminNotificationPoll } from "./schema";

/**
 * 어드민 알림 폴링 — 클라이언트 NotificationBell 이 일정 주기로 호출.
 *
 * 읽기 작업이지만 queries.ts ('server-only') 는 클라이언트가 못 부르므로
 * Server Action 으로 노출한다. 공개 POST 엔드포인트와 동일하게 첫 줄 가드 필수.
 *
 * @param since 직전 폴링이 돌려준 cursor. null 이면 첫 호출 — 백로그를
 *              브라우저 알림으로 쏟지 않도록 빈 배열만 주고 cursor 만 확정한다.
 */
export async function pollAdminNotifications(
  since: string | null,
): Promise<AdminNotificationPoll> {
  await requireAdminSession();

  const unreadCount = await countUnreadAdminNotifications();

  if (since === null) {
    const newest = await getNewestAdminNotificationTimestamp();
    return {
      notifications: [],
      unreadCount,
      cursor: newest ?? new Date().toISOString(),
    };
  }

  const notifications = await listAdminNotificationsSince(since);
  const cursor =
    notifications.length > 0
      ? notifications[notifications.length - 1].createdAt
      : since;

  return { notifications, unreadCount, cursor };
}

/**
 * 헤더 벨 드롭다운 표시용 최근 알림 목록 — 패널이 열릴 때 호출.
 * 읽기 작업이지만 클라이언트가 호출하므로 Server Action 으로 노출 (가드 필수).
 */
export async function getRecentAdminNotifications(): Promise<
  AdminNotification[]
> {
  await requireAdminSession();
  return listRecentAdminNotifications();
}

/**
 * 미확인 알림을 확인 처리 — 헤더 벨 클릭 시 호출.
 * `ids` 미지정 시 전체 일괄 (현재 UI). 인자는 추후 알림별 개별 확인 UI 대비.
 */
export async function markAdminNotificationsRead(
  ids?: string[],
): Promise<void> {
  await requireAdminSession();
  await prisma.adminNotification.updateMany({
    where: {
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
}
