/**
 * Billing totals — MUST match backend/utils/billingTotals.js logic.
 *
 * 1) subtotal = sum(line.unitPrice * line.quantity)
 * 2) discount from subtotal (percent capped at subtotal, fixed capped at subtotal)
 * 3) taxableBase = max(0, subtotal - discountTotal)
 * 4) taxVatAmount as fixed peso
 * 5) grandTotal = taxableBase + taxVatAmount + additionalFees
 * 6) balanceDue = max(0, grandTotal - downpayment)
 */

export type BillingDiscount = {
  discountType?: 'fixed' | 'percent';
  value?: number;
  reason?: string;
};

export type BillingLineItem = {
  serviceId?: string | null;
  name: string;
  billingGroup?: 'ceramic_spf' | 'ppf' | 'other' | 'uncategorized';
  unitPrice: number;
  quantity?: number;
  vehicleTier?: string;
};

export type BillingComputed = {
  subtotal: number;
  discountTotal: number;
  taxVatTotal: number;
  additionalFeesTotal: number;
  grandTotal: number;
  balanceDue: number;
};

export function normalizeMoney(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

export function computeLineSubtotal(lineItems: BillingLineItem[] = []): number {
  return lineItems.reduce((sum, li) => {
    const p = normalizeMoney(li.unitPrice);
    const q = Math.max(1, Math.floor(Number(li.quantity)) || 1);
    return sum + p * q;
  }, 0);
}

export function computeDiscountAmount(subtotal: number, discount?: BillingDiscount | null): number {
  if (!discount || subtotal <= 0) return 0;
  const v = normalizeMoney(discount.value);
  if (v <= 0) return 0;
  if (discount.discountType === 'percent') {
    return Math.min(subtotal, Math.round((subtotal * v) / 100 * 100) / 100);
  }
  return Math.min(subtotal, v);
}

export function computeBillingTotals(params: {
  lineItems?: BillingLineItem[];
  discount?: BillingDiscount | null;
  taxVatAmount?: number;
  additionalFees?: number;
  downpayment?: number;
}): BillingComputed {
  const {
    lineItems = [],
    discount = { discountType: 'fixed', value: 0 },
    taxVatAmount = 0,
    additionalFees = 0,
    downpayment = 0,
  } = params;

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
