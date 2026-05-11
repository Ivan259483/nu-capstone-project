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

    ping();
    const timer = window.setInterval(ping, INTERVAL_MS);
    const onFocus = () => ping();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [userId]);
}
