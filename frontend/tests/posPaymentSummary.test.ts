import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePosPaymentDisplayTotals,
  posPaymentTotalsReconcile,
} from '../src/lib/pos-payment-summary.ts';

test('queued payment uses line-item subtotal when stale billing computed total is zero', () => {
  const staleBillingGrandTotal = 0;
  const totals = computePosPaymentDisplayTotals({
    lineItems: [{ price: 7_999, quantity: 1 }],
    amountPaid: 500,
  });

  assert.equal(staleBillingGrandTotal, 0);
  assert.equal(totals.originalTotal, 7_999);
  assert.equal(totals.expectedTotalDue, 7_499);
  assert.equal(posPaymentTotalsReconcile(totals.expectedTotalDue, 7_499), true);
});

test('line-item quantities are included before discounts and payments', () => {
  const totals = computePosPaymentDisplayTotals({
    lineItems: [
      { price: 1_000, quantity: 2 },
      { price: 999, quantity: 1 },
    ],
    discountTotal: 200,
    amountPaid: 500,
  });

  assert.deepEqual(totals, {
    originalTotal: 2_999,
    expectedTotalDue: 2_299,
  });
});

test('VAT and fees remain additions in the reconciled total due', () => {
  const totals = computePosPaymentDisplayTotals({
    lineItems: [{ price: 2_999, quantity: 1 }],
    discountTotal: 200,
    taxVatTotal: 100,
    additionalFeesTotal: 50,
    amountPaid: 500,
  });

  assert.equal(totals.originalTotal, 2_999);
  assert.equal(totals.expectedTotalDue, 2_449);
  assert.equal(posPaymentTotalsReconcile(totals.expectedTotalDue, 2_449), true);
  assert.equal(posPaymentTotalsReconcile(totals.expectedTotalDue, 2_450), false);
});
