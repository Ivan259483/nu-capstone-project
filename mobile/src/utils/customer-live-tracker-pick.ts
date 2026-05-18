/**
 * Keep in sync with frontend/src/pages/CustomerDashboard.tsx
 * (CUSTOMER_TRACKER_* + pickCustomerLiveTrackerBooking + bookingShowsCustomerLiveTracker).
 *
 * Used so the Home hero shows the same “primary” in-shop job as the web customer live tracker,
 * not only the newest row in a loose active filter.
 */

import type { BookingRecord } from '@/services/api/types';

export function normTrackerStr(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

/** Bookings that may appear on the customer live tracker (dashboard + tracker tab). */
const CUSTOMER_TRACKER_STATUS_SET = new Set([
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'in-progress',
  'ready_for_payment',
  'completed',
  'paid',
]);

/** Prefer fine-grained QC stage when ranking which booking to show. */
const CUSTOMER_TRACKER_STAGE_RANK: Record<string, number> = {
  confirmed: 0,
  received: 1,
  in_progress: 2,
  quality_check: 3,
  ready_pickup: 4,
  completed: 5,
  released: 6,
};

const CUSTOMER_TRACKER_STATUS_FALLBACK_RANK: Record<string, number> = {
  approved: 0,
  confirmed: 0,
  assigned: 0,
  received: 1,
  in_progress: 2,
  'in-progress': 2,
  ready_for_payment: 4,
  completed: 5,
  paid: 5,
  released: 6,
  done: 6,
};

/** True when this booking should surface the technician/QC live tracker (excludes fully paid / receipt issued). */
export function bookingShowsCustomerLiveTracker(b: unknown): boolean {
  const row = b as Record<string, unknown> | null | undefined;
  if (!row) return false;
  if (String(row.paymentStatus ?? '').toLowerCase() === 'paid') return false;
  return CUSTOMER_TRACKER_STATUS_SET.has(normTrackerStr(row.status));
}

/**
 * Pick the booking furthest along the live pipeline. `bookings` is usually newest-first;
 * a plain `active[0]` often returns a newer `approved` row instead of the older in-shop job.
 */
export function pickCustomerLiveTrackerBooking(
  bookings: BookingRecord[] | null | undefined
): BookingRecord | undefined {
  if (!bookings?.length) return undefined;
  const candidates = bookings.filter((b) => bookingShowsCustomerLiveTracker(b));
  if (!candidates.length) return undefined;
  const rankOf = (b: BookingRecord) => {
    const ts = normTrackerStr(b?.serviceTrackingStage);
    if (ts && CUSTOMER_TRACKER_STAGE_RANK[ts] !== undefined) {
      return CUSTOMER_TRACKER_STAGE_RANK[ts] + 0.001;
    }
    return CUSTOMER_TRACKER_STATUS_FALLBACK_RANK[normTrackerStr(b?.status)] ?? 0;
  };
  const sorted = [...candidates].sort((a, b) => {
    const d = rankOf(b) - rankOf(a);
    if (d !== 0) return d;
    const tb = new Date(
      (b as any)?.serviceTrackingUpdatedAt || b?.updatedAt || b?.createdAt || 0
    ).getTime();
    const ta = new Date(
      (a as any)?.serviceTrackingUpdatedAt || a?.updatedAt || a?.createdAt || 0
    ).getTime();
    return tb - ta;
  });
  return sorted[0];
}
