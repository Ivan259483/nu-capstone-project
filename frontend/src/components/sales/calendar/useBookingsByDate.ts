/**
 * useBookingsByDate.ts
 * Fetches bookings for a single clicked date.
 * Caches per-date. Clears on Socket.io db_change for 'orders'.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBookingsByDate } from './calendarService';
import type { CalendarBooking } from './calendarTypes';

const dateCache = new Map<string, CalendarBooking[]>();

export interface UseBookingsByDateReturn {
  bookings: CalendarBooking[];
  loading: boolean;
  refetch: () => void;
}

export function useBookingsByDate(date: string | null): UseBookingsByDateReturn {
  const [bookings, setBookings] = useState<CalendarBooking[]>(
    () => (date ? (dateCache.get(date) ?? []) : [])
  );
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (bust = false) => {
      if (!date) { setBookings([]); return; }
      if (!bust && dateCache.has(date)) {
        setBookings(dateCache.get(date)!);
        return;
      }
      setLoading(true);
      try {
        const bks = await fetchBookingsByDate(date);
        if (!mountedRef.current) return;
        dateCache.set(date, bks);
        setBookings(bks);
      } catch {
        setBookings([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [date]
  );

  useEffect(() => {
    mountedRef.current = true;
    setBookings(date ? (dateCache.get(date) ?? []) : []);
    load();
    return () => { mountedRef.current = false; };
  }, [date, load]);

  const refetch = useCallback(() => {
    if (date) dateCache.delete(date);
    load(true);
  }, [date, load]);

  // Expose a static helper to bust a specific date cache from outside
  return { bookings, loading, refetch };
}

/** Call this to invalidate a date key from outside the hook (e.g., after approve/reject) */
export function invalidateDateCache(date: string) {
  dateCache.delete(date);
}
