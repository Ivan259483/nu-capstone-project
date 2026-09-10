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

const CUSTOMER_TRACKER_FINAL_STATUS_SET = new Set(['released', 'cancelled', 'failed', 'rejected']);

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

/**
 * True only after customer handover is complete. Payment by itself is not terminal:
 * a paid vehicle waiting for QC to hand it back must remain visible in Live Tracker.
 */
export function bookingHasCompletedCustomerHandover(b: unknown): boolean {
  const row = b as Record<string, unknown> | null | undefined;
  if (!row) return false;
  const status = normTrackerStr(row.status);
  const stage = normTrackerStr(row.serviceTrackingStage);
  const paymentStatus = normTrackerStr(row.paymentStatus);

  if (status === 'released' || stage === 'released') return true;
  return paymentStatus === 'paid' && (status === 'completed' || stage === 'completed');
}

/** True when this booking should surface the technician/QC live tracker. */
export function bookingShowsCustomerLiveTracker(b: unknown): boolean {
  const row = b as Record<string, unknown> | null | undefined;
  if (!row) return false;
  const status = normTrackerStr(row.status);
  if (bookingHasCompletedCustomerHandover(row)) return false;
  if (CUSTOMER_TRACKER_FINAL_STATUS_SET.has(status)) return false;
  return CUSTOMER_TRACKER_STATUS_SET.has(status);
}

/**
 * Authoritative customer-facing Ready for Pickup decision shared by Home and Tracker.
 * A present workflow stage wins; evidence existence never advances lifecycle state.
 */
export function bookingIsReadyForPickup(
  booking: BookingRecord | null | undefined
): boolean {
  if (!booking) return false;
  const status = normTrackerStr(booking.status);
  const stage = normTrackerStr(booking.serviceTrackingStage);
  const customerStatus = normTrackerStr(booking.customerStatus);
  if (stage) return ['ready_pickup', 'completed', 'released'].includes(stage);
  return (
    ['ready_for_payment', 'completed', 'paid', 'released', 'done'].includes(status) ||
    customerStatus === 'ready'
  );
}

/**
 * Canonical rank of a booking's current tracker position. Fine-grained `serviceTrackingStage`
 * wins when present; `status` is a fallback for bookings QC hasn't advanced via the fine stage yet.
 * Keep in sync with frontend/src/lib/customer-live-tracker-pick.ts.
 */
export function trackerStageRankOf(input: {
  serviceTrackingStage?: unknown;
  status?: unknown;
} | null | undefined): number {
  const ts = normTrackerStr(input?.serviceTrackingStage);
  if (ts && CUSTOMER_TRACKER_STAGE_RANK[ts] !== undefined) {
    return CUSTOMER_TRACKER_STAGE_RANK[ts];
  }
  return CUSTOMER_TRACKER_STATUS_FALLBACK_RANK[normTrackerStr(input?.status)] ?? -1;
}

/**
 * True when applying `incoming` on top of `current` does not regress the customer-visible
 * tracker stage. Realtime events (sockets, out-of-order HTTP responses) can arrive after a
 * newer stage was already applied — this guard makes stage progression monotonic so a stale
 * `arrived` event can never downgrade a tracker that already reached `service_in_progress` (or later).
 * Keep in sync with frontend/src/lib/customer-live-tracker-pick.ts.
 */
export function isForwardTrackerStageTransition(
  current: { serviceTrackingStage?: unknown; status?: unknown } | null | undefined,
  incoming: { serviceTrackingStage?: unknown; status?: unknown }
): boolean {
  if (!current) return true;
  const touchesStage = incoming.serviceTrackingStage !== undefined || incoming.status !== undefined;
  if (!touchesStage) return true;
  const currentRank = trackerStageRankOf(current);
  const incomingRank = trackerStageRankOf({
    serviceTrackingStage:
      incoming.serviceTrackingStage !== undefined ? incoming.serviceTrackingStage : current.serviceTrackingStage,
    status: incoming.status !== undefined ? incoming.status : current.status,
  });
  return incomingRank >= currentRank;
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
