import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveCustomerTrackingState } from '../../backend/constants/orderLifecycle.js';
import test from 'node:test';

import { getTrackerPipelineProgressPct as getWebProgress } from '../../frontend/src/lib/tracker-pipeline-progress.ts';
import { getTrackerPipelineProgressPct as getMobileProgress } from '../src/utils/tracker-pipeline-progress.ts';
import { isCustomerTrackerMediaStageReleased as isWebEvidenceReleased } from '../../frontend/src/lib/customer-tracker-evidence-release.ts';
import { isCustomerTrackerMediaStageReleased as isMobileEvidenceReleased } from '../src/utils/customer-tracker-evidence-release.ts';
import {
  bookingHasCompletedCustomerHandover as webHandoverComplete,
  bookingShowsCustomerLiveTracker as webShowsTracker,
  isForwardTrackerStageTransition as isWebForwardTransition,
} from '../../frontend/src/lib/customer-live-tracker-pick.ts';
import {
  bookingHasCompletedCustomerHandover as mobileHandoverComplete,
  bookingShowsCustomerLiveTracker as mobileShowsTracker,
  isForwardTrackerStageTransition as isMobileForwardTransition,
} from '../src/utils/customer-live-tracker-pick.ts';
import {
  resolveCustomerTrackerStage as resolveWebStage,
  customerStepForOperationalGate as webStepForGate,
} from '../../frontend/src/lib/customer-tracker-stage.ts';
import {
  resolveCustomerTrackerStage as resolveMobileStage,
  customerStepForOperationalGate as mobileStepForGate,
} from '../src/utils/customer-tracker-stage.ts';

const canonicalCases = [
  { label: 'Appointment Confirmed', input: { serviceTrackingStage: 'confirmed', status: 'confirmed' }, expected: 0 },
  { label: 'Vehicle Arrived', input: { serviceTrackingStage: 'received', status: 'received' }, expected: 25 },
  { label: 'Service In Progress', input: { serviceTrackingStage: 'in_progress', status: 'in_progress' }, expected: 50 },
  { label: 'Quality Check', input: { serviceTrackingStage: 'quality_check', status: 'in_progress' }, expected: 75 },
  { label: 'Ready for Pickup', input: { serviceTrackingStage: 'ready_pickup', status: 'in_progress' }, expected: 100 },
];

for (const { label, input, expected } of canonicalCases) {
  test(`${label} is ${expected}% in Web and Mobile`, () => {
    assert.equal(getWebProgress(input), expected);
    assert.equal(getMobileProgress(input), expected);
  });
}

test('status aliases and terminal states use safe canonical fallbacks', () => {
  const cases = [
    [{ status: 'approved' }, 0],
    [{ status: 'assigned' }, 0],
    [{ status: 'received' }, 25],
    [{ status: 'in-progress' }, 50],
    [{ status: 'ready-for-payment' }, 100],
    [{ status: 'completed' }, 100],
    [{ status: 'released' }, 100],
    [{ status: 'cancelled' }, 0],
    [{ status: 'rejected' }, 0],
    [{ status: 'unknown' }, 0],
    [{}, 0],
  ];

  for (const [input, expected] of cases) {
    assert.equal(getWebProgress(input), expected);
    assert.equal(getMobileProgress(input), expected);
  }
});

test('Mobile tracker does not impose a 20% floor on canonical progress', async () => {
  const trackerSource = await readFile(
    new URL('../src/app/(customer)/track.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(trackerSource, /Math\.max\(pipelinePct,\s*20\)/);
  // Progress now comes from the canonical stage resolver, which owns the 0/25/50/75/100 mapping.
  assert.match(trackerSource, /resolveCustomerTrackerStage\(booking\)\.progress/);
});

test('Mobile ring has no fixed decorative progress arc and explicitly hides zero-length arcs', async () => {
  const trackerSource = await readFile(
    new URL('../src/app/(customer)/track.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(trackerSource, /CIRCUMFERENCE \* 0\.18/);
  assert.match(trackerSource, /strokeDashoffset: CIRCUMFERENCE \* \(1 - normalizedProgress\)/);
  assert.match(trackerSource, /opacity: normalizedProgress <= 0 \? 0 : 1/);
  assert.equal(trackerSource.match(/animatedProps=\{animatedProps\}/g)?.length, 2);
});

test('Web and Mobile hide uploaded evidence until its official gate is released', () => {
  const uploadedButPending = {
    serviceTrackingStage: 'confirmed',
    status: 'confirmed',
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: 'https://media.example.test/pending-arrival.jpg' },
    ],
  };

  assert.equal(isWebEvidenceReleased(uploadedButPending, 'received'), false);
  assert.equal(isMobileEvidenceReleased(uploadedButPending, 'received'), false);
});

test('Web and Mobile expose released evidence and keep future-stage uploads hidden', () => {
  const currentArrivalGate = {
    serviceTrackingStage: 'received',
    status: 'received',
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: 'https://media.example.test/released-arrival.jpg' },
      { stage: 'in_progress', slot: 'front', photoUrl: 'https://media.example.test/pending-service.jpg' },
    ],
  };

  for (const isReleased of [isWebEvidenceReleased, isMobileEvidenceReleased]) {
    assert.equal(isReleased(currentArrivalGate, 'received'), true);
    assert.equal(isReleased(currentArrivalGate, 'in_progress'), false);
  }
});

test('Web and Mobile realtime patches never downgrade an already-advanced tracker stage', () => {
  const alreadyInProgress = { serviceTrackingStage: 'in_progress', status: 'in_progress' };

  for (const isForward of [isWebForwardTransition, isMobileForwardTransition]) {
    // A stale `arrived` event (older realtime message, or an out-of-order retry) must be rejected.
    assert.equal(isForward(alreadyInProgress, { serviceTrackingStage: 'received' }), false);
    // `status` alone regressing while `serviceTrackingStage` stays put doesn't change the
    // effective displayed stage (stage always wins over status), so it is not a regression.
    assert.equal(isForward(alreadyInProgress, { status: 'received' }), true);
    // But a stale event carrying *both* fields backwards together must still be rejected.
    assert.equal(
      isForward(alreadyInProgress, { serviceTrackingStage: 'received', status: 'received' }),
      false
    );
    // A genuine forward advance (or a repeat of the same stage) is always accepted.
    assert.equal(isForward(alreadyInProgress, { serviceTrackingStage: 'quality_check' }), true);
    assert.equal(isForward(alreadyInProgress, { serviceTrackingStage: 'in_progress' }), true);
    // Patches that don't touch stage/status (media, staff assignments) are never blocked.
    assert.equal(isForward(alreadyInProgress, {}), true);
    // No prior booking (first hydration) always accepts.
    assert.equal(isForward(null, { serviceTrackingStage: 'received' }), true);
  }
});

/** Row as the API sends it: stored fields plus the backend-resolved `customerTrackingState`. */
function withBackendTrackingState(row) {
  return { ...row, customerTrackingState: resolveCustomerTrackingState(row) };
}

test('Web and Mobile keep paid pickup visible until the backend ends tracking, then hide it', () => {
  // Paid but no receipt yet: the backend keeps tracking live.
  const paidAwaitingHandover = withBackendTrackingState({
    status: 'ready_for_payment',
    paymentStatus: 'paid',
    serviceTrackingStage: 'ready_pickup',
  });
  const released = withBackendTrackingState({
    ...paidAwaitingHandover,
    status: 'released',
    serviceTrackingStage: 'released',
  });
  assert.equal(paidAwaitingHandover.customerTrackingState, 'live');
  assert.equal(released.customerTrackingState, 'completed');

  for (const [handoverComplete, showsTracker] of [
    [webHandoverComplete, webShowsTracker],
    [mobileHandoverComplete, mobileShowsTracker],
  ]) {
    assert.equal(handoverComplete(paidAwaitingHandover), false);
    assert.equal(showsTracker(paidAwaitingHandover), true);
    assert.equal(handoverComplete(released), true);
    assert.equal(showsTracker(released), false);
  }
});

test('customer trackers no longer advance stages from photo existence', async () => {
  const [webDashboard, mobileTracker, webStep, webMedia, mobileMedia, mobileHomeRail] = await Promise.all([
    readFile(new URL('../../frontend/src/pages/CustomerDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(customer)/track.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/lib/customer-live-tracker-step.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/lib/customer-tracker-stage-media.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/customer-tracker-stage-media.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/customer-home-rail-step.ts', import.meta.url), 'utf8'),
  ]);

  for (const source of [webDashboard, mobileTracker, webStep, mobileHomeRail]) {
    assert.doesNotMatch(source, /bumpCustomerTrackerIndexFor/);
  }
  for (const source of [webMedia, mobileMedia]) {
    assert.match(source, /!isCustomerTrackerMediaStageReleased\(booking, stage\)/);
  }
});


// ── Canonical customer stage parity ──────────────────────────────────────────
// The label, the "step X of 5" and the percentage must be identical on Web and Mobile,
// and must all come from the same stage — a booking in Quality Check reads
// "Quality Check / step 4 of 5 / 75%" on every customer surface.
const canonicalStageCases = [
  { stage: 'confirmed', label: 'Appointment Confirmed', step: 1, progress: 0 },
  { stage: 'received', label: 'Vehicle Arrived', step: 2, progress: 25 },
  { stage: 'in_progress', label: 'Service In Progress', step: 3, progress: 50 },
  { stage: 'quality_check', label: 'Quality Check', step: 4, progress: 75 },
  { stage: 'ready_pickup', label: 'Ready for Pickup', step: 5, progress: 100 },
];

for (const { stage, label, step, progress } of canonicalStageCases) {
  test(`${label} resolves identically on Web and Mobile`, () => {
    const input = { serviceTrackingStage: stage, status: 'in_progress' };
    const web = resolveWebStage(input);
    const mobile = resolveMobileStage(input);

    assert.deepEqual(
      { stage: web.stage, label: web.label, step: web.customerStep, progress: web.progress },
      { stage, label, step, progress }
    );
    assert.deepEqual(
      { stage: mobile.stage, label: mobile.label, step: mobile.customerStep, progress: mobile.progress },
      { stage, label, step, progress }
    );
  });
}

test('the QC gate index is translated the same way on both platforms', () => {
  for (const gate of ['received', 'in_progress', 'quality_check', 'ready_pickup']) {
    assert.equal(webStepForGate(gate), mobileStepForGate(gate));
  }
  // QC gate 3 of 4 is customer step 4 of 5 — never customer step 3.
  assert.equal(webStepForGate('quality_check'), 4);
  assert.equal(mobileStepForGate('quality_check'), 4);
});

// ── Terminal close-out parity: Web and Mobile must agree ──────────────────────
// After the final POS balance settles on an order already at Ready for Pickup, the
// backend marks it completed. Both clients must stop treating it as an active job,
// on realtime events and on a cold load alike.

const SETTLED_TERMINAL_ROW = withBackendTrackingState({
  _id: 'order-kevin',
  status: 'completed',
  serviceTrackingStage: 'completed',
  customerStatus: 'completed',
  paymentStatus: 'paid',
  invoiceId: 'INV-20260912-426299',
});

// The reported bug: balance settled and receipt issued, stored status left at Ready for Pickup.
const SETTLED_STORED_AS_PICKUP_ROW = withBackendTrackingState({
  _id: 'order-kevin',
  status: 'ready_for_payment',
  serviceTrackingStage: 'ready_pickup',
  customerStatus: 'ready',
  paymentStatus: 'paid',
  invoiceId: 'INV-20260912-426299',
});

const READY_UNPAID_ROW = withBackendTrackingState({
  _id: 'order-kevin',
  status: 'ready_for_payment',
  serviceTrackingStage: 'ready_pickup',
  customerStatus: 'ready',
  paymentStatus: 'partially_paid',
});

test('settled pickup order is terminal on both Web and Mobile', () => {
  for (const row of [SETTLED_TERMINAL_ROW, SETTLED_STORED_AS_PICKUP_ROW]) {
    assert.equal(row.customerTrackingState, 'completed');
    assert.equal(webHandoverComplete(row), true);
    assert.equal(mobileHandoverComplete(row), true);
    assert.equal(webShowsTracker(row), false);
    assert.equal(mobileShowsTracker(row), false);
  }
  // Clients read only the backend field: the same row without it stays live on both.
  const withoutField = { ...SETTLED_STORED_AS_PICKUP_ROW, customerTrackingState: undefined };
  assert.equal(webHandoverComplete(withoutField), false);
  assert.equal(mobileHandoverComplete(withoutField), false);
});

test('unsettled Ready for Pickup stays active on both Web and Mobile', () => {
  assert.equal(webShowsTracker(READY_UNPAID_ROW), true);
  assert.equal(mobileShowsTracker(READY_UNPAID_ROW), true);
});

test('a stale ready_pickup event reopens the tracker on neither client', () => {
  const stale = { serviceTrackingStage: 'ready_pickup', status: 'ready_for_payment' };
  assert.equal(isWebForwardTransition(SETTLED_TERMINAL_ROW, stale), false);
  assert.equal(isMobileForwardTransition(SETTLED_TERMINAL_ROW, stale), false);
});
