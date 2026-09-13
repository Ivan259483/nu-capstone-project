import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  formatCustomerPaymentMethod,
  resolveCustomerPaymentState,
} from '../src/utils/customer-payment-state.ts';
import {
  CUSTOMER_TRACKER_STAGE_COUNT,
  CUSTOMER_TRACKER_UPCOMING_OPACITY,
  customerBookingIsReadyForPickup,
  customerTrackerHasOperationallyStarted,
  getCustomerBookingReference,
  getCustomerTrackerSummary,
  resolveCustomerTrackerStageIndex,
} from '../src/utils/customer-tracker-state.ts';

const confirmedBooking = {
  id: '507f1f77bcf86cd799439011',
  status: 'confirmed',
  serviceTrackingStage: 'confirmed',
  approvedAt: '2026-08-28T06:30:00.000Z',
  bookingReference: 'ASPF-260828-87AAEAD174',
  bookingDate: '2026-09-02',
  bookingTime: '08:00',
  serviceName: 'SPF 80 — Essential',
  serviceTotal: 8999,
  totalPrice: 12999,
  downPaymentAmount: 500,
  paymentStatus: 'partially_paid',
  paymentMethod: 'gcash',
  reservationPayment: {
    status: 'succeeded',
    amountSubmitted: 500,
    amountVerified: 500,
    method: 'gcash',
    reviewedAt: '2026-08-28T06:30:00.000Z',
  },
  vehicleYear: '2024',
  vehicleMake: 'Bentley',
  vehicleModel: 'Bentayga',
  vehiclePlate: 'ANKC231',
};

test('Sales-approved reservation remains appointment confirmed with exact historical amounts', () => {
  const payment = resolveCustomerPaymentState(confirmedBooking);

  assert.equal(payment.reservation, 'paid');
  assert.equal(payment.verifiedReservationAmount, 500);
  assert.equal(payment.totalAmount, 8999);
  assert.equal(payment.remainingAmount, 8499);
  assert.equal(payment.fullPayment, 'not_due');
  assert.equal(formatCustomerPaymentMethod(payment.reservationMethod), 'GCash');
});

test('confirmed tracker uses booking-stage semantics without service percentage or team telemetry', () => {
  const summary = getCustomerTrackerSummary(confirmedBooking);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.headerLabel, 'BOOKING TRACKING');
  assert.equal(summary.isLive, false);
  assert.equal(summary.stageNumber, 1);
  assert.equal(summary.stageCount, CUSTOMER_TRACKER_STAGE_COUNT);
  assert.equal(summary.stageLabel, 'Appointment Confirmed');
  assert.equal(summary.nextStageLabel, 'Vehicle Arrival');
  assert.equal(summary.stageDescription, 'Your reservation is verified and your appointment is secured.');
  assert.equal(summary.timePill?.label, 'Appointment');
  assert.equal(summary.timePill?.value, '8:00 AM');
  assert.doesNotMatch(serialized, /20%|service complete|QC team online|estimated/i);
});

test('media and fallback fields cannot override canonical confirmed stage', () => {
  const withArrivalPhotos = {
    ...confirmedBooking,
    status: 'received',
    customerStatus: 'ready',
    trackerStageMedia: Array.from({ length: 5 }, (_, index) => ({
      stage: 'received',
      slot: `angle-${index}`,
      photoUrl: `https://example.com/${index}.jpg`,
    })),
  };

  assert.equal(resolveCustomerTrackerStageIndex(withArrivalPhotos), 0);
  assert.equal(customerTrackerHasOperationallyStarted(withArrivalPhotos), false);
  assert.equal(customerBookingIsReadyForPickup(withArrivalPhotos), false);
});

test('backend received state activates Vehicle Arrived and Live Tracking', () => {
  const arrived = {
    ...confirmedBooking,
    status: 'received',
    serviceTrackingStage: 'received',
    serviceTrackingUpdatedAt: '2026-09-02T00:03:00.000Z',
  };
  const summary = getCustomerTrackerSummary(arrived);

  assert.equal(summary.headerLabel, 'LIVE TRACKING');
  assert.equal(summary.stageLabel, 'Vehicle Arrived');
  assert.equal(summary.nextStageLabel, 'Service In Progress');
  assert.equal(customerTrackerHasOperationallyStarted(arrived), true);
});

test('each authoritative backend stage resolves to its exact customer milestone', () => {
  const stages = [
    ['confirmed', 'confirmed', 0, 'Appointment Confirmed'],
    ['received', 'received', 1, 'Vehicle Arrived'],
    ['in_progress', 'in_progress', 2, 'Service In Progress'],
    ['quality_check', 'in_progress', 3, 'Quality Check'],
    ['ready_pickup', 'in_progress', 4, 'Ready for Pickup'],
  ];

  for (const [serviceTrackingStage, status, expectedIndex, expectedLabel] of stages) {
    const booking = { ...confirmedBooking, status, serviceTrackingStage };
    const summary = getCustomerTrackerSummary(booking);
    assert.equal(resolveCustomerTrackerStageIndex(booking), expectedIndex);
    assert.equal(summary.stageLabel, expectedLabel);
  }
});

test('coarse in-progress status cannot advance into Quality Check or Ready for Pickup', () => {
  const booking = {
    ...confirmedBooking,
    status: 'in_progress',
    serviceTrackingStage: undefined,
  };

  assert.equal(resolveCustomerTrackerStageIndex(booking), 2);
  assert.equal(getCustomerTrackerSummary(booking).stageLabel, 'Service In Progress');
});

test('tracker summary exposes stage count, never a fabricated service percentage', () => {
  const summary = getCustomerTrackerSummary(confirmedBooking);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.stageNumber, 1);
  assert.equal(summary.stageCount, 5);
  assert.doesNotMatch(serialized, /percent|progressPct|%/i);
});

test('TrackScreen has no dangling resolveStep reference and uses the canonical resolver', () => {
  const trackPath = fileURLToPath(new URL('../src/app/(customer)/track.tsx', import.meta.url));
  const source = readFileSync(trackPath, 'utf8');

  assert.doesNotMatch(source, /\bresolveStep\b/);
  assert.match(source, /resolveCustomerTrackerStageIndex\(booking\)/);
  assert.match(source, /export default function TrackScreen\(\)/);
  assert.match(source, /Stage \{stageNumber\} of \{CUSTOMER_TRACKER_STAGE_COUNT\}/);
  assert.doesNotMatch(source, /getTrackerPipelineProgressPct|% service complete|QC team online/);
});

test('customer tab and booking details still navigate to the Tracker route', () => {
  const layoutPath = fileURLToPath(new URL('../src/app/(customer)/_layout.tsx', import.meta.url));
  const detailsPath = fileURLToPath(new URL('../src/app/(screens)/booking-details.tsx', import.meta.url));
  const trackPath = fileURLToPath(new URL('../src/app/(customer)/track.tsx', import.meta.url));

  assert.equal(existsSync(trackPath), true);
  assert.match(readFileSync(layoutPath, 'utf8'), /Tabs\.Screen name="track"/);
  assert.match(readFileSync(detailsPath, 'utf8'), /pathname: '\/\(customer\)\/track'/);
});

test('future timeline stages retain readable upcoming visibility', () => {
  assert.ok(CUSTOMER_TRACKER_UPCOMING_OPACITY >= 0.55);
  assert.ok(CUSTOMER_TRACKER_UPCOMING_OPACITY <= 0.85);
});

test('customer-facing reference preserves the full booking reference and never falls back to Mongo id', () => {
  assert.equal(getCustomerBookingReference(confirmedBooking), 'ASPF-260828-87AAEAD174');
  assert.equal(
    getCustomerBookingReference({ ...confirmedBooking, bookingReference: undefined, orderNumber: undefined }),
    null,
  );
});
