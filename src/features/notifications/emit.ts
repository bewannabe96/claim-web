import "server-only";

import { newId } from "@/lib/id";
import { prisma } from "@/server/db/prisma";

import {
  AdminNotificationInputSchema,
  type AdminNotificationInput,
} from "./schema";

/**
 * 어드민 알림 1건 발행 — 도메인 이벤트 발생부(요청 finalize 등)에서 호출.
 *
 * **절대 throw 하지 않는다.** 호출부는 이미 본질적 작업(요청 송부 트랜잭션 등)을
 * 끝낸 상태 — 알림 INSERT 실패가 그 성공을 에러로 뒤집으면 안 된다. 실패는
 * 로그만 남기고 흡수하므로, 호출부는 try/catch 없이 그냥 `await` 하면 된다.
 *
 * 'use server' 액션이 아니다 — 클라이언트가 직접 부르는 엔드포인트가 아니라
 * 서버 내부에서만 쓰는 헬퍼. (클라이언트 폴링은 actions.ts 가 담당.)
 */
export async function emitAdminNotification(
  input: AdminNotificationInput,
): Promise<void> {
  const parsed = AdminNotificationInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error("[emitAdminNotification] invalid input", {
      input,
      issues: parsed.error.flatten(),
    });
    return;
  }
  try {
    await prisma.adminNotification.create({
      data: {
        id: newId(),
        type: parsed.data.type,
        title: parsed.data.title,
        body: parsed.data.body,
        linkPath: parsed.data.linkPath ?? null,
        entityId: parsed.data.entityId ?? null,
      },
    });
  } catch (err) {
    console.error("[emitAdminNotification] insert failed", {
      type: parsed.data.type,
      entityId: parsed.data.entityId,
      error: err instanceof Error ? err.message : err,
    });
  }
}
