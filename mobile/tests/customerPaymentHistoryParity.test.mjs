import assert from 'node:assert/strict';
import test from 'node:test';

import { paymentRecordSummary } from '../../frontend/src/lib/customer-payment-history.ts';
import { summarizePaymentHistory } from '../src/utils/customer-payment-history.ts';

// Fixture reproduces the three verified ledger rows from the AutoSPF+ Web
// Payment History reference screenshot (Sep 1 / Sep 5 / Sep 10, 2026):
//   Sep 10 — SPF 101 Flagship ALL-IN reservation fee, ₱500, GCash, paid
//   Sep 5  — SPF 80 Essential service balance, ₱8,499, Cash, paid
//   Sep 1  — SPF 80 Essential reservation fee, ₱500, GCash, paid
const ledgerRows = [
  {
    paymentId: 'p-sep10-reservation',
    transactionId: 'INV-SEP10-RES',
    transactionType: 'reservation_fee',
    paymentStatus: 'succeeded',
    amountSubmitted: 500,
    amountVerified: 500,
    signedAmount: 500,
    effectiveAt: '2026-09-10T05:14:00.000Z',
    submittedAt: '2026-09-10T05:10:00.000Z',
    createdAt: '2026-09-10T05:10:00.000Z',
    method: 'gcash',
    vehicleInfo: '2014 Acura Integra',
    vehiclePlate: 'NDJ29',
    services: [{ name: 'SPF 101 — Flagship ALL-IN' }],
    receiptAvailable: true,
    receiptNumber: 'RPR-INV-SEP10-RES',
  },
  {
    paymentId: 'p-sep5-service',
    transactionId: 'INV-SEP5-SVC',
    transactionType: 'service_balance',
    paymentStatus: 'succeeded',
    amountSubmitted: 8499,
    amountVerified: 8499,
    signedAmount: 8499,
    effectiveAt: '2026-09-05T03:00:00.000Z',
    submittedAt: '2026-09-05T03:00:00.000Z',
    createdAt: '2026-09-05T03:00:00.000Z',
    method: 'cash',
    vehicleInfo: '2024 Bentley Bentayga',
    vehiclePlate: 'ANKC231',
    services: [{ name: 'SPF 80 — Essential' }],
    receiptAvailable: true,
    receiptNumber: 'INV-A4-20260905-ABCDEF',
  },
  {
    paymentId: 'p-sep1-reservation',
    transactionId: 'INV-SEP1-RES',
    transactionType: 'reservation_fee',
    paymentStatus: 'succeeded',
    amountSubmitted: 500,
    amountVerified: 500,
    signedAmount: 500,
    effectiveAt: '2026-09-01T02:00:00.000Z',
    submittedAt: '2026-09-01T02:00:00.000Z',
    createdAt: '2026-09-01T02:00:00.000Z',
    method: 'gcash',
    vehicleInfo: '2024 Bentley Bentayga',
    vehiclePlate: 'ANKC231',
    services: [{ name: 'SPF 80 — Essential' }],
    receiptAvailable: true,
    receiptNumber: 'RPR-INV-SEP1-RES',
  },
];

// The unpaid ₱39,499 "Full Payment — Not Due Yet" balance on the Sep 10
// booking is never a Payment ledger row (nothing is verified yet), so it is
// intentionally absent from this fixture and must not appear in any total.

test('Web paymentRecordSummary matches the reference screenshot totals', () => {
  const { received, refunded } = paymentRecordSummary(ledgerRows);
  assert.equal(received, 9499);
  assert.equal(refunded, 0);
});

test('Mobile summarizePaymentHistory reconciles with Web for the same ledger rows', () => {
  const backendTotalPaid = ledgerRows.reduce((sum, row) => sum + row.signedAmount, 0);
  const summary = summarizePaymentHistory(ledgerRows, backendTotalPaid);

  assert.equal(summary.reservationCount, 2, 'two reservation_fee rows (Sep 1 + Sep 10)');
  assert.equal(summary.reservationTotal, 1000, '₱500 + ₱500 reservation fees');
  assert.equal(summary.servicePaymentTotal, 8499, 'Sep 5 service_balance only, never the Sep 10 booking total');
  assert.equal(summary.refunds, 0);
  assert.equal(summary.totalPaid, 9499, 'trusts the backend ledger total, matching Web exactly');
  assert.equal(summary.verifiedPaymentCount, 3);

  const webSummary = paymentRecordSummary(ledgerRows);
  assert.equal(summary.totalPaid, webSummary.received, 'Mobile total paid must equal Web total paid');
  assert.equal(summary.refunds, webSummary.refunded, 'Mobile refunds must equal Web refunds');
});

test('Mobile never double-counts a reservation fee into the full/service payment bucket', () => {
  // Regression guard for the ₱8,999-instead-of-₱8,499 bug: a booking-derived
  // aggregate used to add the entire booking totalPrice (which already
  // contains the reservation fee) on top of the reservation fee itself.
  const backendTotalPaid = ledgerRows.reduce((sum, row) => sum + row.signedAmount, 0);
  const summary = summarizePaymentHistory(ledgerRows, backendTotalPaid);
  assert.notEqual(summary.servicePaymentTotal, 8999);
  assert.equal(summary.reservationTotal + summary.servicePaymentTotal - summary.refunds, summary.totalPaid);
});
