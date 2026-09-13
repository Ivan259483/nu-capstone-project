import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bookingHasCompletedCustomerHandover,
  bookingShowsCustomerLiveTracker,
  isForwardTrackerStageTransition,
  pickCustomerLiveTrackerBooking,
  trackerStageRankOf,
} from '../src/lib/customer-live-tracker-pick.ts';
import { getTrackerPipelineProgressPct } from '../src/lib/tracker-pipeline-progress.ts';

// Regression coverage for the QC gate advance <-> customer live tracker sync bug:
// a slow/backup HTTP GET (initial load, 60s poll, or `orderUpdated`-triggered silent
// refetch) can resolve *after* the `booking:status` socket event already advanced the
// customer's local state. CustomerDashboard.tsx / CustomerLiveTrackerPage.tsx's fetch-merge
// helpers must apply the same `isForwardTrackerStageTransition` guard the socket-patch
// path already used, or the stale response silently regresses the tracker.

test('QC advance to Service In Progress (in_progress) is a forward transition from Vehicle Arrived (received)', () => {
  const current = { serviceTrackingStage: 'received', status: 'received' };
  const incoming = { serviceTrackingStage: 'in_progress', status: 'in_progress' };

  assert.equal(isForwardTrackerStageTransition(current, incoming), true);
  assert.equal(getTrackerPipelineProgressPct(current), 25);
  assert.equal(getTrackerPipelineProgressPct(incoming), 50);
});

test('a stale GET resolving after the socket update must not regress the merged stage', () => {
  // Simulates the exact race: the socket event already moved local state to in_progress,
  // then an in-flight GET issued *before* the QC write resolves late with old data.
  const current = { serviceTrackingStage: 'in_progress', status: 'in_progress' };
  const staleFetched = { serviceTrackingStage: 'received', status: 'received' };

  assert.equal(isForwardTrackerStageTransition(current, staleFetched), false);

  // This is the exact guard shape used in mergeBookingsPreservingTrackerMedia /
  // preserveExistingTrackerMedia / mergeTrackerMediaPayload after the fix.
  const stagePatch = isForwardTrackerStageTransition(current, staleFetched)
    ? null
    : { serviceTrackingStage: current.serviceTrackingStage, status: current.status };
  const merged = { ...staleFetched, ...stagePatch };

  assert.equal(merged.serviceTrackingStage, 'in_progress');
  assert.equal(merged.status, 'in_progress');
  assert.equal(getTrackerPipelineProgressPct(merged), 50);
});

test('a fresh GET that legitimately reflects further QC progress is still applied', () => {
  const current = { serviceTrackingStage: 'in_progress', status: 'in_progress' };
  const fresh = { serviceTrackingStage: 'quality_check', status: 'in_progress' };

  assert.equal(isForwardTrackerStageTransition(current, fresh), true);
  const stagePatch = isForwardTrackerStageTransition(current, fresh)
    ? null
    : { serviceTrackingStage: current.serviceTrackingStage, status: current.status };
  const merged = { ...fresh, ...stagePatch };

  assert.equal(merged.serviceTrackingStage, 'quality_check');
  assert.equal(getTrackerPipelineProgressPct(merged), 75);
});

test('trackerStageRankOf prefers serviceTrackingStage over status for booking-selection ranking', () => {
  // CustomerLiveTrackerPage's sortByLivePriority now ranks on this — same source the
  // Dashboard's pickCustomerLiveTrackerBooking already used — so both screens agree.
  const vehicleArrived = { serviceTrackingStage: 'received', status: 'received' };
  const serviceInProgress = { serviceTrackingStage: 'in_progress', status: 'in_progress' };

  assert.ok(trackerStageRankOf(serviceInProgress) > trackerStageRankOf(vehicleArrived));
});

test('full 4-gate pipeline progression is monotonic and matches the 25/50/75/100 mapping', () => {
  const stages = ['received', 'in_progress', 'quality_check', 'ready_pickup'];
  const expectedPct = [25, 50, 75, 100];
  let previous: { serviceTrackingStage?: string; status?: string } | null = null;

  stages.forEach((stage, index) => {
    const incoming = { serviceTrackingStage: stage, status: stage === 'ready_pickup' ? 'ready_for_payment' : stage };
    if (previous) {
      assert.equal(isForwardTrackerStageTransition(previous, incoming), true, `${previous.serviceTrackingStage} -> ${stage} must be forward`);
    }
    assert.equal(getTrackerPipelineProgressPct(incoming), expectedPct[index]);
    previous = incoming;
  });
});

test('paid Ready for Pickup remains live until QC completes customer handover', () => {
  const awaitingHandover = {
    id: 'paid-awaiting-handover',
    status: 'ready_for_payment',
    paymentStatus: 'paid',
    serviceTrackingStage: 'ready_pickup',
  };

  assert.equal(bookingHasCompletedCustomerHandover(awaitingHandover), false);
  assert.equal(bookingShowsCustomerLiveTracker(awaitingHandover), true);
  assert.equal(pickCustomerLiveTrackerBooking([awaitingHandover])?.id, awaitingHandover.id);
});

test('paid and released booking disappears from customer Live Tracker selection', () => {
  const released = {
    id: 'paid-and-released',
    status: 'released',
    paymentStatus: 'paid',
    serviceTrackingStage: 'released',
    customerTrackingState: 'completed',
  };

  assert.equal(bookingHasCompletedCustomerHandover(released), true);
  assert.equal(bookingShowsCustomerLiveTracker(released), false);
  assert.equal(pickCustomerLiveTrackerBooking([released]), undefined);
});

test('completed handover is terminal only when the backend reports customerTrackingState completed', () => {
  const awaitingPayment = {
    status: 'completed',
    paymentStatus: 'pending',
    serviceTrackingStage: 'completed',
    customerTrackingState: 'live',
  };
  const paidAndCompleted = {
    ...awaitingPayment,
    paymentStatus: 'paid',
    invoiceId: 'INV-1',
    customerTrackingState: 'completed',
  };

  assert.equal(bookingHasCompletedCustomerHandover(awaitingPayment), false);
  assert.equal(bookingShowsCustomerLiveTracker(awaitingPayment), true);
  assert.equal(bookingHasCompletedCustomerHandover(paidAndCompleted), true);
  assert.equal(bookingShowsCustomerLiveTracker(paidAndCompleted), false);
  // The client never infers "done" from status/payment fields: without the backend field it stays live.
  assert.equal(
    bookingHasCompletedCustomerHandover({ ...paidAndCompleted, customerTrackingState: undefined }),
    false
  );
});

// ── Terminal close-out of the customer live tracker ───────────────────────────
// AutoSPF+ collects the final POS balance only after the order reaches Ready for
// Pickup, so settling that balance completes the job. The backend writes
// status/serviceTrackingStage/customerStatus = 'completed' with paymentStatus = 'paid';
// every customer-facing surface must drop the order from active tracking on that,
// including on a cold load where there is no socket event to react to.

const READY_FOR_PICKUP_UNPAID = {
  _id: 'order-kevin',
  status: 'ready_for_payment',
  serviceTrackingStage: 'ready_pickup',
  customerStatus: 'ready',
  paymentStatus: 'partially_paid',
  customerTrackingState: 'live',
};

const SETTLED_TERMINAL = {
  _id: 'order-kevin',
  status: 'completed',
  serviceTrackingStage: 'completed',
  customerStatus: 'completed',
  paymentStatus: 'paid',
  invoiceId: 'INV-20260912-426299',
  customerTrackingState: 'completed',
};

// The reported bug: balance settled at POS and a receipt issued, but the stored status never
// advanced past Ready for Pickup. Only the backend's customerTrackingState can close it.
const SETTLED_STORED_AS_PICKUP = {
  _id: 'order-kevin',
  status: 'ready_for_payment',
  serviceTrackingStage: 'ready_pickup',
  customerStatus: 'ready',
  paymentStatus: 'paid',
  invoiceId: 'INV-20260912-426299',
  customerTrackingState: 'completed',
};

test('Ready for Pickup with an outstanding balance is still an active tracker job', () => {
  assert.equal(bookingHasCompletedCustomerHandover(READY_FOR_PICKUP_UNPAID), false);
  assert.equal(bookingShowsCustomerLiveTracker(READY_FOR_PICKUP_UNPAID), true);
  assert.equal(pickCustomerLiveTrackerBooking([READY_FOR_PICKUP_UNPAID])?._id, 'order-kevin');
});

test('final settlement closes the tracker and the picker returns nothing on a cold load', () => {
  assert.equal(bookingHasCompletedCustomerHandover(SETTLED_TERMINAL), true);
  assert.equal(bookingShowsCustomerLiveTracker(SETTLED_TERMINAL), false);
  // This is the hard-refresh / logout-login path: state comes only from the database
  // row, with no socket event in play, and it must still yield no active tracker.
  assert.equal(pickCustomerLiveTrackerBooking([SETTLED_TERMINAL]), undefined);
});

test('a settled order still stored as Ready for Pickup closes the tracker from customerTrackingState', () => {
  assert.equal(bookingHasCompletedCustomerHandover(SETTLED_STORED_AS_PICKUP), true);
  assert.equal(bookingShowsCustomerLiveTracker(SETTLED_STORED_AS_PICKUP), false);
  assert.equal(pickCustomerLiveTrackerBooking([SETTLED_STORED_AS_PICKUP]), undefined);
  // A stale event without the lifecycle field and a slow GET still saying "live" cannot reopen it.
  assert.equal(
    isForwardTrackerStageTransition(SETTLED_STORED_AS_PICKUP, { serviceTrackingStage: 'ready_pickup', customerTrackingState: 'live' }),
    false
  );
});

test('payment alone does not close the tracker while the job is still in the shop', () => {
  const paidButStillInQC = {
    _id: 'order-other',
    status: 'ready_for_payment',
    serviceTrackingStage: 'quality_check',
    customerStatus: 'ready',
    paymentStatus: 'paid',
    customerTrackingState: 'live',
  };
  assert.equal(bookingHasCompletedCustomerHandover(paidButStillInQC), false);
  assert.equal(bookingShowsCustomerLiveTracker(paidButStillInQC), true);
});

test('a stale ready_pickup event cannot reopen a completed order', () => {
  assert.equal(
    isForwardTrackerStageTransition(SETTLED_TERMINAL, {
      serviceTrackingStage: 'ready_pickup',
      status: 'ready_for_payment',
    }),
    false
  );
  assert.equal(trackerStageRankOf(SETTLED_TERMINAL) > trackerStageRankOf(READY_FOR_PICKUP_UNPAID), true);
});

test('a settled order never wins the picker over a genuinely active one', () => {
  const stillActive = {
    _id: 'order-active',
    status: 'in_progress',
    serviceTrackingStage: 'in_progress',
    paymentStatus: 'partially_paid',
    customerTrackingState: 'live',
  };
  assert.equal(pickCustomerLiveTrackerBooking([SETTLED_TERMINAL, stillActive])?._id, 'order-active');
  assert.equal(pickCustomerLiveTrackerBooking([SETTLED_STORED_AS_PICKUP, stillActive])?._id, 'order-active');
});
