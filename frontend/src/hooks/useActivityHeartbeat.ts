import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/lib/user-service';

const INTERVAL_MS = 90 * 1000;
const MIN_TOUCH_INTERVAL_MS = 60 * 1000;

let lastActivityTouchAt = 0;
let activityTouchInFlight: Promise<unknown> | null = null;

/** Ping server while logged in so admin “presence” (lastSeenAt) stays fresh */
export function useActivityHeartbeat() {
  const { user } = useAuth();
  const userId = user?.id || user?._id;

  useEffect(() => {
    if (!userId) return;

    const ping = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (activityTouchInFlight || now - lastActivityTouchAt < MIN_TOUCH_INTERVAL_MS) return;

      lastActivityTouchAt = now;
      activityTouchInFlight = UserService.touchActivity()
        .catch(() => {})
        .finally(() => {
          activityTouchInFlight = null;
        });
    };

    // Presence must not compete with the first dashboard data requests after
    // login. Queue the initial heartbeat for an idle slice (with a short
    // fallback for browsers that do not implement requestIdleCallback).
    let initialTimer: number | null = null;
    let idleHandle: number | null = null;
    const requestIdle = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    }).requestIdleCallback;
    const cancelIdle = (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
    if (typeof requestIdle === 'function') {
      idleHandle = requestIdle(ping, { timeout: 3_000 });
    } else {
      initialTimer = window.setTimeout(ping, 1_500);
    }
    const timer = window.setInterval(ping, INTERVAL_MS);
    const onFocus = () => ping();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(timer);
      if (initialTimer !== null) window.clearTimeout(initialTimer);
      if (idleHandle !== null && typeof cancelIdle === 'function') {
        cancelIdle(idleHandle);
      }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [userId]);
}
