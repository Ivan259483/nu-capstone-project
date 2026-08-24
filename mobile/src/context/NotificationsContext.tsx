import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { isCustomerRole } from '@/services/api/roles';
import {
  normalizeNotification,
  notificationService,
} from '@/services/api/notificationService';
import type { NotificationPage, NotificationRecord } from '@/services/api/types';
import { getApiErrorMessage } from '@/services/api/client';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { subscribeToPushNotificationRefresh } from '@/utils/notificationEvents';

const PAGE_SIZE = 20;

type NotificationsContextValue = {
  notifications: NotificationRecord[];
  unreadCount: number;
  importantUnread: number;
  promotionUnread: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  markingAllRead: boolean;
  error: string | null;
  hasNextPage: boolean;
  refreshNotifications: () => Promise<void>;
  loadMore: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const emptyPagination: NotificationPage['pagination'] = {
  page: 0,
  limit: PAGE_SIZE,
  total: 0,
  pages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

function mergeUnique(
  current: NotificationRecord[],
  incoming: NotificationRecord[]
): NotificationRecord[] {
  const rows = new Map(current.map((notification) => [notification.id, notification]));
  incoming.forEach((notification) => rows.set(notification.id, notification));
  return [...rows.values()].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const enabled = Boolean(profile?.id && isCustomerRole(profile.role));
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [promotionUnread, setPromotionUnread] = useState(0);
  const [pagination, setPagination] = useState(emptyPagination);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIdsRef = useRef(new Set<string>());
  const notificationStateRef = useRef(
    new Map<string, Pick<NotificationRecord, 'isRead' | 'category'>>()
  );
  const readMutationByIdRef = useRef(new Map<string, number>());
  const readMutationSequenceRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const customerId = enabled ? String(profile?.id || '') : '';
  const activeCustomerIdRef = useRef(customerId);
  activeCustomerIdRef.current = customerId;

  const applyPage = useCallback((page: NotificationPage, replace: boolean) => {
    setNotifications((current) => {
      const next = replace
        ? page.notifications
        : mergeUnique(current, page.notifications);
      knownIdsRef.current = new Set(next.map((notification) => notification.id));
      notificationStateRef.current = new Map(
        next.map((notification) => [
          notification.id,
          { isRead: notification.isRead, category: notification.category },
        ])
      );
      readMutationByIdRef.current.clear();
      return next;
    });
    setUnreadCount(page.unreadCount);
    setPromotionUnread(Number(page.facets.unreadCategories.promotion || 0));
    setPagination(page.pagination);
    setError(null);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!enabled || !customerId) return;
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const requestCustomerId = customerId;
    let task!: Promise<void>;
    task = (async () => {
      const hasRows = knownIdsRef.current.size > 0;
      setRefreshing(hasRows);
      setLoading(!hasRows);
      try {
        const page = await notificationService.getNotifications(1, PAGE_SIZE);
        if (activeCustomerIdRef.current === requestCustomerId) applyPage(page, true);
      } catch (refreshError) {
        if (activeCustomerIdRef.current === requestCustomerId) {
          setError(getApiErrorMessage(refreshError, 'Unable to load notifications.'));
        }
      } finally {
        if (activeCustomerIdRef.current === requestCustomerId) {
          setLoading(false);
          setRefreshing(false);
        }
        if (refreshPromiseRef.current === task) refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = task;
    return task;
  }, [applyPage, customerId, enabled]);

  const loadMore = useCallback(async () => {
    if (!enabled || !customerId || !pagination.hasNextPage || loadPromiseRef.current) return;
    const requestCustomerId = customerId;
    let task!: Promise<void>;
    task = (async () => {
      setLoadingMore(true);
      try {
        const page = await notificationService.getNotifications(
          pagination.page + 1,
          PAGE_SIZE
        );
        if (activeCustomerIdRef.current === requestCustomerId) applyPage(page, false);
      } catch (loadError) {
        if (activeCustomerIdRef.current === requestCustomerId) {
          setError(getApiErrorMessage(loadError, 'Unable to load more notifications.'));
        }
      } finally {
        if (activeCustomerIdRef.current === requestCustomerId) setLoadingMore(false);
        if (loadPromiseRef.current === task) loadPromiseRef.current = null;
      }
    })();
    loadPromiseRef.current = task;
    return task;
  }, [applyPage, customerId, enabled, pagination.hasNextPage, pagination.page]);

  const ingestRealtime = useCallback((raw: unknown) => {
    const activeCustomerId = activeCustomerIdRef.current;
    if (!activeCustomerId) return;
    const notification = normalizeNotification(raw);
    if (!notification.id) return;
    const payloadCustomerId = String(
      notification.metadata?.customerId || notification.data?.customerId || ''
    );
    if (payloadCustomerId && payloadCustomerId !== activeCustomerId) return;
    const previousState = notificationStateRef.current.get(notification.id);
    notificationStateRef.current.set(notification.id, {
      isRead: notification.isRead,
      category: notification.category,
    });
    readMutationByIdRef.current.delete(notification.id);

    if (knownIdsRef.current.has(notification.id)) {
      setNotifications((current) =>
        current.map((row) => (row.id === notification.id ? notification : row))
      );
      if (previousState?.isRead && !notification.isRead) {
        setUnreadCount((count) => count + 1);
        if (notification.category === 'promotion') setPromotionUnread((count) => count + 1);
      } else if (previousState && !previousState.isRead && notification.isRead) {
        setUnreadCount((count) => Math.max(0, count - 1));
        if (previousState.category === 'promotion') {
          setPromotionUnread((count) => Math.max(0, count - 1));
        }
      } else if (previousState && !notification.isRead && previousState.category !== notification.category) {
        if (previousState.category === 'promotion') {
          setPromotionUnread((count) => Math.max(0, count - 1));
        } else if (notification.category === 'promotion') {
          setPromotionUnread((count) => count + 1);
        }
      }
      return;
    }

    knownIdsRef.current.add(notification.id);
    setNotifications((current) => mergeUnique(current, [notification]));
    if (!notification.isRead) {
      setUnreadCount((count) => count + 1);
      if (notification.category === 'promotion') {
        setPromotionUnread((count) => count + 1);
      }
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    const currentState = notificationStateRef.current.get(id);
    if (!currentState || currentState.isRead) return;
    const operation = ++readMutationSequenceRef.current;
    readMutationByIdRef.current.set(id, operation);
    notificationStateRef.current.set(id, { ...currentState, isRead: true });

    setNotifications((rows) =>
      rows.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification
      )
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    if (currentState.category === 'promotion') {
      setPromotionUnread((count) => Math.max(0, count - 1));
    }

    try {
      await notificationService.markAsRead(id);
    } catch (markError) {
      if (readMutationByIdRef.current.get(id) !== operation) throw markError;
      readMutationByIdRef.current.delete(id);
      notificationStateRef.current.set(id, currentState);
      setNotifications((rows) =>
        rows.map((notification) =>
          notification.id === id ? { ...notification, isRead: false } : notification
        )
      );
      setUnreadCount((count) => count + 1);
      if (currentState.category === 'promotion') setPromotionUnread((count) => count + 1);
      throw markError;
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (markingAllRead || unreadCount === 0) return;
    const previous = notifications;
    const previousStates = new Map(notificationStateRef.current);
    const operation = ++readMutationSequenceRef.current;
    setMarkingAllRead(true);
    notificationStateRef.current.forEach((state, id) => {
      readMutationByIdRef.current.set(id, operation);
      notificationStateRef.current.set(id, { ...state, isRead: true });
    });
    setNotifications((rows) => rows.map((notification) => ({ ...notification, isRead: true })));
    setUnreadCount(0);
    setPromotionUnread(0);
    try {
      const serverUnreadCount = await notificationService.markAllAsRead();
      setUnreadCount(serverUnreadCount);
      if (serverUnreadCount > 0) await refreshNotifications();
    } catch (markError) {
      previousStates.forEach((state, id) => {
        if (readMutationByIdRef.current.get(id) === operation) {
          notificationStateRef.current.set(id, state);
          readMutationByIdRef.current.delete(id);
        }
      });
      setNotifications((current) => mergeUnique(current, previous));
      const currentStates = [...notificationStateRef.current.values()];
      setUnreadCount(currentStates.filter((state) => !state.isRead).length);
      setPromotionUnread(
        currentStates.filter((state) => !state.isRead && state.category === 'promotion').length
      );
      throw markError;
    } finally {
      setMarkingAllRead(false);
    }
  }, [markingAllRead, notifications, refreshNotifications, unreadCount]);

  useEffect(() => {
    if (!enabled) {
      knownIdsRef.current.clear();
      notificationStateRef.current.clear();
      readMutationByIdRef.current.clear();
      refreshPromiseRef.current = null;
      loadPromiseRef.current = null;
      setNotifications([]);
      setUnreadCount(0);
      setPromotionUnread(0);
      setPagination(emptyPagination);
      setError(null);
      return;
    }
    // Never carry one authenticated customer's inbox into another session.
    knownIdsRef.current.clear();
    notificationStateRef.current.clear();
    readMutationByIdRef.current.clear();
    refreshPromiseRef.current = null;
    loadPromiseRef.current = null;
    setNotifications([]);
    setUnreadCount(0);
    setPromotionUnread(0);
    setPagination(emptyPagination);
    setError(null);
    void refreshNotifications();
  }, [customerId, enabled, refreshNotifications]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let socketCleanup: (() => void) | null = null;

    void getSharedSocket().then((socket) => {
      if (cancelled) return;
      const onConnect = () => void refreshNotifications();
      socket.on('notification:new', ingestRealtime);
      socket.on('notification:customer', ingestRealtime);
      socket.on('connect', onConnect);
      socketCleanup = () => {
        socket.off('notification:new', ingestRealtime);
        socket.off('notification:customer', ingestRealtime);
        socket.off('connect', onConnect);
      };
    });

    return () => {
      cancelled = true;
      socketCleanup?.();
    };
  }, [enabled, ingestRealtime, refreshNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = /inactive|background/.test(appStateRef.current);
      appStateRef.current = nextState;
      if (wasBackground && nextState === 'active') void refreshNotifications();
    });
    const unsubscribePush = subscribeToPushNotificationRefresh(() => {
      void refreshNotifications();
    });
    return () => {
      subscription.remove();
      unsubscribePush();
    };
  }, [enabled, refreshNotifications]);

  const value = useMemo<NotificationsContextValue>(() => ({
    notifications,
    unreadCount,
    importantUnread: Math.max(0, unreadCount - promotionUnread),
    promotionUnread,
    loading,
    refreshing,
    loadingMore,
    markingAllRead,
    error,
    hasNextPage: pagination.hasNextPage,
    refreshNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
  }), [
    error,
    loadMore,
    loading,
    loadingMore,
    markAllAsRead,
    markAsRead,
    markingAllRead,
    notifications,
    pagination.hasNextPage,
    promotionUnread,
    refreshNotifications,
    refreshing,
    unreadCount,
  ]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return context;
}
