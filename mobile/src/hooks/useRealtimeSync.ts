import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { authStorage } from '@/services/storage/authStorage';
import { API_BASE_URL } from '@/config/env';
import { invalidateCache } from '@/services/api/client';
import { isAdminDashboardRole, isServiceStaffRole } from '@/services/api/roles';

// ── Collection → query key matching ──────────────────────────────────
// Maps MongoDB collection changes to React Query query keys
const COLLECTION_QUERY_MAP: Record<string, string[]> = {
  orders: ['bookings', 'booking', 'orders', 'dashboard'],
  products: ['products'],
  services: ['services'],
};

let sharedSocket: Socket | null = null;
let subscribers: ((payload: any) => void)[] = [];

export const getSharedSocket = async (): Promise<Socket> => {
  if (!sharedSocket || !sharedSocket.connected) {
    if (sharedSocket) {
      sharedSocket.disconnect();
    }
    
    // We attach the user token during handshake for strict security
    const token = await authStorage.getToken();
    
    const serverUrl = API_BASE_URL.replace('/api', '');

    sharedSocket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      auth: {
        token
      }
    });
  }
  return sharedSocket;
};

export function useRealtimeSync(
  collectionsToWatch: string[] = ['orders', 'services', 'products'],
  callback?: (collection: string, operationType: string, documentKey: any, fullDocument?: any) => void
) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!profile) {
      if (sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
      }
      return;
    }

    const initSocket = async () => {
      const socket = await getSharedSocket();

      // Only mount the global listener once per socket instance lifecycle
      if (!hasInitialized.current) {
        hasInitialized.current = true;
        
        socket.on('db_change', (payload: any) => {
          // 1. Bust the in-memory HTTP cache for the affected collection
          if (payload.collection === 'orders') {
            invalidateCache('/bookings');
          }

          // 2. Invalidate React Query matching patterns securely
          const queryKeysToInvalidate = COLLECTION_QUERY_MAP[payload.collection];
          if (queryKeysToInvalidate) {
            queryKeysToInvalidate.forEach((queryKey) => {
              queryClient.invalidateQueries({ queryKey: [queryKey] });
            });
            console.log(`[SOCKET] Invalidated local caches due to ${payload.collection} db_change`);
          }

          // 3. Alert raw subscribers directly reading from hook (if provided)
          subscribers.forEach((sub) => sub(payload));
        });

        // Fallback explicit event listener for Order Updates
        // Ensures realtime tracking works even if MongoDB Change Streams (Replica Sets) are disabled
        socket.on('orderUpdated', (payload: any) => {
          invalidateCache('/bookings');
          const keys = COLLECTION_QUERY_MAP['orders'];
          if (keys) {
            keys.forEach(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] }));
            console.log(`[SOCKET] Invalidated local caches due to explicit orderUpdated emit`);
          }
          // Notify subscribers simulating a db_change payload
          subscribers.forEach((sub) => sub({ collection: 'orders', operationType: 'update', documentKey: { _id: payload.orderId }}));
        });

        // Specific listener for customer tracking status updates as requested by web app mirror
        socket.on('booking:status_updated', (payload: any) => {
          invalidateCache('/bookings');
          const keys = COLLECTION_QUERY_MAP['orders'];
          if (keys) {
            keys.forEach(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] }));
            console.log(`[SOCKET] Invalidated local caches due to booking:status_updated emit`);
          }
          subscribers.forEach((sub) => sub({ collection: 'orders', operationType: 'update', documentKey: { _id: payload.bookingId || payload.orderId }}));
        });
        
        // Also listen to existing booking:status just in case
        socket.on('booking:status', (payload: any) => {
          invalidateCache('/bookings');
          const keys = COLLECTION_QUERY_MAP['orders'];
          if (keys) {
            keys.forEach(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] }));
            console.log(`[SOCKET] Invalidated local caches due to booking:status emit`);
          }
          subscribers.forEach((sub) => sub({ collection: 'orders', operationType: 'update', documentKey: { _id: payload.bookingId || payload.orderId }}));
        });
      }

      const handler = (payload: any) => {
        if (collectionsToWatch.includes(payload.collection) && callback) {
          callback(payload.collection, payload.operationType, payload.documentKey, payload.fullDocument);
        }
      };

      subscribers.push(handler);

      // Join dynamic rooms based exactly like the frontend
      if (isAdminDashboardRole(profile.role)) {
        socket.emit('join_room', 'admin:chat');
      } else if (isServiceStaffRole(profile.role)) {
        socket.emit('join_room', `staff:${profile.id}`);
      } else {
        socket.emit('join_room', `user:${profile.id}`);
      }
    };

    initSocket();

    return () => {
      // Memory cleanup for local function closures
      subscribers = [];
    };
  }, [profile, queryClient]); // Removed object arrays from dep checks to avoid infinite loops
}
