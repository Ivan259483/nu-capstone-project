import assert from 'node:assert/strict';
import test from 'node:test';

import { getCustomerBookingJourneyPresentation } from '../src/lib/customer-booking-journey.ts';

test('payment proof awaiting Sales review does not start the service journey', () => {
  const state = getCustomerBookingJourneyPresentation({
    status: 'pending_confirmation',
    paymentStatus: 'unpaid',
    hasPaymentProof: true,
    reservationPayment: { status: 'pending', submittedAt: '2026-08-30T08:00:00.000Z' },
  });

  assert.equal(state.statusLabel, 'Awaiting confirmation');
  assert.equal(state.paymentLabel, 'Reservation payment under review');
  assert.equal(state.progressIndex, null);
  assert.equal(state.stageSummaryLabel, 'Pending confirmation');
  assert.equal(state.nextStepLabel, 'Booking confirmation');
  assert.equal(state.journeyStarted, false);
  assert.equal(state.canTrackService, false);
});

test('pending booking ignores a stale confirmed tracker stage', () => {
  const state = getCustomerBookingJourneyPresentation({
    status: 'pending_confirmation',
    serviceTrackingStage: 'confirmed',
    hasPaymentProof: true,
  });

  assert.equal(state.progressIndex, null);
  assert.equal(state.journeyStarted, false);
  assert.equal(state.canTrackService, false);
});

test('Sales-confirmed reservation starts at Confirmed with Arrived next', () => {
  const state = getCustomerBookingJourneyPresentation({
    status: 'confirmed',
    paymentStatus: 'partially_paid',
    serviceTrackingStage: 'confirmed',
    reservationPayment: { status: 'succeeded' },
  });

  assert.equal(state.statusLabel, 'Confirmed');
  assert.equal(state.paymentLabel, 'Reservation paid · balance due');
  assert.equal(state.progressIndex, 0);
  assert.equal(state.stageSummaryLabel, 'Stage 1 of 5');
  assert.equal(state.nextStepLabel, 'Arrived');
  assert.equal(state.journeyStarted, true);
  assert.equal(state.canTrackService, true);
});

test('authoritative tracker stage drives later journey presentation', () => {
  const state = getCustomerBookingJourneyPresentation({
    status: 'in_progress',
    paymentStatus: 'partially_paid',
    serviceTrackingStage: 'quality_check',
  });

  assert.equal(state.progressIndex, 3);
  assert.equal(state.stageSummaryLabel, 'Stage 4 of 5');
  assert.equal(state.nextStepLabel, 'Pickup');
  assert.equal(state.canTrackService, true);
});
