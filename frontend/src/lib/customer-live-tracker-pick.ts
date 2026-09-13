/**
 * Canonical customer live-tracker booking selection + stage ranking.
 * Keep in sync with mobile/src/utils/customer-live-tracker-pick.ts
 * (CUSTOMER_TRACKER_* + pickCustomerLiveTrackerBooking + bookingShowsCustomerLiveTracker).
 *
 * Both the Web dashboard widget and the full Web live tracker page import from here so the
 * "which booking is the active job" and "how far along is it" rules never drift between screens
 * — the backend's `serviceTrackingStage` (falling back to `status`) is the single source of truth.
 */

export function normTrackerStr(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

/** Bookings that may appear on the customer live tracker (dashboard + tracker tab). */
export const CUSTOMER_TRACKER_STATUS_SET = new Set([
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

export const CUSTOMER_TRACKER_FINAL_STATUS_SET = new Set(['released', 'cancelled', 'failed', 'rejected']);

/** Prefer fine-grained QC stage when ranking which booking to show. */
export const CUSTOMER_TRACKER_STAGE_RANK: Record<string, number> = {
  confirmed: 0,
  received: 1,
  in_progress: 2,
  quality_check: 3,
  ready_pickup: 4,
  completed: 5,
  released: 6,
};

export const CUSTOMER_TRACKER_STATUS_FALLBACK_RANK: Record<string, number> = {
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

export type CustomerTrackingState = 'live' | 'completed' | 'cancelled';

/**
 * Tracking lifecycle as resolved by the backend (`customerTrackingState`, defined once in
 * backend/constants/orderLifecycle.js: payment settled + receipt issued ⇒ completed).
 * Clients never derive "is it done" from status/payment fields themselves.
 */
export function bookingCustomerTrackingState(b: unknown): CustomerTrackingState {
  const value = normTrackerStr((b as Record<string, unknown> | null | undefined)?.customerTrackingState);
  return value === 'completed' || value === 'cancelled' ? value : 'live';
}

/** True when the backend reports the job finished (settled with receipt, or released). */
export function bookingTrackingIsCompleted(b: unknown): boolean {
  return bookingCustomerTrackingState(b) === 'completed';
}

/** True once the backend ends live tracking for this booking (completed or cancelled). */
export function bookingHasCompletedCustomerHandover(b: unknown): boolean {
  return bookingCustomerTrackingState(b) !== 'live';
}

/** Most recently completed booking, shown as a finished summary when nothing is live. */
export function pickCustomerCompletedTrackerBooking(
  bookings: unknown[] | null | undefined
): any | undefined {
  const completed = ((bookings || []) as any[]).filter(bookingTrackingIsCompleted);
  const completedAt = (b: any) =>
    new Date(b?.customerTrackingCompletedAt || b?.updatedAt || b?.createdAt || 0).getTime();
  return completed.sort((a, b) => completedAt(b) - completedAt(a))[0];
}

/**
 * Explicit name for the same rule, for call sites that read better as a terminal check.
 * Any surface that decides "is there an active tracker" must go through this, including
 * fallback paths that would otherwise select a booking by `status` alone.
 */
export function bookingIsTerminalForLiveTracker(b: unknown): boolean {
  return bookingHasCompletedCustomerHandover(b);
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
export function bookingIsReadyForPickup(booking: unknown): boolean {
  const row = booking as Record<string, unknown> | null | undefined;
  if (!row) return false;
  const status = normTrackerStr(row.status);
  const stage = normTrackerStr(row.serviceTrackingStage);
  const customerStatus = normTrackerStr(row.customerStatus);
  if (stage) return ['ready_pickup', 'completed', 'released'].includes(stage);
  return (
    ['ready_for_payment', 'completed', 'paid', 'released', 'done'].includes(status) ||
    customerStatus === 'ready'
  );
}

/**
 * Canonical rank of a booking's current tracker position. Fine-grained `serviceTrackingStage`
 * wins when present; `status` is a fallback for bookings QC hasn't advanced via the fine stage yet.
 * Keep in sync with mobile/src/utils/customer-live-tracker-pick.ts.
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
 * Keep in sync with mobile/src/utils/customer-live-tracker-pick.ts.
 */
export function isForwardTrackerStageTransition(
  current: { serviceTrackingStage?: unknown; status?: unknown; customerTrackingState?: unknown } | null | undefined,
  incoming: { serviceTrackingStage?: unknown; status?: unknown; customerTrackingState?: unknown }
): boolean {
  if (!current) return true;
  // Tracking the backend already ended never reopens from a stale event or slow GET.
  if (
    bookingHasCompletedCustomerHandover(current) &&
    incoming.customerTrackingState !== undefined &&
    !bookingHasCompletedCustomerHandover(incoming)
  ) {
    return false;
  }
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
  bookings: unknown[] | null | undefined
): any | undefined {
  if (!bookings?.length) return undefined;
  const candidates = (bookings as any[]).filter(bookingShowsCustomerLiveTracker);
  if (!candidates.length) return undefined;
  const rankOf = (b: any) => {
    const ts = normTrackerStr(b?.serviceTrackingStage);
    if (ts && CUSTOMER_TRACKER_STAGE_RANK[ts] !== undefined) {
      return CUSTOMER_TRACKER_STAGE_RANK[ts] + 0.001;
    }
    return CUSTOMER_TRACKER_STATUS_FALLBACK_RANK[normTrackerStr(b?.status)] ?? 0;
  };
  const sorted = [...candidates].sort((a, b) => {
    const d = rankOf(b) - rankOf(a);
    if (d !== 0) return d;
    const tb = new Date(b?.serviceTrackingUpdatedAt || b?.updatedAt || b?.createdAt || 0).getTime();
    const ta = new Date(a?.serviceTrackingUpdatedAt || a?.updatedAt || a?.createdAt || 0).getTime();
    return tb - ta;
  });
  return sorted[0];
}
