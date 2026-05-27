import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminDashboardRole, isServiceStaffRole } from '@/lib/roles';
import { invalidate } from '@/lib/queryCache';
import { getBackendSocketUrl, getStoredAuthToken } from '@/lib/api';

// ── Collection → cache key mapping ──────────────────────────────────
// When a change stream event arrives for a collection, we bust the
// corresponding query cache keys so the next read gets fresh data.
const COLLECTION_CACHE_MAP: Record<string, string[]> = {
  orders: ['/bookings', '/orders'],
  products: ['/products'],
  services: ['/services'],
  shopavailabilities: ['/orders/available-slots'],
  scheduledclosures: ['/orders/available-slots'],
};

let sharedSocket: Socket | null = null;
let subscribers: ((payload: any) => void)[] = [];

/**
 * Get (or create) the singleton socket connection.
 * Sends the JWT auth token so the backend auto-joins user rooms on
 * connect AND reconnect — critical for real-time role changes to reach
 * every user, even on deployed domains with flaky connections.
 */
export const getSharedSocket = (): Socket => {
  if (!sharedSocket) {
    const token = getStoredAuthToken();

    sharedSocket = io(getBackendSocketUrl(), {
      transports: ['polling', 'websocket'], // polling first for handshake, then upgrades to ws
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,      // Never give up reconnecting
      auth: { token },                     // Sent to backend middleware on EVERY connect/reconnect
    });

    sharedSocket.on('db_change', (payload) => {
      // Invalidate query cache for the changed collection
      const prefixes = COLLECTION_CACHE_MAP[payload.collection];
      if (prefixes) {
        prefixes.forEach((p) => invalidate(p));
      }
      subscribers.forEach((sub) => sub(payload));
    });

    sharedSocket.on('connect', () => {
      console.log('🔌 [Socket] Connected:', sharedSocket?.id);
    });

    sharedSocket.on('disconnect', (reason) => {
      console.warn('⚡ [Socket] Disconnected:', reason);
    });
  }

  return sharedSocket;
};

/**
 * Refresh the socket auth token — call this after login so the socket
 * can authenticate with the backend on reconnection.
 */
export const refreshSocketAuth = () => {
  if (!sharedSocket) return;
  const token = getStoredAuthToken();
  (sharedSocket as any).auth = { token };
  // Force a reconnect so the backend picks up the new token and
  // automatically joins the user's rooms.
  if (sharedSocket.connected) {
    sharedSocket.disconnect().connect();
  }
};

/**
 * Completely tear down the socket — call on logout.
 */
export const destroySharedSocket = () => {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    subscribers = [];
  }
};

/**
 * Hook to listen to global MongoDB change stream events.
 * Provides true zero-delay real-time capabilities without manual polling.
 * Automatically invalidates the query cache for changed collections.
 */
export function useRealtimeSync(
  collectionsToWatch: string[],
  callback: (collection: string, operationType: string, documentKey: any, fullDocument?: any) => void
) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const socket = getSharedSocket();

    const handler = (payload: any) => {
      if (collectionsToWatch.includes(payload.collection)) {
        callback(payload.collection, payload.operationType, payload.documentKey, payload.fullDocument);
      }
    };

    subscribers.push(handler);

    // Join role-based rooms (also fires on reconnect via the connect handler below)
    const joinRooms = () => {
      if (user.id) socket.emit('join_room', `user:${user.id}`);
      if ((user as any)._id && (user as any)._id !== user.id) {
        socket.emit('join_room', `user:${(user as any)._id}`);
      }
      if (isAdminDashboardRole(user.role)) {
        socket.emit('join_room', 'admin:chat');
      } else if (isServiceStaffRole(user.role)) {
        socket.emit('join_room', `staff:${user.id}`);
      }
    };

    // Join immediately + re-join after any reconnection
    joinRooms();
    socket.on('connect', joinRooms);

    return () => {
      subscribers = subscribers.filter((sub) => sub !== handler);
      socket.off('connect', joinRooms);
    };
  }, [user, collectionsToWatch, callback]);
}
