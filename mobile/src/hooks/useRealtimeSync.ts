import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { authStorage } from '@/services/storage/authStorage';
import { API_BASE_URL } from '@/config/env';
import { invalidateCache } from '@/services/api/client';
import { isAdminDashboardRole, isServiceStaffRole } from '@/services/api/roles';

// ── Collection → query key matching ──────────────────────────────────
const COLLECTION_QUERY_MAP: Record<string, string[]> = {
  orders: ['bookings', 'booking', 'orders', 'dashboard'],
  products: ['products'],
  services: ['services'],
};

/** Debounce bursts from db_change + orderUpdated + booking:status on the same edit. */
const ORDERS_REFRESH_DEBOUNCE_MS = 700;

let sharedSocket: Socket | null = null;
let socketListenersAttached = false;
let subscribers: ((payload: any) => void)[] = [];
let globalQueryClient: QueryClient | null = null;
let ordersRefreshTimer: ReturnType<typeof setTimeout> | null = null;

export const getSharedSocket = async (): Promise<Socket> => {
  if (!sharedSocket || !sharedSocket.connected) {
    if (sharedSocket) {
      sharedSocket.disconnect();
      socketListenersAttached = false;
    }

    const token = await authStorage.getToken();
    const serverUrl = API_BASE_URL.replace('/api', '');

    sharedSocket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      auth: { token },
    });
  }
  return sharedSocket;
};

function invalidateCollectionQueries(collection: string, source: string): void {
  const queryKeysToInvalidate = COLLECTION_QUERY_MAP[collection];
  if (!queryKeysToInvalidate?.length || !globalQueryClient) return;

  queryKeysToInvalidate.forEach((queryKey) => {
    globalQueryClient!.invalidateQueries({ queryKey: [queryKey] });
  });

  if (__DEV__) {
    console.log(`[SOCKET] Refreshed caches (${source}) → ${queryKeysToInvalidate.join(', ')}`);
  }
}

function scheduleOrdersRefresh(source: string, subscriberPayload?: Record<string, unknown>): void {
  if (ordersRefreshTimer) clearTimeout(ordersRefreshTimer);

  ordersRefreshTimer = setTimeout(() => {
    ordersRefreshTimer = null;
    invalidateCache('/bookings');
    invalidateCollectionQueries('orders', source);
    if (subscriberPayload) {
      subscribers.forEach((sub) => sub(subscriberPayload));
    }
  }, ORDERS_REFRESH_DEBOUNCE_MS);
}

function attachGlobalSocketListeners(socket: Socket): void {
  if (socketListenersAttached) return;
  socketListenersAttached = true;

  socket.on('db_change', (payload: any) => {
    if (payload.collection === 'orders') {
      scheduleOrdersRefresh(`${payload.collection} db_change`, payload);
      return;
    }

    invalidateCollectionQueries(payload.collection, `${payload.collection} db_change`);
    subscribers.forEach((sub) => sub(payload));
  });

  const onOrderEvent = (source: string, orderId?: string) => {
    scheduleOrdersRefresh(source, {
      collection: 'orders',
      operationType: 'update',
      documentKey: { _id: orderId },
    });
  };

  socket.on('orderUpdated', (payload: any) => {
    onOrderEvent('orderUpdated', payload?.orderId);
  });

  socket.on('booking:status_updated', (payload: any) => {
    onOrderEvent('booking:status_updated', payload?.bookingId || payload?.orderId);
  });

  socket.on('booking:status', (payload: any) => {
    onOrderEvent('booking:status', payload?.bookingId || payload?.orderId);
  });
}

export function useRealtimeSync(
  collectionsToWatch: string[] = ['orders', 'services', 'products'],
  callback?: (collection: string, operationType: string, documentKey: any, fullDocument?: any) => void
) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const collectionsRef = useRef(collectionsToWatch);
  const callbackRef = useRef(callback);

  collectionsRef.current = collectionsToWatch;
  callbackRef.current = callback;

  useEffect(() => {
    globalQueryClient = queryClient;
  }, [queryClient]);

  useEffect(() => {
    if (!profile) {
      if (sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
        socketListenersAttached = false;
      }
      if (ordersRefreshTimer) {
        clearTimeout(ordersRefreshTimer);
        ordersRefreshTimer = null;
      }
      return;
    }

    let cancelled = false;

    const handler = (payload: any) => {
      if (collectionsRef.current.includes(payload.collection) && callbackRef.current) {
        callbackRef.current(
          payload.collection,
          payload.operationType,
          payload.documentKey,
          payload.fullDocument
        );
      }
    };

    subscribers.push(handler);

    void (async () => {
      const socket = await getSharedSocket();
      if (cancelled) return;

      attachGlobalSocketListeners(socket);

      if (isAdminDashboardRole(profile.role)) {
        socket.emit('join_room', 'admin:chat');
      } else if (isServiceStaffRole(profile.role)) {
        socket.emit('join_room', `staff:${profile.id}`);
      } else {
        socket.emit('join_room', `user:${profile.id}`);
      }
    })();

    return () => {
      cancelled = true;
      subscribers = subscribers.filter((sub) => sub !== handler);
    };
  }, [profile?.id, profile?.role]);
}
