"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getRecentAdminNotifications,
  markAdminNotificationsRead,
  pollAdminNotifications,
} from "@/features/notifications/actions";
import type { AdminNotification } from "@/features/notifications/schema";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../_lib/format";

/** 폴링 주기. 어드민 소수 운영 — 30초면 부하는 무시 가능하고 충분히 즉각적. */
const POLL_INTERVAL_MS = 30_000;
/** 한 번의 폴링에서 개별 브라우저 알림을 띄우는 최대 개수. 초과분은 요약 1건. */
const MAX_INDIVIDUAL_TOASTS = 3;

type PermissionState = NotificationPermission | "unsupported";

/* ------------------------------------------------------------------
 * 브라우저 알림 권한 — useSyncExternalStore 로 노출.
 *
 * 권한은 (1) SSR 에 존재하지 않는 브라우저 전용 값이고 (2) 사용자 동작으로만
 * 바뀌는 외부 상태다. effect 안에서 setState 로 끌어오는 대신 external store 로
 * 다뤄 SSR/하이드레이션을 안전하게 처리한다.
 * ------------------------------------------------------------------ */

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** 클라이언트 스냅샷 — 현재 브라우저 권한. */
function getPermissionSnapshot(): PermissionState {
  return isNotificationSupported() ? Notification.permission : "unsupported";
}

/** SSR 스냅샷 — 서버엔 권한 개념이 없으므로 항상 default. */
function getServerPermissionSnapshot(): PermissionState {
  return "default";
}

/** 권한 변경(= requestPermission 직후)을 store 구독자에게 알리기 위한 리스너 집합. */
const permissionListeners = new Set<() => void>();

function subscribePermission(onChange: () => void): () => void {
  permissionListeners.add(onChange);
  return () => {
    permissionListeners.delete(onChange);
  };
}

function notifyPermissionChanged(): void {
  for (const listener of permissionListeners) listener();
}

/**
 * 어드민 헤더 알림 벨 — `(dashboard)` layout 에 상주.
 *
 * - 일정 주기로 `pollAdminNotifications` 호출, 새 알림을 브라우저 알림으로 표시.
 * - 미확인 개수를 배지로 표시.
 * - 클릭 시 최근 알림 드롭다운을 열고, 미확인 알림은 일괄 확인 처리.
 * - 브라우저 알림은 탭이 열려 있을 때만 — 백그라운드 푸시는 미도입.
 */
export function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  /** 드롭다운 목록. null = 아직 한 번도 로드 안 함. */
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const permission = useSyncExternalStore(
    subscribePermission,
    getPermissionSnapshot,
    getServerPermissionSnapshot,
  );

  /** 다음 폴링에 넘길 커서. 최초 null → 첫 폴링이 베이스라인을 확정한다. */
  const sinceRef = useRef<string | null>(null);
  /** 바깥 클릭 감지용 — 벨 + 패널을 감싸는 wrapper. */
  const containerRef = useRef<HTMLDivElement>(null);

  /** 새 알림을 브라우저 알림으로 표시. 권한 granted 일 때만 호출된다. */
  const showBrowserNotifications = useCallback(
    (notifications: AdminNotification[]) => {
      const spawnNotification = (
        title: string,
        body: string,
        link: string | null,
      ) => {
        const notification = new Notification(title, {
          body,
          tag: link ?? title, // 동일 tag = OS 가 중복 억제
        });
        notification.onclick = () => {
          window.focus();
          router.push((link ?? "/admin/requests") as Route);
          notification.close();
        };
      };

      if (notifications.length <= MAX_INDIVIDUAL_TOASTS) {
        for (const n of notifications) {
          spawnNotification(n.title, n.body, n.linkPath);
        }
      } else {
        spawnNotification(
          `새 알림 ${notifications.length}건`,
          "어드민 대시보드에서 확인해주세요.",
          "/admin/requests",
        );
      }
    },
    [router],
  );

  /** 1회 폴링 — 배지 갱신 + (탭이 살아있고 권한 있으면) 브라우저 알림. */
  const poll = useCallback(async () => {
    try {
      const isBaseline = sinceRef.current === null;
      const res = await pollAdminNotifications(sinceRef.current);
      sinceRef.current = res.cursor;
      setUnreadCount(res.unreadCount);
      if (
        !isBaseline &&
        res.notifications.length > 0 &&
        getPermissionSnapshot() === "granted"
      ) {
        showBrowserNotifications(res.notifications);
      }
    } catch {
      // 세션 만료 등 — 조용히 무시. 다음 네비게이션에서 layout 가드가 redirect.
    }
  }, [showBrowserNotifications]);

  /* 폴링 루프 + 탭 복귀 시 즉시 1회. */
  useEffect(() => {
    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  /* 패널 열림 동안 바깥 클릭 / Esc 로 닫기. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /** 패널 열기 — 최근 알림 목록 fetch + 미확인 일괄 확인 처리. */
  const openPanel = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    try {
      const list = await getRecentAdminNotifications();
      setItems(list);
      // 열람 = 확인 처리. 표시용 list 스냅샷은 readAt 을 그대로 둬 이번 열람에선
      // "안 읽음" 점을 유지하고, 다음 열람부터 사라지게 한다.
      if (list.some((n) => n.readAt === null)) {
        setUnreadCount(0);
        void markAdminNotificationsRead();
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (open) setOpen(false);
    else void openPanel();
  }, [open, openPanel]);

  /** 알림 항목 / 푸터 클릭 — 패널 닫고 이동. */
  const handleSelect = useCallback(
    (linkPath: string | null) => {
      setOpen(false);
      router.push((linkPath ?? "/admin/requests") as Route);
    },
    [router],
  );

  const handleEnablePermission = useCallback(async () => {
    await Notification.requestPermission();
    notifyPermissionChanged();
  }, []);

  const muted = permission === "denied" || permission === "unsupported";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        title="알림"
        aria-label="알림"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-full text-[#4b4b4b] hover:bg-[#efefef] hover:text-black transition-colors"
      >
        <BellIcon muted={muted} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold tabular-nums">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {/* 권한 미요청 — "켜라"는 힌트 점 (배지가 없을 때만) */}
        {permission === "default" && unreadCount === 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white"
          />
        )}
      </button>

      {open && (
        <NotificationPanel
          items={items}
          loading={loading}
          permission={permission}
          onEnablePermission={handleEnablePermission}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}

/* ============================================================
 * 드롭다운 패널
 * ============================================================ */

function NotificationPanel({
  items,
  loading,
  permission,
  onEnablePermission,
  onSelect,
}: {
  items: AdminNotification[] | null;
  loading: boolean;
  permission: PermissionState;
  onEnablePermission: () => void;
  onSelect: (linkPath: string | null) => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[#efefef] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] z-40 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#efefef]">
        <h3 className="text-sm font-bold text-black tracking-tight">알림</h3>
      </div>

      {/* 브라우저 알림 권한 안내 */}
      {permission === "default" && (
        <div className="px-4 py-2.5 bg-[#fafafa] border-b border-[#efefef] flex items-center justify-between gap-3">
          <span className="text-xs text-[#4b4b4b]">
            브라우저 알림이 꺼져 있어요
          </span>
          <button
            type="button"
            onClick={onEnablePermission}
            className="shrink-0 text-xs font-medium text-black underline underline-offset-2 hover:no-underline"
          >
            켜기
          </button>
        </div>
      )}
      {permission === "denied" && (
        <div className="px-4 py-2.5 bg-[#fafafa] border-b border-[#efefef]">
          <span className="text-xs text-[#afafaf]">
            브라우저 알림이 차단돼 있어요 — 브라우저 설정에서 허용해주세요
          </span>
        </div>
      )}

      {/* 목록 */}
      <div className="max-h-96 overflow-y-auto">
        {loading || items === null ? (
          <p className="px-4 py-8 text-center text-xs text-[#afafaf]">
            불러오는 중…
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#afafaf]">
            새 알림이 없어요
          </p>
        ) : (
          <ul className="divide-y divide-[#efefef]">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.linkPath)}
                  className="w-full text-left px-4 py-3 flex gap-2.5 hover:bg-[#fafafa] transition-colors"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                      item.readAt === null ? "bg-red-500" : "bg-transparent",
                    )}
                  />
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-black">
                      {item.title}
                    </span>
                    <span className="text-xs text-[#4b4b4b] line-clamp-2">
                      {item.body}
                    </span>
                    <span className="text-[11px] text-[#afafaf] tabular-nums mt-0.5">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className="w-full px-4 py-2.5 text-xs text-[#4b4b4b] hover:text-black hover:bg-[#fafafa] transition-colors border-t border-[#efefef]"
      >
        요청 모니터링 전체 보기
      </button>
    </div>
  );
}

function BellIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("w-[18px] h-[18px]", muted && "opacity-50")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5a4 4 0 0 0-4 4c0 3-1.5 4.5-1.5 4.5h11S12 8.5 12 5.5a4 4 0 0 0-4-4Z" />
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
      {muted && <path d="M2.5 2.5l11 11" />}
    </svg>
  );
}
