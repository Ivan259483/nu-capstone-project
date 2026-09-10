import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CUSTOMER_TRACKER_STAGE_ORDER,
  customerStageForOperationalGate,
  customerStepForOperationalGate,
  isForwardCustomerStageTransition,
  normalizeBookingStage,
  resolveCustomerTrackerStage,
} from '../src/lib/customer-tracker-stage.ts';
import { getLiveTrackerStepIndex } from '../src/lib/customer-live-tracker-step.ts';
import { getCustomerBookingJourneyPresentation } from '../src/lib/customer-booking-journey.ts';
import {
  getActiveGateIndexFromServiceStage,
  TRACKER_PIPELINE_GATE_STAGES,
} from '../src/lib/tracker-pipeline-progress.ts';

// Regression coverage for the QC <-> customer live tracker desync: the QC workspace read
// `serviceTrackingStage` as a *finished* gate and rendered the next one, so a booking stored as
// `in_progress` showed "QUALITY CHECK" to the Quality Checker while the customer was told
// "Service In Progress / 50% / step 3 of 5".

test('a booking in Quality Check is customer step 4 of 5 at 75%, never step 3 at 50%', () => {
  const booking = { serviceTrackingStage: 'quality_check', status: 'in_progress' };
  const resolved = resolveCustomerTrackerStage(booking);

  assert.equal(resolved.stage, 'quality_check');
  assert.equal(resolved.label, 'Quality Check');
  assert.equal(resolved.customerStep, 4);
  assert.equal(resolved.customerTotalSteps, 5);
  assert.equal(resolved.progress, 75);

  assert.notEqual(resolved.label, 'Service In Progress');
  assert.notEqual(resolved.customerStep, 3);
  assert.notEqual(resolved.progress, 50);
});

test('label, step and progress always come from the same stage', () => {
  const expected = [
    ['confirmed', 'Appointment Confirmed', 1, 0],
    ['received', 'Vehicle Arrived', 2, 25],
    ['in_progress', 'Service In Progress', 3, 50],
    ['quality_check', 'Quality Check', 4, 75],
    ['ready_pickup', 'Ready for Pickup', 5, 100],
  ] as const;

  for (const [stage, label, step, progress] of expected) {
    const resolved = resolveCustomerTrackerStage({ serviceTrackingStage: stage });
    assert.equal(resolved.stage, stage);
    assert.equal(resolved.label, label);
    assert.equal(resolved.customerStep, step);
    assert.equal(resolved.progress, progress);
  }
});

test('backend aliases for Quality Check all resolve to the one canonical stage', () => {
  for (const alias of ['quality_check', 'quality-check', 'QualityCheck', 'qc', 'qc_review', 'QUALITY_CHECK']) {
    assert.equal(
      normalizeBookingStage({ serviceTrackingStage: alias }),
      'quality_check',
      `alias ${alias} must normalize to quality_check`
    );
  }
});

test('every stage transition produces the expected customer stage', () => {
  const transitions = [
    ['confirmed', 'received', 'Vehicle Arrived', 25],
    ['received', 'in_progress', 'Service In Progress', 50],
    ['in_progress', 'quality_check', 'Quality Check', 75],
    ['quality_check', 'ready_pickup', 'Ready for Pickup', 100],
  ] as const;

  for (const [from, to, label, progress] of transitions) {
    const current = { serviceTrackingStage: from, status: 'in_progress' };
    const incoming = { serviceTrackingStage: to, status: 'in_progress' };
    assert.equal(isForwardCustomerStageTransition(current, incoming), true);

    const resolved = resolveCustomerTrackerStage(incoming);
    assert.equal(resolved.label, label);
    assert.equal(resolved.progress, progress);
  }
});

test('a stale Service In Progress event can never downgrade Quality Check', () => {
  const current = { serviceTrackingStage: 'quality_check', status: 'in_progress' };
  const stale = { serviceTrackingStage: 'in_progress', status: 'in_progress' };

  assert.equal(isForwardCustomerStageTransition(current, stale), false);

  const stagePatch = isForwardCustomerStageTransition(current, stale)
    ? null
    : { serviceTrackingStage: current.serviceTrackingStage, status: current.status };
  const merged = { ...stale, ...stagePatch };

  const resolved = resolveCustomerTrackerStage(merged);
  assert.equal(resolved.stage, 'quality_check');
  assert.equal(resolved.customerStep, 4);
  assert.equal(resolved.progress, 75);
});

test('incomplete QC requirements keep the booking at Quality Check — they never send it back to In Service', () => {
  // Plate unvalidated and the QC photo still missing gate the *advance out of* Quality Check.
  // They say nothing about which stage the vehicle is in.
  const booking = {
    serviceTrackingStage: 'quality_check',
    status: 'in_progress',
    trackerStageMedia: [],
    qcChecklist: [],
  };

  const resolved = resolveCustomerTrackerStage(booking);
  assert.equal(resolved.stage, 'quality_check');
  assert.equal(resolved.customerStep, 4);
  assert.equal(resolved.progress, 75);
});

test('the QC operational gate index is translated, never reused, as the customer step', () => {
  // QC runs four gates; the customer pipeline has five because Appointment Confirmed precedes
  // the vehicle reaching the shop.
  assert.equal(TRACKER_PIPELINE_GATE_STAGES.length, 4);
  assert.equal(CUSTOMER_TRACKER_STAGE_ORDER.length, 5);

  const operationalStep = TRACKER_PIPELINE_GATE_STAGES.indexOf('quality_check') + 1;
  assert.equal(operationalStep, 3, 'Quality Check is QC gate 3 of 4');
  assert.equal(customerStepForOperationalGate('quality_check'), 4, 'and customer step 4 of 5');
  assert.equal(customerStageForOperationalGate('quality_check'), 'quality_check');

  for (const gate of TRACKER_PIPELINE_GATE_STAGES) {
    assert.equal(
      customerStepForOperationalGate(gate),
      TRACKER_PIPELINE_GATE_STAGES.indexOf(gate) + 2,
      `${gate} customer step must be its operational step + 1`
    );
  }
});

test('the QC workspace opens the gate named by the persisted stage, not the one after it', () => {
  // The off-by-one that caused the desync: `in_progress` used to open the Quality Check gate.
  assert.equal(getActiveGateIndexFromServiceStage('received'), 0);
  assert.equal(getActiveGateIndexFromServiceStage('in_progress'), 1);
  assert.equal(getActiveGateIndexFromServiceStage('quality_check'), 2);
  assert.equal(getActiveGateIndexFromServiceStage('ready_pickup'), 3);
  assert.equal(getActiveGateIndexFromServiceStage('confirmed'), 0);
  assert.equal(getActiveGateIndexFromServiceStage(null), 0);

  for (const stage of TRACKER_PIPELINE_GATE_STAGES) {
    assert.equal(
      TRACKER_PIPELINE_GATE_STAGES[getActiveGateIndexFromServiceStage(stage)],
      stage,
      `${stage} must open its own gate in the QC workspace`
    );
  }
});

test('every customer surface reports the same position for a booking in Quality Check', () => {
  const booking = { serviceTrackingStage: 'quality_check', status: 'in_progress' } as any;

  // Live Tracker page rows carry one extra pre-arrival row ahead of the five stages.
  assert.equal(getLiveTrackerStepIndex(booking), 4);

  const journey = getCustomerBookingJourneyPresentation(booking);
  assert.equal(journey.progressIndex, 3, '0-based journey index for QC review');
  assert.equal(journey.stageSummaryLabel, 'Stage 4 of 5');
  assert.equal(journey.nextStepLabel, 'Pickup');
});

test('status alone still resolves a stage for rows QC has not written a fine stage on', () => {
  assert.equal(normalizeBookingStage({ status: 'received' }), 'received');
  assert.equal(normalizeBookingStage({ status: 'in_progress' }), 'in_progress');
  assert.equal(normalizeBookingStage({ status: 'ready_for_payment' }), 'ready_pickup');
  assert.equal(normalizeBookingStage({ status: 'confirmed' }), 'confirmed');
  // …and the fine stage always wins over the coarse status it is mapped onto.
  assert.equal(
    normalizeBookingStage({ serviceTrackingStage: 'quality_check', status: 'in_progress' }),
    'quality_check'
  );
});
