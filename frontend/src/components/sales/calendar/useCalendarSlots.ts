/**
 * useCalendarSlots.ts
 *
 * Fetches month-level slot data via GET /api/slots/range (backend-driven).
 * Caches per month-key. Auto-invalidates on:
 *   - Socket.io `db_change` (collection === 'orders')
 *   - Socket.io `booking_updated` (emitted by approveBooking/rejectBooking)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getBackendSocketUrl } from '@/lib/api';
import { fetchSlotRange, type RangeSlotSummary } from './calendarService';
import type { DayStatus } from './calendarTypes';

// ── Month cache ───────────────────────────────────────────────────────────────
const monthCache = new Map<string, RangeSlotSummary[]>();

// ── Status normaliser (backend uses UPPER, DayStatus uses lower) ──────────────
function normaliseStatus(s: string): DayStatus {
  switch (s?.toUpperCase()) {
    case 'FULL':        return 'full';
    case 'ALMOST_FULL': return 'almost_full';
    case 'CLOSED':      return 'closed';
    default:            return 'available';
  }
}

export interface DayMapEntry {
  dateKey: string;
  status: DayStatus;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  pendingCount: number;
  isClosed: boolean;
}

export interface UseCalendarSlotsReturn {
  dayMap: Map<string, DayMapEntry>;
  loading: boolean;
  refresh: () => void;
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function useCalendarSlots(year: number, month: number): UseCalendarSlotsReturn {
  const cacheKey = `${year}-${month}`;
  const [summaries, setSummaries] = useState<RangeSlotSummary[]>(() => monthCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(!monthCache.has(cacheKey));
  const mountedRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async (bust = false) => {
    if (!bust && monthCache.has(cacheKey)) {
      setSummaries(monthCache.get(cacheKey)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { start, end } = getMonthRange(year, month);
      const data = await fetchSlotRange(start, end);
      if (!mountedRef.current) return;
      monthCache.set(cacheKey, data);
      setSummaries(data);
    } catch {
      // silent — caller shows error toast if needed
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cacheKey, year, month]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  // Socket.io — bust cache on any order mutation
  useEffect(() => {
    const sock = io(getBackendSocketUrl(), {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = sock;

    const invalidate = () => {
      monthCache.delete(cacheKey);
      load(true);
    };

    sock.on('db_change', (payload: { collection: string }) => {
      if (payload?.collection === 'orders') invalidate();
    });

    // Targeted event emitted by approveBooking / rejectBooking
    sock.on('booking_updated', (payload: { date?: string }) => {
      // Only bust if the changed date is within this month's range
      if (!payload?.date) { invalidate(); return; }
      const { start, end } = getMonthRange(year, month);
      if (payload.date >= start && payload.date <= end) invalidate();
    });

    return () => {
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
    };
  }, [cacheKey, year, month, load]);

  const refresh = useCallback(() => {
    monthCache.delete(cacheKey);
    load(true);
  }, [cacheKey, load]);

  // Convert summaries to the DayMapEntry map the calendar renders
  const dayMap = new Map<string, DayMapEntry>();
  for (const s of summaries) {
    dayMap.set(s.date, {
      dateKey: s.date,
      status: normaliseStatus(s.status),
      totalSlots: s.totalSlots,
      bookedSlots: s.bookedSlots,
      availableSlots: s.availableSlots,
      pendingCount: s.pendingCount,
      isClosed: s.isClosed,
    });
  }

  return { dayMap, loading, refresh };
}
