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
import { fetchRecurringHoursSchedule, fetchSlotRange, type RangeSlotSummary } from './calendarService';
import type { RecurringScheduleRow } from '@/lib/shopSlotBands';
import { getBandCountForYmd, getPerSlotCapacityForYmd } from '@/lib/shopSlotBands';
import type { DayStatus } from './calendarTypes';

// ── Month cache ───────────────────────────────────────────────────────────────
const monthCache = new Map<string, RangeSlotSummary[]>();

/** In-memory weekly schedule (shared with Availability Controls) — used to derive band count when /api/slots/range is old. */
let cachedRecurringSchedule: RecurringScheduleRow[] | null = null;

/**
 * Bump when /api/slots/range payload or client interpretation changes.
 * Prevents stale in-memory month data (e.g. old "45 slots" totals) after deploy.
 */
const SLOT_RANGE_CACHE_SCHEMA = 2;

/** Call after admin saves availability so the calendar picks up new open/closed days. */
export function clearCalendarSlotsCache() {
  monthCache.clear();
  cachedRecurringSchedule = null;
}

/**
 * Month cell: per-time-band seats left, not sum(9×capacity).
 * 1) Prefer API minAvailablePerSlot
 * 2) Else derive bands from GET /api/admin/availability/hours (same logic as backend) + range totals
 * 3) Else API timeBandCount / perSlotCapacity / aggregate fallback
 */
function resolveMonthCellSlotsLeft(
  s: RangeSlotSummary,
  schedule: RecurringScheduleRow[] | null | undefined,
): number {
  const m = Number(s.minAvailablePerSlot);
  if (Number.isFinite(m)) return Math.max(0, m);

  const total = Number(s.totalSlots);
  const avail = Number(s.availableSlots);
  if (schedule && schedule.length > 0 && !s.isClosed) {
    const n = getBandCountForYmd(s.date, schedule);
    const capFromSchedule = getPerSlotCapacityForYmd(s.date, schedule);
    if (
      n > 0
      && capFromSchedule > 0
      && Number.isFinite(total) && total > 0
      && Number.isFinite(avail)
    ) {
      const expectedTotal = n * capFromSchedule;
      if (total === expectedTotal) {
        const bookedSeats = Math.max(0, total - avail);
        return Math.max(0, capFromSchedule - bookedSeats);
      }
    }
  }

  const nApi = Number(s.timeBandCount);
  if (
    !s.isClosed
    && Number.isFinite(nApi) && nApi > 0
    && Number.isFinite(total) && total > 0
    && Number.isFinite(avail)
    && total % nApi === 0
  ) {
    const cap = Math.round(total / nApi);
    const bookedSeats = Math.max(0, total - avail);
    return Math.max(0, cap - bookedSeats);
  }

  const p = Number(s.perSlotCapacity);
  const booked = Number(s.bookedSlots);
  if (!s.isClosed && Number.isFinite(p) && p > 0 && Number.isFinite(booked) && booked === 0) {
    return Math.floor(p);
  }

  return Math.max(0, Number(s.availableSlots) || 0);
}

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
  const [recurringSchedule, setRecurringSchedule] = useState<RecurringScheduleRow[] | null>(
    () => cachedRecurringSchedule,
  );
  const [loading, setLoading] = useState(!monthCache.has(cacheKey));
  const mountedRef = useRef(true);

  const load = useCallback(async (bust = false) => {
    if (!bust && monthCache.has(cacheKey)) {
      setSummaries(monthCache.get(cacheKey)!);
      if (cachedRecurringSchedule?.length) setRecurringSchedule(cachedRecurringSchedule);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { start, end } = getMonthRange(year, month);
      const [data, sched] = await Promise.all([
        fetchSlotRange(start, end),
        (async () => {
          if (cachedRecurringSchedule?.length) return cachedRecurringSchedule;
          const rows = await fetchRecurringHoursSchedule();
          if (rows?.length) cachedRecurringSchedule = rows;
          return rows;
        })(),
      ]);
      if (!mountedRef.current) return;
      monthCache.set(cacheKey, data);
      setSummaries(data);
      if (sched?.length) setRecurringSchedule(sched);
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
    cachedRecurringSchedule = null;
    load(true);
  }, [cacheKey, load]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayMapEntry>();
    const sched = recurringSchedule?.length ? recurringSchedule : cachedRecurringSchedule;
    for (const s of summaries) {
      map.set(s.date, {
        dateKey: s.date,
        status: normaliseStatus(s.status),
        totalSlots: s.totalSlots,
        bookedSlots: s.bookedSlots,
        availableSlots: s.availableSlots,
        perSlotCapacity: Number.isFinite(Number(s.perSlotCapacity)) ? Math.max(0, Number(s.perSlotCapacity)) : 0,
        minAvailablePerSlot: resolveMonthCellSlotsLeft(s, sched),
        pendingCount: s.pendingCount,
        isClosed: s.isClosed,
        closedReason: s.closedReason ?? null,
        closureLabel: s.closureLabel ?? null,
      });
    }
    return map;
  }, [summaries, recurringSchedule]);

  return { dayMap, loading, refresh };
}
