/**
 * Keeps admin calendar, Availability Controls, and customer booking UI in sync
 * after shop hours / closures change (same backend: ShopAvailability + ScheduledClosure).
 */
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { clearCalendarSlotsCache } from '@/components/sales/calendar/useCalendarSlots';
import { invalidate } from '@/lib/queryCache';
import type { RangeSlotSummary } from '@/components/sales/calendar/calendarService';

export const AVAILABILITY_UPDATED_EVENT = 'autospf:availability-updated';

export type CustomerDayAvailabilityStatus = 'available' | 'full' | 'closed';

export type CustomerDayAvailabilityInfo = {
  status: CustomerDayAvailabilityStatus;
  unavailable: boolean;
  reason: string;
  errorCode: string | null;
  remaining: number | null;
  booked: number | null;
  capacity: number | null;
};

/** Bust admin month cache, customer slot cache, and notify in-tab listeners. */
export function syncAvailabilityCaches(): void {
  clearCalendarSlotsCache();
  invalidate('/orders/available-slots');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AVAILABILITY_UPDATED_EVENT));
  }
}

/** Map admin /api/slots/range row → customer month-picker shape. */
export function mapRangeSummaryToCustomerDay(summary: RangeSlotSummary): CustomerDayAvailabilityInfo {
  const knownStatus = new Set(['AVAILABLE', 'ALMOST_FULL', 'FULL', 'OVER_CAPACITY', 'CLOSED']);
  const availableSeats = Number(summary?.availableSlots);
  const dailyCapacity = Number(summary?.dailyCapacity);
  const booked = Number(summary?.bookedSlots);
  if (
    !summary
    || typeof summary.isClosed !== 'boolean'
    || !knownStatus.has(String(summary.status || '').toUpperCase())
    || !Number.isFinite(availableSeats)
    || !Number.isFinite(dailyCapacity)
    || dailyCapacity < 0
    || !Number.isFinite(booked)
    || booked < 0
  ) {
    return {
      status: 'closed',
      unavailable: true,
      reason: 'Live availability could not be verified for this date.',
      errorCode: 'AVAILABILITY_UNVERIFIED',
      remaining: 0,
      booked: null,
      capacity: null,
    };
  }

  const closed = summary.isClosed || summary.status === 'CLOSED';
  const full =
    !closed
    && (summary.status === 'FULL' || availableSeats <= 0);

  let status: CustomerDayAvailabilityStatus = 'available';
  if (closed) status = 'closed';
  else if (full) status = 'full';

  const reason = closed
    ? summary.closureLabel
      || (summary.closedReason === 'emergency'
        ? 'Bookings for today have been temporarily closed. Please select another available date.'
        : summary.closedReason === 'recurring'
          ? 'This day is closed per the weekly schedule.'
          : 'This date is not available for booking.')
    : full
      ? 'All appointment times for this date are booked.'
      : '';

  return {
    status,
    unavailable: status !== 'available',
    reason,
    errorCode: closed
      ? summary.closedReason === 'emergency'
        ? 'EMERGENCY_CLOSED'
        : summary.closedReason === 'recurring'
          ? 'CLOSED_BY_RECURRING_DAY'
          : 'CLOSED_BY_SCHEDULED_CLOSURE'
      : full
        ? 'DATE_FULL'
        : null,
    remaining: availableSeats,
    booked,
    capacity: dailyCapacity,
  };
}

const hookedSockets = new WeakSet<object>();

/** Subscribe to server pushes + Mongo change streams for availability collections. */
export function ensureAvailabilityRealtimeSync(): void {
  if (typeof window === 'undefined') return;

  const sock = getSharedSocket();
  if (hookedSockets.has(sock)) return;
  hookedSockets.add(sock);

  sock.on('availability_updated', () => {
    syncAvailabilityCaches();
  });

  sock.on('db_change', (payload: { collection?: string }) => {
    const coll = payload?.collection;
    if (coll === 'orders' || coll === 'shopavailabilities' || coll === 'scheduledclosures') {
      syncAvailabilityCaches();
    }
  });
}
