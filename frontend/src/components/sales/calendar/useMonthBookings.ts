import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { fetchBookingsByRange } from './calendarService';
import type { CalendarBooking } from './calendarTypes';

const rangeCache = new Map<string, CalendarBooking[]>();

export interface UseMonthBookingsReturn {
  bookings: CalendarBooking[];
  loading: boolean;
  refetch: () => void;
}

export function useMonthBookings(start: string, end: string, enabled = true): UseMonthBookingsReturn {
  const cacheKey = `${start}:${end}`;
  const [bookings, setBookings] = useState<CalendarBooking[]>(() =>
    enabled ? (rangeCache.get(cacheKey) ?? []) : [],
  );
  const [loading, setLoading] = useState(enabled && !rangeCache.has(cacheKey));
  const mountedRef = useRef(true);

  const load = useCallback(
    async (bust = false) => {
      if (!enabled) {
        setBookings([]);
        setLoading(false);
        return;
      }

      if (!bust && rangeCache.has(cacheKey)) {
        setBookings(rangeCache.get(cacheKey)!);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const rows = await fetchBookingsByRange(start, end);
        if (!mountedRef.current) return;
        rangeCache.set(cacheKey, rows);
        setBookings(rows);
      } catch {
        if (mountedRef.current) setBookings([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [cacheKey, enabled, end, start],
  );

  useEffect(() => {
    mountedRef.current = true;
    setBookings(enabled ? (rangeCache.get(cacheKey) ?? []) : []);
    setLoading(enabled && !rangeCache.has(cacheKey));
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [cacheKey, enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const socket = getSharedSocket();

    const invalidate = (date?: string) => {
      if (date && (date < start || date > end)) return;
      rangeCache.delete(cacheKey);
      load(true);
    };

    const onDbChange = (payload: { collection?: string; fullDocument?: { bookingDate?: string } }) => {
      if (payload?.collection !== 'orders') return;
      invalidate(payload.fullDocument?.bookingDate);
    };

    const onBookingUpdated = (payload: { date?: string }) => {
      invalidate(payload?.date);
    };

    socket.on('db_change', onDbChange);
    socket.on('booking_updated', onBookingUpdated);

    return () => {
      socket.off('db_change', onDbChange);
      socket.off('booking_updated', onBookingUpdated);
    };
  }, [cacheKey, enabled, end, load, start]);

  const refetch = useCallback(() => {
    if (!enabled) return;
    rangeCache.delete(cacheKey);
    load(true);
  }, [cacheKey, enabled, load]);

  return { bookings, loading, refetch };
}
