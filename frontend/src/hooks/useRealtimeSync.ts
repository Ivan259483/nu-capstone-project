import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminDashboardRole, isServiceStaffRole } from '@/lib/roles';

let sharedSocket: Socket | null = null;
let subscribers: ((payload: any) => void)[] = [];

export const getSharedSocket = (): Socket => {
  if (!sharedSocket || !sharedSocket.connected) {
    if (sharedSocket) {
      sharedSocket.disconnect();
    }
    sharedSocket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    sharedSocket.on('db_change', (payload) => {
      console.log('[REALTIME_SYNC] Database change detected:', payload);
      subscribers.forEach((sub) => sub(payload));
    });
  }
  return sharedSocket;
};

/**
 * Hook to listen to global MongoDB change stream events.
 * Provides true zero-delay real-time capabilities without manual polling.
 */
export function useRealtimeSync(
  collectionsToWatch: string[],
  callback: (collection: string, operationType: string, documentKey: any) => void
) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const socket = getSharedSocket();

    const handler = (payload: any) => {
      // payload: { collection: string, operationType: string, documentKey: any }
      if (collectionsToWatch.includes(payload.collection)) {
        callback(payload.collection, payload.operationType, payload.documentKey);
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
