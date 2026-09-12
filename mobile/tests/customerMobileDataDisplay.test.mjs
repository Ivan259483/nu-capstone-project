import assert from 'node:assert/strict';
import test from 'node:test';
import { getDisplaySavings, getPublishedServicePricePair } from '../src/utils/service-offer-pricing.ts';
import { getCustomerTrackerTimestamps, getCustomerTrackerTeam } from '../src/utils/customer-tracker-details.ts';
import { CUSTOMER_TRACKER_STEPS, resolveCustomerTrackerStage } from '../src/utils/customer-tracker-stage.ts';

test('SPF80 midsized outlier is suppressed without changing its catalog prices', () => {
  const service = { pricing: { midsized: { base: 7999, original: 18000 } } };
  assert.deepEqual(getPublishedServicePricePair(service, 'midsized'), {
    key: 'midsized', current: 7999, original: 18000, savings: null,
  });
  assert.equal(service.pricing.midsized.original, 18000);
});

test('original and current come from the selected pricing category', () => {
  const service = { pricing: { sedan: { base: 7999, original: 12000 }, midsized: { base: 7999, original: 18000 } } };
  assert.equal(getPublishedServicePricePair(service, 'sedan').savings, 4001);
});

test('starting offer pairs the cheapest current price with its own original', () => {
  const service = { pricing: { sedan: { base: 7000, original: 11000 }, suv: { base: 8000, original: 9500 } } };
  assert.deepEqual(getPublishedServicePricePair(service, null), { key: 'sedan', current: 7000, original: 11000, savings: 4000 });
});

test('missing, zero, negative, nonfinite, reversed and excessive savings stay hidden', () => {
  for (const [current, original] of [[7999, null], [7999, undefined], [7999, ''], [7999, 0], [0, 18000], [-1, 18000], [7999, Infinity], [7999, 7999], [7999, 7000], [7999, 18000]]) {
    assert.equal(getDisplaySavings(current, original), null);
  }
  assert.equal(getPublishedServicePricePair({ pricing: { highend: { base: null, original: 20000 } } }, 'highend'), null);
});

test('every displayed saving obeys subtraction and both bounds', () => {
  for (const current of [7499, 7999, 8999, 12000]) {
    for (const original of [9000, 11000, 14000, 16000, 18000, 26000]) {
      const savings = getDisplaySavings(current, original);
      if (savings !== null) {
        assert.equal(savings, original - current);
        assert.ok(savings <= current && savings < original);
      }
    }
  }
});

test('shared mobile gates and canonical resolver agree at every stage', () => {
  assert.equal(CUSTOMER_TRACKER_STEPS.length, 5);
  for (const [i, gate] of CUSTOMER_TRACKER_STEPS.entries()) {
    const resolved = resolveCustomerTrackerStage({ serviceTrackingStage: gate.id });
    assert.equal(resolved.stageIndex, i);
    assert.equal(resolved.customerTotalSteps, CUSTOMER_TRACKER_STEPS.length);
    assert.equal(resolved.label, gate.label);
  }
  assert.equal(resolveCustomerTrackerStage({ status: 'ready_for_payment' }).progress, 100);
});

test('Sales handoff replaces stale technician/QC assignment', () => {
  const order = { status: 'ready_for_payment', assignedDetailer: { name: 'Old technician' }, serviceStaffAssignments: [{ name: 'QC person', role: 'quality_checker' }] };
  assert.equal(getCustomerTrackerTeam(order, 'ready_pickup'), 'Sales');
  order.serviceStaffAssignments.push({ name: 'Assigned sales rep', role: 'sales' });
  assert.equal(getCustomerTrackerTeam(order, 'ready_pickup'), 'Sales · Assigned sales rep');
});

test('QC and active service show their current roles without claiming online presence', () => {
  assert.equal(getCustomerTrackerTeam({ status: 'in_progress', assignedDetailer: { name: 'Technician' } }, 'quality_check'), 'Quality Check');
  assert.equal(getCustomerTrackerTeam({ status: 'in_progress', assignedDetailer: { name: 'Technician' } }, 'in_progress'), 'Technician');
  assert.equal(getCustomerTrackerTeam({ status: 'confirmed' }, 'confirmed'), 'Assignment pending');
});

test('timeline uses stage timestamps and readiness rather than payment/update times', () => {
  const approved = '2026-09-12T00:00:00.000Z';
  const arrived = '2026-09-12T00:30:00.000Z';
  const started = '2026-09-12T01:00:00.000Z';
  const qc = '2026-09-12T06:30:00.000Z';
  const ready = '2026-09-12T07:15:00.000Z';
  assert.deepEqual(getCustomerTrackerTimestamps({ status: 'ready_for_payment', approvedAt: approved, jobOrder: { ingressDateTime: arrived }, qcCompletedAt: qc, readyForPaymentAt: ready, paidAt: '2026-09-12T10:00:00.000Z', updatedAt: '2026-09-12T11:00:00.000Z', trackerStageMedia: [{ stage: 'in_progress', uploadedAt: started }] }), [approved, arrived, started, qc, ready]);
});

test('missing stage timestamps remain absent instead of inventing repeated timestamps', () => {
  assert.deepEqual(getCustomerTrackerTimestamps({ status: 'confirmed', updatedAt: '2026-09-12T11:00:00.000Z', trackerStageMedia: [{ stage: 'in_progress', uploadedAt: 'invalid' }] }), ['', '', '', '', '']);
});
