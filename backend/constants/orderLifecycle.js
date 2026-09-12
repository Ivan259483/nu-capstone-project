/**
 * Canonical terminal lifecycle values for an order.
 *
 * `completed` is the status QC step 7 already sets ("ready for invoice / release")
 * and is the same value the POS pickup flow now sets when the final balance settles
 * on an order that had reached Ready for Pickup. `released` is the explicit physical
 * handover. `cancelled` and `rejected` end the job without completing it.
 *
 * These sets are the single backend definition of "this order is done"; the customer
 * live tracker on Web and Mobile excludes exactly these from its active candidate set
 * (see `bookingHasCompletedCustomerHandover` in customer-live-tracker-pick.ts).
 */

/** Normalizes a status/stage value for comparison: lowercase, hyphens to underscores. */
export const normalizeLifecycleKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/-/g, '_');

export const TERMINAL_ORDER_STATUSES = new Set(['completed', 'released', 'cancelled', 'rejected']);

export const TERMINAL_TRACKING_STAGES = new Set(['completed', 'released']);

export const isTerminalOrderState = (order) => {
  if (!order) return false;
  return TERMINAL_ORDER_STATUSES.has(normalizeLifecycleKey(order.status))
    || TERMINAL_TRACKING_STAGES.has(normalizeLifecycleKey(order.serviceTrackingStage));
};
