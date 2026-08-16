/**
 * useCalendarSlots.ts
 *
 * Fetches month-level slot data via GET /api/slots/range (backend-driven).
 * Caches per month-key. Auto-invalidates on:
 *   - Socket.io `db_change` (collection === 'orders')
 *   - Socket.io `booking_updated` (emitted by approveBooking/rejectBooking)
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { fetchSlotRange, type RangeSlotSummary } from './calendarService';
import type { DayStatus } from './calendarTypes';

// ── Month cache ───────────────────────────────────────────────────────────────
const monthCache = new Map<string, RangeSlotSummary[]>();

/**
 * Bump when /api/slots/range payload or client interpretation changes.
 * Prevents stale in-memory month data (e.g. old "45 slots" totals) after deploy.
 */
const SLOT_RANGE_CACHE_SCHEMA = 3;

/** Call after admin saves availability so the calendar picks up new open/closed days. */
export function clearCalendarSlotsCache() {
  monthCache.clear();
}

/**
 * Month cells must never reconstruct per-slot availability from daily totals:
 * distribution across time bands is only known by the backend. Older/malformed
 * payloads therefore fail closed with zero rather than inventing capacity.
 */
function resolveMonthCellSlotsLeft(s: RangeSlotSummary): number {
  const m = Number(s.minAvailablePerSlot);
  if (Number.isFinite(m)) return Math.max(0, m);
  return 0;
}

// ── Status normaliser (backend uses UPPER, DayStatus uses lower) ──────────────
function normaliseStatus(s: string): DayStatus {
  switch (s?.toUpperCase()) {
    // A date can contain one over-capacity band while other exact bands remain
    // bookable. Keep the day selectable; the exact-slot modal blocks only the
    // affected rows. The day-map conversion below upgrades this to `full` when
    // the backend reports no remaining capacity anywhere on the date.
    case 'OVER_CAPACITY': return 'almost_full';
    case 'FULL':        return 'full';
    case 'ALMOST_FULL': return 'almost_full';
    case 'CLOSED':      return 'closed';
    case 'PAST':        return 'closed';
    case 'AVAILABLE':   return 'available';
    // Unknown server states must not make a date appear bookable.
    default:            return 'closed';
  }
}

export interface DayMapEntry {
  dateKey: string;
  status: DayStatus;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  perSlotCapacity: number;
  minAvailablePerSlot: number;
  pendingCount: number;
  isClosed: boolean;
  closedReason?: 'emergency' | 'closure' | 'recurring' | null;
  closureLabel?: string | null;
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
  const cacheKey = `${year}-${month}-sr${SLOT_RANGE_CACHE_SCHEMA}`;
  const [summaries, setSummaries] = useState<RangeSlotSummary[]>(() => monthCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(!monthCache.has(cacheKey));
  const mountedRef = useRef(true);

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
    const sock = getSharedSocket();

    const invalidate = () => {
      monthCache.delete(cacheKey);
      load(true);
    };

    const onDbChange = (payload: { collection: string }) => {
      if (
        payload?.collection === 'orders'
        || payload?.collection === 'shopavailabilities'
        || payload?.collection === 'scheduledclosures'
      ) {
        invalidate();
      }
    };

    const onAvailabilityUpdated = () => {
      invalidate();
    };

    // Targeted event emitted by approveBooking / rejectBooking
    const onBookingUpdated = (payload: { date?: string }) => {
      // Only bust if the changed date is within this month's range
      if (!payload?.date) { invalidate(); return; }
      const { start, end } = getMonthRange(year, month);
      if (payload.date >= start && payload.date <= end) invalidate();
    };

    sock.on('db_change', onDbChange);
    sock.on('booking_updated', onBookingUpdated);
    sock.on('availability_updated', onAvailabilityUpdated);

    return () => {
      sock.off('db_change', onDbChange);
      sock.off('booking_updated', onBookingUpdated);
      sock.off('availability_updated', onAvailabilityUpdated);
    };
  }, [cacheKey, year, month, load]);

  const refresh = useCallback(() => {
    monthCache.delete(cacheKey);
    load(true);
  }, [cacheKey, load]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayMapEntry>();
    for (const s of summaries) {
      const rawStatus = String(s.status || '').toUpperCase();
      const knownStatus = [
        'AVAILABLE',
        'ALMOST_FULL',
        'FULL',
        'OVER_CAPACITY',
        'CLOSED',
        'PAST',
      ].includes(rawStatus);
      map.set(s.date, {
        dateKey: s.date,
        status: s.status === 'OVER_CAPACITY' && Number(s.availableSlots) <= 0
          ? 'full'
          : normaliseStatus(s.status),
        totalSlots: s.totalSlots,
        bookedSlots: s.bookedSlots,
        availableSlots: s.availableSlots,
        perSlotCapacity: Number.isFinite(Number(s.perSlotCapacity)) ? Math.max(0, Number(s.perSlotCapacity)) : 0,
        minAvailablePerSlot: resolveMonthCellSlotsLeft(s),
        pendingCount: s.pendingCount,
        isClosed: s.isClosed || rawStatus === 'PAST' || !knownStatus,
        closedReason: s.closedReason ?? null,
        closureLabel: rawStatus === 'PAST'
          ? 'Past date'
          : !knownStatus
            ? 'Availability unavailable'
            : s.closureLabel ?? null,
      });
    }
    return map;
  }, [summaries]);

  return { dayMap, loading, refresh };
}
