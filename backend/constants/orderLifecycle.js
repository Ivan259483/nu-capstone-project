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

/**
 * Customer live tracking state — the ONLY definition of "tracking is over" for the customer.
 *
 * Web dashboard, mobile Tracker tab and mobile Home hero read `customerTrackingState` from the
 * API/socket payload and never decide this themselves.
 *
 * Terminal rule: payment fully settled (`paymentStatus: paid`, which the ledger writes only when
 * no balance remains) AND a receipt issued (`invoiceId`) on an order that has reached Ready for
 * Pickup. The Ready-for-Pickup requirement exists because online payments may settle the full
 * amount up front; that must not end tracking before the vehicle is serviced. A physical release
 * is always terminal.
 */
export const CUSTOMER_TRACKING_STATES = Object.freeze({
  LIVE: 'live',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const CANCELLED_ORDER_STATUSES = new Set(['cancelled', 'rejected']);
const READY_FOR_PICKUP_OR_LATER_STAGES = new Set(['ready_pickup', 'completed', 'released']);
const READY_FOR_PICKUP_OR_LATER_STATUSES = new Set(['ready_for_payment', 'completed', 'released']);

export const isOrderPaymentSettledWithReceipt = (order) => Boolean(order)
  && normalizeLifecycleKey(order.paymentStatus) === 'paid'
  && String(order.invoiceId ?? '').trim().length > 0;

/** True when the persisted tracking session was closed for the customer. */
export const isPersistedLiveTrackingClosed = (order) => Boolean(order?.liveTracking)
  && (order.liveTracking.active === false || order.liveTracking.customerVisible === false);

export const resolveCustomerTrackingState = (order) => {
  if (!order) return CUSTOMER_TRACKING_STATES.LIVE;
  const status = normalizeLifecycleKey(order.status);
  const stage = normalizeLifecycleKey(order.serviceTrackingStage);
  if (CANCELLED_ORDER_STATUSES.has(status)) return CUSTOMER_TRACKING_STATES.CANCELLED;
  if (status === 'released' || stage === 'released') return CUSTOMER_TRACKING_STATES.COMPLETED;
  // Once closed, a session never reopens from a later status write.
  if (isPersistedLiveTrackingClosed(order)) return CUSTOMER_TRACKING_STATES.COMPLETED;
  const reachedReadyForPickup = READY_FOR_PICKUP_OR_LATER_STAGES.has(stage)
    || READY_FOR_PICKUP_OR_LATER_STATUSES.has(status);
  return reachedReadyForPickup && isOrderPaymentSettledWithReceipt(order)
    ? CUSTOMER_TRACKING_STATES.COMPLETED
    : CUSTOMER_TRACKING_STATES.LIVE;
};

export const LIVE_TRACKING_CLOSE_REASONS = Object.freeze({
  PAYMENT_SETTLED: 'payment_settled',
  RELEASED: 'released',
});

const toPlainLiveTracking = (value) => {
  if (!value) return null;
  const plain = typeof value.toObject === 'function' ? value.toObject() : value;
  return plain && typeof plain === 'object' ? plain : null;
};

/**
 * Customer-facing tracking session. Persisted rows report what was stored; legacy rows written
 * before `liveTracking` existed derive the same shape from the canonical state, so clients can
 * gate on `liveTracking.active && liveTracking.customerVisible` for every order.
 */
export const resolveLiveTrackingSession = (order) => {
  const state = resolveCustomerTrackingState(order);
  const persisted = toPlainLiveTracking(order?.liveTracking);
  const open = state === CUSTOMER_TRACKING_STATES.LIVE;
  return {
    active: open && persisted?.active !== false,
    customerVisible: open && persisted?.customerVisible !== false,
    closedAt: open
      ? null
      : (persisted?.closedAt || order?.completedAt || order?.paidAt || order?.serviceTrackingUpdatedAt || null),
    closedReason: open ? null : (persisted?.closedReason || null),
  };
};

/**
 * The ONE write that ends a customer's live tracking session. Called by every path that can
 * settle or hand over an order (POS checkout, online balance payment, legacy final-payment and
 * release operations, and the backfill script).
 *
 * It acts only when the canonical rule says tracking is over, so an up-front full payment never
 * closes tracking before service. It only closes visibility: tracker stage media, QC evidence,
 * service steps, timeline and payments are never touched. Idempotent; returns true when it
 * changed the order.
 */
export const closeCustomerLiveTracking = (order, {
  reason = LIVE_TRACKING_CLOSE_REASONS.PAYMENT_SETTLED,
  closedBy = null,
  now = new Date(),
} = {}) => {
  if (!order) return false;
  if (resolveCustomerTrackingState(order) !== CUSTOMER_TRACKING_STATES.COMPLETED) return false;

  const before = JSON.stringify({
    status: order.status,
    serviceTrackingStage: order.serviceTrackingStage,
    completedAt: order.completedAt,
    customerStatus: order.customerStatus,
    liveTracking: toPlainLiveTracking(order.liveTracking),
  });

  const released = normalizeLifecycleKey(order.status) === 'released'
    || normalizeLifecycleKey(order.serviceTrackingStage) === 'released';
  if (!released) {
    order.status = 'completed';
    order.serviceTrackingStage = 'completed';
  }
  order.completedAt = order.completedAt || now;
  order.customerStatus = 'completed';

  const persisted = toPlainLiveTracking(order.liveTracking);
  order.liveTracking = {
    active: false,
    customerVisible: false,
    closedAt: persisted?.closedAt || now,
    closedReason: persisted?.closedReason || (released ? LIVE_TRACKING_CLOSE_REASONS.RELEASED : reason),
    closedBy: persisted?.closedBy || (closedBy ? String(closedBy) : null),
  };

  return before !== JSON.stringify({
    status: order.status,
    serviceTrackingStage: order.serviceTrackingStage,
    completedAt: order.completedAt,
    customerStatus: order.customerStatus,
    liveTracking: toPlainLiveTracking(order.liveTracking),
  });
};

/** Tracking lifecycle fields carried on every customer-facing order payload. */
export const buildCustomerTrackingLifecycle = (order) => {
  const state = resolveCustomerTrackingState(order);
  const completed = state === CUSTOMER_TRACKING_STATES.COMPLETED;
  const liveTracking = resolveLiveTrackingSession(order);
  return {
    customerTrackingState: state,
    customerTrackingLive: state === CUSTOMER_TRACKING_STATES.LIVE,
    customerTrackingCompletedAt: completed
      ? (order?.completedAt || liveTracking.closedAt || order?.paidAt || order?.serviceTrackingUpdatedAt || null)
      : null,
    customerReceiptInvoiceId: isOrderPaymentSettledWithReceipt(order) ? String(order.invoiceId).trim() : null,
    liveTracking,
  };
};
