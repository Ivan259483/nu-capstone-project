import { normalizeMoney } from './billingTotals.ts';

export type PosPaymentLineItem = {
  price: number;
  quantity?: number;
};

export type PosPaymentDisplayInput = {
  lineItems: PosPaymentLineItem[];
  discountTotal?: number;
  taxVatTotal?: number;
  additionalFeesTotal?: number;
  amountPaid?: number;
};

export type PosPaymentDisplayTotals = {
  originalTotal: number;
  expectedTotalDue: number;
};

/**
 * Customer-facing POS math. Original total is always the rendered cart's
 * pre-adjustment line-item sum; an empty/stale billing computed value must not
 * replace it.
 */
export function computePosPaymentDisplayTotals({
  lineItems,
  discountTotal = 0,
  taxVatTotal = 0,
  additionalFeesTotal = 0,
  amountPaid = 0,
}: PosPaymentDisplayInput): PosPaymentDisplayTotals {
  const originalTotal = normalizeMoney(
    lineItems.reduce((sum, item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity)) || 1);
      return sum + normalizeMoney(item.price) * quantity;
    }, 0)
  );
  const discount = Math.min(originalTotal, normalizeMoney(discountTotal));
  const expectedTotalDue = normalizeMoney(Math.max(
    0,
    originalTotal
      - discount
      + normalizeMoney(taxVatTotal)
      + normalizeMoney(additionalFeesTotal)
      - normalizeMoney(amountPaid)
  ));

  return { originalTotal, expectedTotalDue };
}

export function posPaymentTotalsReconcile(
  expectedTotalDue: number,
  authoritativeTotalDue: number
): boolean {
  return Math.abs(normalizeMoney(expectedTotalDue) - normalizeMoney(authoritativeTotalDue)) <= 0.009;
}
