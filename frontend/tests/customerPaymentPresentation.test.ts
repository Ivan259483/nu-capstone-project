import assert from 'node:assert/strict';
import test from 'node:test';
import { customerMoney, getCustomerPaymentPresentation as payment, sumCustomerAmounts } from '../src/lib/customer-payment-presentation.ts';
import { belongsToHistoryVehicle } from '../src/lib/customer-booking-presentation.ts';

test('uploaded proof contributes no verified money and remains under review', () => {
  const value = payment({ status: 'pending_confirmation', serviceTotal: 9000, amountCollected: 0, paymentStatus: 'unpaid', paymentProofUrl: 'https://example.test/proof.jpg', reservationPayment: { status: 'pending', amountSubmitted: 750 } });
  assert.equal(value.paid, 0);
  assert.equal(value.reservationPaidAmount, 0);
  assert.equal(value.reservationAmount, 750);
  assert.equal(value.remaining, 9000);
  assert.equal(value.reservationPaid, false);
  assert.equal(value.underReview, true);
  assert.equal(value.receiptAvailable, false);
});

test('reservation amounts come from verified data, never a fixed fee', () => {
  const value = payment({ status: 'confirmed', serviceTotal: 9000, amountCollected: 750, downPaymentAmount: 750, paymentStatus: 'partially_paid', reservationPayment: { status: 'succeeded', amountVerified: 750 } });
  assert.equal(value.paid, 750);
  assert.equal(value.reservationPaidAmount, 750);
  assert.equal(value.remaining, 8250);
  assert.equal(value.fullyPaid, false);
  assert.equal(value.label, 'Balance due');
});

test('aggregate collections already include the reservation', () => {
  const value = payment({ serviceTotal: 9000, amountCollected: 9000, downPaymentAmount: 750, finalPaymentAmount: 8250, paymentStatus: 'paid', reservationPayment: { status: 'succeeded', amountVerified: 750 }, balancePayment: { status: 'succeeded', amountVerified: 8250 } });
  assert.equal(value.paid, 9000);
  assert.equal(value.remaining, 0);
  assert.equal(value.progress, 100);
  assert.equal(value.fullyPaid, true);
});

test('completed service does not imply a fully paid balance or a receipt', () => {
  const value = payment({ status: 'completed', paymentStatus: 'partially_paid', serviceTotal: 9000, amountCollected: 750, downPaymentAmount: 750 });
  assert.equal(value.fullyPaid, false);
  assert.equal(value.remaining, 8250);
  assert.equal(value.receiptAvailable, false);
});

test('missing financial snapshots may use succeeded payment records', () => {
  const value = payment({ serviceTotal: 9000, reservationPayment: { status: 'succeeded', amountVerified: 750 }, balancePayment: { status: 'succeeded', amountVerified: 1000 } });
  assert.equal(value.paid, 1750);
  assert.equal(value.remaining, 7250);
});

test('pending balance payment is never counted as a collection', () => {
  const value = payment({ serviceTotal: 9000, reservationPayment: { status: 'succeeded', amountVerified: 750 }, balancePayment: { status: 'pending', amountSubmitted: 8250 } });
  assert.equal(value.paid, 750);
  assert.equal(value.remaining, 8250);
});

test('latest reservation payment is not counted a second time', () => {
  const value = payment({ serviceTotal: 9000, reservationPayment: { status: 'succeeded', amountVerified: 750 }, latestPayment: { transactionType: 'reservation_fee', status: 'succeeded', amountVerified: 750 } });
  assert.equal(value.paid, 750);
});

test('explicit net zero after refund outranks historical succeeded records', () => {
  const value = payment({ serviceTotal: 9000, amountCollected: 0, paymentStatus: 'refunded', reservationPayment: { status: 'succeeded', amountVerified: 750 } });
  assert.equal(value.paid, 0);
  assert.equal(value.label, 'Refunded');
  assert.equal(value.fullyPaid, false);
});

test('rejected and failed payments retain their true status', () => {
  for (const status of ['rejected', 'failed'] as const) {
    const value = payment({ serviceTotal: 9000, amountCollected: 0, hasPaymentProof: true, reservationPayment: { status, amountSubmitted: 750, amountVerified: 0 } });
    assert.equal(value.failed, true);
    assert.equal(value.underReview, false);
    assert.equal(value.reservationPaid, false);
    assert.equal(value.reservationPaidAmount, 0);
    assert.equal(value.tone, 'danger');
  }
});

test('unknown amounts stay unavailable and cannot produce complete summary totals', () => {
  const value = payment({ paymentProofUrl: 'https://example.test/proof.jpg' });
  assert.equal(value.total, null);
  assert.equal(value.paid, null);
  assert.equal(value.remaining, null);
  assert.equal(value.progress, null);
  assert.equal(value.reservationAmount, null);
  assert.equal(sumCustomerAmounts([750, null]), null);
  assert.equal(sumCustomerAmounts([]), 0);
});

test('zero totals and excess payments have bounded progress without inventing money', () => {
  assert.equal(payment({ serviceTotal: 0, amountCollected: 0, paymentStatus: 'paid' }).progress, 100);
  assert.equal(payment({ serviceTotal: 0, amountCollected: 0, paymentStatus: 'unpaid' }).fullyPaid, false);
  const excess = payment({ serviceTotal: 9000, amountCollected: 9500 });
  assert.equal(excess.paid, 9500);
  assert.equal(excess.progress, 100);
  assert.equal(excess.remaining, 0);
  assert.equal(customerMoney(null, '', false, -1, Infinity), null);
  assert.equal(customerMoney(0, 500), 0);
});

test('backend remaining balance and receipt evidence are preserved', () => {
  const value = payment({ serviceTotal: 9000, amountCollected: 750, remainingBalance: 8000, invoiceRecord: { _id: 'receipt-1' } });
  assert.equal(value.remaining, 8000);
  assert.equal(value.receiptAvailable, true);
});

test('vehicle history prefers identity and never matches all records for a missing plate', () => {
  assert.equal(belongsToHistoryVehicle({ vehicleId: 'v1' }, { id: 'v1' }), true);
  assert.equal(belongsToHistoryVehicle({ vehicleId: 'v2', vehiclePlate: 'ABC 123' }, { id: 'v1', plate: 'ABC123' }), false);
  assert.equal(belongsToHistoryVehicle({ vehiclePlate: 'ABC 123' }, { plate: 'abc-123' }), true);
  assert.equal(belongsToHistoryVehicle({}, {}), false);
  assert.equal(belongsToHistoryVehicle({ vehicleId: 'v1' }, { id: 'v2' }), false);
});

test('backend proofImage is available for viewing without recognizing a payment', () => {
  const value = payment({ reservationPayment: { status: 'pending', amountSubmitted: 750, proofImage: 'https://example.test/proof.jpg' } });
  assert.equal(value.proofUrl, 'https://example.test/proof.jpg');
  assert.equal(value.underReview, true);
  assert.equal(value.paid, 0);
});

test('incomplete verified amounts and missing refund snapshots stay unavailable', () => {
  assert.equal(payment({ serviceTotal: 9000, reservationPayment: { status: 'succeeded' }, balancePayment: { status: 'succeeded', amountVerified: 1000 } }).paid, null);
  assert.equal(payment({ paymentStatus: 'refunded', downPaymentAmount: 750, finalPaymentAmount: 8250 }).paid, null);
  assert.equal(payment({ reservationPayment: { status: 'succeeded', amountVerified: 0, amountSubmitted: 750 } }).reservationAmount, 0);
});

test('populated vehicle references use identity before plate matching', () => {
  assert.equal(belongsToHistoryVehicle({ vehicle: { _id: 'v1' } }, { _id: 'v1' }), true);
  assert.equal(belongsToHistoryVehicle({ vehicle: { _id: 'v2' }, vehiclePlate: 'ABC123' }, { _id: 'v1', plate: 'ABC123' }), false);
});
