import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertVerificationChecklistComplete,
  MINIMUM_RESERVATION_FEE,
  normalizeReservationAmount,
  reservationRemainingBalance,
} from '../services/reservationPayment.service.js';

test('reservation payments enforce the ₱500 backend minimum', () => {
  assert.equal(normalizeReservationAmount(undefined, 17999), MINIMUM_RESERVATION_FEE);
  assert.equal(normalizeReservationAmount(750, 17999), 750);
  assert.throws(
    () => normalizeReservationAmount(499.99, 17999),
    (error) => error.code === 'RESERVATION_PAYMENT_BELOW_MINIMUM' && error.status === 400
  );
});

test('reservation payment cannot exceed the service total', () => {
  assert.throws(
    () => normalizeReservationAmount(18000, 17999),
    (error) => error.code === 'RESERVATION_PAYMENT_EXCEEDS_TOTAL'
  );
});

test('all four Sales verification checks are enforced by the backend', () => {
  const complete = {
    amount: true,
    identity: true,
    timestamp: true,
    reference: true,
  };
  assert.deepEqual(assertVerificationChecklistComplete(complete), complete);
  assert.throws(
    () => assertVerificationChecklistComplete({ ...complete, reference: false }),
    (error) => error.code === 'PAYMENT_VERIFICATION_INCOMPLETE'
      && error.missingChecks.includes('reference')
  );
});

test('remaining balance subtracts the approved reservation exactly once', () => {
  assert.equal(reservationRemainingBalance({ totalPrice: 17999 }, 500), 17499);
});
