import "server-only";

import type { AdminNotification as PrismaAdminNotification } from "@prisma/client";

import { prisma } from "@/server/db/prisma";

import type { AdminNotification } from "./schema";

/** 폴링이 한 번에 가져오는 최대 알림 수 — 버스트 상한. */
const POLL_BATCH_LIMIT = 30;

/** 헤더 벨 드롭다운에 표시하는 최근 알림 수. */
const RECENT_LIST_LIMIT = 20;

function mapNotification(row: PrismaAdminNotification): AdminNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkPath: row.linkPath,
    entityId: row.entityId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * `since` (ISO timestamp) 이후 생성된 알림 — createdAt 오름차순.
 *
 * Timestamptz(6) 마이크로초 정밀도라 운영 규모(사람이 일으키는 이벤트)에서는
 * 동일 timestamp 충돌 확률이 사실상 0 — strict `>` 로 충분하다 (이미 본 알림
 * 재발송 방지가 목적이라 누락보다 중복 회피를 우선).
 */
export async function listAdminNotificationsSince(
  since: string,
): Promise<AdminNotification[]> {
  const rows = await prisma.adminNotification.findMany({
    where: { createdAt: { gt: new Date(since) } },
    orderBy: { createdAt: "asc" },
    take: POLL_BATCH_LIMIT,
  });
  return rows.map(mapNotification);
}

/** 미확인(readAt=null) 알림 개수 — 헤더 벨 배지. */
export async function countUnreadAdminNotifications(): Promise<number> {
  return prisma.adminNotification.count({ where: { readAt: null } });
}

/**
 * 가장 최근 알림의 createdAt (ISO) — 없으면 null.
 * 폴링 첫 호출(since=null)이 베이스라인 커서를 잡을 때 사용 — 이 시점 이전
 * 백로그는 브라우저 알림으로 쏟지 않는다.
 */
export async function getNewestAdminNotificationTimestamp(): Promise<
  string | null
> {
  const row = await prisma.adminNotification.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt.toISOString() ?? null;
}

/** 헤더 벨 드롭다운 표시용 — 최근 알림 N건 (읽음/안읽음 무관, 최신순). */
export async function listRecentAdminNotifications(): Promise<
  AdminNotification[]
> {
  const rows = await prisma.adminNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: RECENT_LIST_LIMIT,
  });
  return rows.map(mapNotification);
}
