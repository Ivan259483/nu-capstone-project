import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  NotificationService,
  type NotificationPagination,
  type SystemNotification,
} from '@/lib/notification-service';
import { getSharedSocket } from '@/hooks/useRealtimeSync';

export const QUALITY_NOTIFICATION_CHANNEL = 'quality_control';
const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 25_000;
const CHANNEL_SCOPE = { channel: QUALITY_NOTIFICATION_CHANNEL } as const;

const emptyPagination: NotificationPagination = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  pages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

function notificationId(notification: SystemNotification): string {
  return String(notification.id || notification._id || '');
}

function notificationTime(notification: SystemNotification): number {
  const parsed = Date.parse(notification.lastOccurredAt || notification.createdAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNotifications(rows: SystemNotification[]): SystemNotification[] {
  return [...rows].sort((a, b) => notificationTime(b) - notificationTime(a));
}

function belongsToQualityChannel(value: unknown): value is SystemNotification {
  if (!value || typeof value !== 'object') return false;
  const notification = value as SystemNotification;
  return notification.metadata?.channel === QUALITY_NOTIFICATION_CHANNEL;
}

function upsertNotification(
  current: SystemNotification[],
  incoming: SystemNotification,
): SystemNotification[] {
  const id = notificationId(incoming);
  if (!id) return current;
  const existingIndex = current.findIndex((item) => notificationId(item) === id);
  if (existingIndex < 0) return sortNotifications([incoming, ...current]).slice(0, 100);
  const next = [...current];
  next[existingIndex] = { ...next[existingIndex], ...incoming };
  return sortNotifications(next);
}

export function useQualityNotifications() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState<NotificationPagination>(emptyPagination);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const appendSequence = useRef(0);
  const loadingOwner = useRef(0);
  const loadingMoreOwner = useRef(0);
  const notificationsRef = useRef<SystemNotification[]>([]);
  const unreadCountRef = useRef(0);
  const mutationVersions = useRef(new Map<string, number>());
  const feedVersion = useRef(0);
  const pendingReadMutations = useRef(new Map<string, { version: number; isRead: boolean }>());
  const pendingMarkAllVersion = useRef<number | null>(null);
  const unreadRecountSequence = useRef(0);

  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { unreadCountRef.current = unreadCount; }, [unreadCount]);

  const fetchPage = useCallback(async (
    page = 1,
    { append = false, silent = false }: { append?: boolean; silent?: boolean } = {},
  ) => {
    const sequence = append ? ++appendSequence.current : ++refreshSequence.current;
    if (!append) {
      // A page-one refresh supersedes an in-flight append, but the append still
      // owns and clears its own request flag in `finally` below.
      appendSequence.current += 1;
      setLoadingMore(false);
    }
    if (!silent) {
      if (append) {
        loadingMoreOwner.current = sequence;
        setLoadingMore(true);
      } else {
        loadingOwner.current = sequence;
        setLoading(true);
      }
    }

    try {
      const response = await NotificationService.getNotifications({
        ...CHANNEL_SCOPE,
        countScope: 'filtered',
        page,
        limit: PAGE_SIZE,
      }, { fresh: true });

      const isCurrent = append
        ? sequence === appendSequence.current
        : sequence === refreshSequence.current;
      if (!isCurrent) return response;
      if (!response.success) {
        setError(response.message || 'Notifications could not be loaded.');
      } else {
        const rows = (response.data || []).map((row) => {
          const pending = pendingReadMutations.current.get(notificationId(row));
          if (pending) {
            return {
              ...row,
              isRead: pending.isRead,
              readAt: pending.isRead ? row.readAt || new Date().toISOString() : null,
            };
          }
          if (pendingMarkAllVersion.current != null) {
            return { ...row, isRead: true, readAt: row.readAt || new Date().toISOString() };
          }
          return row;
        });
        setNotifications((current) => {
          const merged = new Map(current.map((item) => [notificationId(item), item]));
          rows.forEach((item) => merged.set(notificationId(item), item));
          const next = sortNotifications([...merged.values()]);
          notificationsRef.current = next;
          return next;
        });
        if (
          pendingReadMutations.current.size === 0
          && pendingMarkAllVersion.current == null
        ) {
          setUnreadCount(response.unreadCount || 0);
          unreadCountRef.current = response.unreadCount || 0;
        }
        const serverPagination = response.pagination || { ...emptyPagination, page };
        setPagination((current) => {
          if (!append && current.page > 1) {
            const loadedPage = Math.min(current.page, Math.max(1, serverPagination.pages));
            return {
              ...serverPagination,
              page: loadedPage,
              hasNextPage: loadedPage < serverPagination.pages,
              hasPreviousPage: loadedPage > 1,
            };
          }
          return serverPagination;
        });
        setError(null);
      }
      return response;
    } finally {
      if (!silent && append && loadingMoreOwner.current === sequence) {
        setLoadingMore(false);
      }
      if (!silent && !append && loadingOwner.current === sequence) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(
    (silent = false) => fetchPage(1, { silent }),
    [fetchPage],
  );

  const loadMore = useCallback(async () => {
    if (!pagination.hasNextPage || loadingMore) return;
    await fetchPage(pagination.page + 1, { append: true });
  }, [fetchPage, loadingMore, pagination.hasNextPage, pagination.page]);

  const setRead = useCallback(async (id: string, isRead: boolean) => {
    const previous = notificationsRef.current.find((item) => notificationId(item) === id);
    const version = (mutationVersions.current.get(id) || 0) + 1;
    mutationVersions.current.set(id, version);
    pendingReadMutations.current.set(id, { version, isRead });
    const operationFeedVersion = ++feedVersion.current;
    const unreadDelta = previous && previous.isRead !== isRead ? (isRead ? -1 : 1) : 0;
    setNotifications((current) => {
      const next = current.map((item) => (
        notificationId(item) === id
          ? { ...item, isRead, readAt: isRead ? new Date().toISOString() : null }
          : item
      ));
      notificationsRef.current = next;
      return next;
    });
    if (unreadDelta) {
      setUnreadCount((count) => {
        const next = Math.max(0, count + unreadDelta);
        unreadCountRef.current = next;
        return next;
      });
    }

    const response = await NotificationService.setReadStatus(id, isRead, CHANNEL_SCOPE);
    if (mutationVersions.current.get(id) !== version) {
      if (pendingReadMutations.current.get(id)?.version === version) {
        pendingReadMutations.current.delete(id);
      }
      return response;
    }
    pendingReadMutations.current.delete(id);
    if (!response.success) {
      if (previous) {
        setNotifications((current) => {
          const next = current.map((item) => (
            notificationId(item) === id ? previous : item
          ));
          notificationsRef.current = next;
          return next;
        });
      }
      if (unreadDelta) {
        setUnreadCount((count) => {
          const next = Math.max(0, count - unreadDelta);
          unreadCountRef.current = next;
          return next;
        });
      }
      toast.error('Notification status could not be updated.', {
        action: { label: 'Retry', onClick: () => { void setRead(id, isRead); } },
      });
      return response;
    }
    if (
      feedVersion.current === operationFeedVersion
      && typeof response.unreadCount === 'number'
    ) {
      setUnreadCount(response.unreadCount);
      unreadCountRef.current = response.unreadCount;
    } else if (feedVersion.current !== operationFeedVersion) {
      void refresh(true);
    }
    if (response.data && !Array.isArray(response.data)) {
      setNotifications((current) => {
        const next = upsertNotification(current, response.data as SystemNotification);
        notificationsRef.current = next;
        return next;
      });
    }
    return response;
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    const snapshot = notificationsRef.current;
    const previousUnread = unreadCountRef.current;
    const operationFeedVersion = ++feedVersion.current;
    pendingMarkAllVersion.current = operationFeedVersion;
    snapshot.forEach((item) => {
      const id = notificationId(item);
      mutationVersions.current.set(id, (mutationVersions.current.get(id) || 0) + 1);
    });
    setNotifications((current) => {
      const next = current.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt || new Date().toISOString(),
      }));
      notificationsRef.current = next;
      return next;
    });
    setUnreadCount(0);
    unreadCountRef.current = 0;

    const response = await NotificationService.markAllAsRead(CHANNEL_SCOPE);
    if (pendingMarkAllVersion.current === operationFeedVersion) {
      pendingMarkAllVersion.current = null;
    }
    if (!response.success) {
      if (feedVersion.current === operationFeedVersion) {
        const previouslyUnread = new Set(
          snapshot.filter((item) => !item.isRead).map(notificationId),
        );
        setNotifications((current) => {
          const next = current.map((item) => (
            previouslyUnread.has(notificationId(item))
              ? { ...item, isRead: false, readAt: null }
              : item
          ));
          notificationsRef.current = next;
          return next;
        });
        setUnreadCount(previousUnread);
        unreadCountRef.current = previousUnread;
      } else {
        void refresh(true);
      }
      toast.error('Notifications could not be marked as read.', {
        action: { label: 'Retry', onClick: () => { void markAllRead(); } },
      });
      return response;
    }
    if (feedVersion.current === operationFeedVersion) {
      const count = response.unreadCount || 0;
      setUnreadCount(count);
      unreadCountRef.current = count;
    } else {
      void refresh(true);
    }
    return response;
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const socket = getSharedSocket();

    const invalidatePendingMutation = (id?: string) => {
      feedVersion.current += 1;
      unreadRecountSequence.current += 1;
      if (id) {
        mutationVersions.current.set(id, (mutationVersions.current.get(id) || 0) + 1);
        pendingReadMutations.current.delete(id);
      }
    };

    const handleNew = (payload: unknown) => {
      if (!belongsToQualityChannel(payload)) return;
      const notification = payload as SystemNotification;
      const id = notificationId(notification);
      const existing = notificationsRef.current.find((item) => notificationId(item) === id);
      const shouldIncrementUnread = (
        !notification.isRead
        && !notification.resolvedAt
        && (!existing || existing.isRead || existing.resolvedAt)
      );
      invalidatePendingMutation(id);
      if (shouldIncrementUnread) {
        setUnreadCount((count) => {
          const next = count + 1;
          unreadCountRef.current = next;
          return next;
        });
      }
      setNotifications((current) => {
        const next = upsertNotification(current, notification);
        notificationsRef.current = next;
        return next;
      });
    };
    const handleResolved = (payload: unknown) => {
      if (!belongsToQualityChannel(payload)) return;
      const incoming = payload as SystemNotification;
      const id = notificationId(incoming);
      const existing = notificationsRef.current.find((item) => notificationId(item) === id);
      invalidatePendingMutation(id);
      if (existing && !existing.isRead) {
        setUnreadCount((count) => {
          const next = Math.max(0, count - 1);
          unreadCountRef.current = next;
          return next;
        });
      }
      setNotifications((current) => {
        const next = current.map((item) => (
          notificationId(item) === id
            ? { ...item, ...incoming, isResolved: true, isRead: true, actionRequired: false }
            : item
        ));
        notificationsRef.current = next;
        return next;
      });
      // The resolved row may be outside the loaded page. Recount only the badge
      // instead of replacing the live feed with a racing page response.
      const recountSequence = ++unreadRecountSequence.current;
      void NotificationService.getUnreadCount(CHANNEL_SCOPE, { fresh: true }).then((response) => {
        if (!response.success || recountSequence !== unreadRecountSequence.current) return;
        setUnreadCount(response.unreadCount);
        unreadCountRef.current = response.unreadCount;
      });
    };
    const handleState = (payload: any) => {
      if (payload?.channel && payload.channel !== QUALITY_NOTIFICATION_CHANNEL) return;
      if (!payload?.id) return;
      const id = String(payload.id);
      invalidatePendingMutation(id);
      setNotifications((current) => {
        const next = current.map((item) => (
          notificationId(item) === id
            ? { ...item, isRead: Boolean(payload.isRead), readAt: payload.readAt || null }
            : item
        ));
        notificationsRef.current = next;
        return next;
      });
      if (payload.channel === QUALITY_NOTIFICATION_CHANNEL && typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
        unreadCountRef.current = payload.unreadCount;
      }
    };
    const handleReadAll = (payload: any) => {
      if (payload?.channel !== QUALITY_NOTIFICATION_CHANNEL) return;
      invalidatePendingMutation();
      pendingMarkAllVersion.current = null;
      const ids = Array.isArray(payload.notificationIds)
        ? new Set(payload.notificationIds.map(String))
        : null;
      setNotifications((current) => {
        const next = current.map((item) => {
          const id = notificationId(item);
          if (ids && !ids.has(id)) return item;
          mutationVersions.current.set(id, (mutationVersions.current.get(id) || 0) + 1);
          return {
            ...item,
            isRead: true,
            readAt: item.readAt || payload.readAt || new Date().toISOString(),
          };
        });
        notificationsRef.current = next;
        return next;
      });
      const nextUnread = typeof payload.unreadCount === 'number' ? payload.unreadCount : 0;
      setUnreadCount(nextUnread);
      unreadCountRef.current = nextUnread;
    };
    const handleConnect = () => { void refresh(true); };

    socket.on('notification:new', handleNew);
    socket.on('notification:resolved', handleResolved);
    socket.on('notification:state', handleState);
    socket.on('notification:read-all', handleReadAll);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('notification:new', handleNew);
      socket.off('notification:resolved', handleResolved);
      socket.off('notification:state', handleState);
      socket.off('notification:read-all', handleReadAll);
      socket.off('connect', handleConnect);
    };
  }, [refresh]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  return {
    notifications,
    unreadCount,
    pagination,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    setRead,
    markAllRead,
  };
}
