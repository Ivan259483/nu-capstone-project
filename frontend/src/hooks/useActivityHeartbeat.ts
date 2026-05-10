import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserService } from '@/lib/user-service';

const INTERVAL_MS = 90 * 1000;

/** Ping server while logged in so admin “presence” (lastSeenAt) stays fresh */
export function useActivityHeartbeat() {
  const { user } = useAuth();
  const userId = user?.id || user?._id;

  useEffect(() => {
    if (!userId) return;

    const ping = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      UserService.touchActivity().catch(() => {});
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
