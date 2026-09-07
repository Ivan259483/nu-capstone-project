import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serviceHandoffState, formatHandoffTime } from '../src/lib/service-handoff.ts';
import { normalizeQueuedPickupOrder } from '../src/lib/pos-pickup-queue.ts';

test('pickup readiness alone does not imply that Sales owns a payment task', () => {
  assert.equal(serviceHandoffState({ serviceTrackingStage: 'ready_pickup', paymentStatus: 'unpaid' }), null);
  assert.equal(serviceHandoffState({ serviceTrackingStage: 'ready_pickup', paymentStatus: 'unpaid', posQueueStatus: 'balance_pickup_queue', readyForPickupEvidenceComplete: true }), 'payment');
});

test('confirmed payment enables customer handover and explicit release completes the workflow', () => {
  assert.equal(serviceHandoffState({ orderStatus: 'paid', serviceTrackingStage: 'ready_pickup', paymentStatus: 'paid', readyForPickupEvidenceComplete: true }), 'handover');
  assert.equal(serviceHandoffState({ orderStatus: 'in_progress', serviceTrackingStage: 'quality_check', paymentStatus: 'paid' }), null);
  assert.equal(serviceHandoffState({ orderStatus: 'released', serviceTrackingStage: 'released', paymentStatus: 'paid' }), 'completed');
});

test('queue card keeps the authoritative balance and actual assignment time', () => {
  const row = normalizeQueuedPickupOrder({ orderId: '123456789012345678901234', customerName: 'Test Customer', vehicleYear: '2024', vehicleMake: 'Toyota', vehicleModel: 'Vios', serviceType: 'SPF 80', remainingBalance: 0, totalAmount: 8999, bookingTime: '09:00', readyForPaymentAt: '2026-09-05T06:35:00.000Z', posQueueStatus: 'balance_pickup_queue', eligibilitySummary: { readyForFinalPayment: true } });
  assert.equal(row.remainingBalance, 0);
  assert.equal(row.vehicleLabel, '2024 Toyota Vios');
  assert.equal(row.servicePackage, 'SPF 80');
  assert.equal(row.qcComplete, true);
  assert.equal(row.paymentStatusLabel, 'Awaiting POS Payment');
  assert.equal(row.readyForPaymentAt, '2026-09-05T06:35:00.000Z');
  assert.match(formatHandoffTime(row.readyForPaymentAt), /2:35/);
  assert.equal(formatHandoffTime('invalid'), 'Not recorded');
  assert.equal(formatHandoffTime(null), 'Not recorded');
});
