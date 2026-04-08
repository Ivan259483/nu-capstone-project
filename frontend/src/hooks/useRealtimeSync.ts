import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminDashboardRole, isServiceStaffRole } from '@/lib/roles';
import { invalidate } from '@/lib/queryCache';

// ── Collection → cache key mapping ──────────────────────────────────
// When a change stream event arrives for a collection, we bust the
// corresponding query cache keys so the next read gets fresh data.
const COLLECTION_CACHE_MAP: Record<string, string[]> = {
  orders: ['/bookings', '/orders'],
  products: ['/products'],
  services: ['/services'],
};

let sharedSocket: Socket | null = null;
let subscribers: ((payload: any) => void)[] = [];

export const getSharedSocket = (): Socket => {
  if (!sharedSocket || !sharedSocket.connected) {
    if (sharedSocket) {
      sharedSocket.disconnect();
    }
    sharedSocket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    sharedSocket.on('db_change', (payload) => {
      // Invalidate query cache for the changed collection
      const prefixes = COLLECTION_CACHE_MAP[payload.collection];
      if (prefixes) {
        prefixes.forEach((p) => invalidate(p));
      }
      subscribers.forEach((sub) => sub(payload));
    });
  }
  return sharedSocket;
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

    // Optional: join role-based rooms if not already handled
    if (isAdminDashboardRole(user.role)) {
      socket.emit('join_room', 'admin:chat');
    } else if (isServiceStaffRole(user.role)) {
      socket.emit('join_room', `staff:${user.id}`);
    } else {
      socket.emit('join_room', `user:${user.id}`);
    }

    return () => {
      subscribers = subscribers.filter((sub) => sub !== handler);
    };
  }, [user, collectionsToWatch, callback]);
}
