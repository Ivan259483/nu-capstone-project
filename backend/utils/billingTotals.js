/**
 * Billing totals — MUST match frontend/src/lib/billingTotals.ts logic.
 *
 * Order of operations:
 * 1) subtotal = sum(line.unitPrice * line.quantity)
 * 2) discount from subtotal (percent capped at subtotal, fixed capped at subtotal)
 * 3) taxableBase = max(0, subtotal - discountTotal)
 * 4) taxVatAmount applied as fixed peso on taxableBase (MVP)
 * 5) grandTotal = taxableBase + taxVatAmount + additionalFees
 * 6) balanceDue = max(0, grandTotal - downpayment)
 */

export function normalizeMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

export function computeLineSubtotal(lineItems = []) {
  return lineItems.reduce((sum, li) => {
    const p = normalizeMoney(li.unitPrice);
    const q = Math.max(1, Math.floor(Number(li.quantity)) || 1);
    return sum + p * q;
  }, 0);
}

export function computeDiscountAmount(subtotal, discount) {
  if (!discount || subtotal <= 0) return 0;
  const v = normalizeMoney(discount.value);
  if (v <= 0) return 0;
  if (discount.discountType === 'percent') {
    return Math.min(subtotal, Math.round((subtotal * v) / 100 * 100) / 100);
  }
  return Math.min(subtotal, v);
}

export function computeBillingTotals({
  lineItems = [],
  discount = { discountType: 'fixed', value: 0 },
  taxVatAmount = 0,
  additionalFees = 0,
  downpayment = 0,
}) {
  const subtotal = normalizeMoney(computeLineSubtotal(lineItems));
  const discountTotal = normalizeMoney(computeDiscountAmount(subtotal, discount));
  const taxableBase = Math.max(0, normalizeMoney(subtotal - discountTotal));
  const tax = normalizeMoney(taxVatAmount);
  const fees = normalizeMoney(additionalFees);
  const grandTotal = Math.max(0, normalizeMoney(taxableBase + tax + fees));
  const dp = normalizeMoney(downpayment);
  const balanceDue = Math.max(0, normalizeMoney(grandTotal - Math.min(dp, grandTotal)));

  return {
    subtotal,
    discountTotal,
    taxVatTotal: tax,
    additionalFeesTotal: fees,
    grandTotal,
    balanceDue,
  };
}

export function validateBillingInput(body) {
  const errors = [];
  if (!Array.isArray(body.lineItems)) errors.push('lineItems must be an array');
  return errors;
}
