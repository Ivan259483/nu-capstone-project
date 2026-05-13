import Billing from '../models/billing.model.js';
import { countGatePhotos, REQUIRED_GATE_PHOTOS } from './trackerGatePhotos.utils.js';
import { computeBillingTotals, normalizeMoney } from './billingTotals.js';

const DEFAULT_RESERVATION_FALLBACK = 500;

/** Billing.downpayment, else order.downPaymentAmount, else ₱500 (product default). */
export function effectiveReservationDownpayment(billing, order) {
  const fromBilling = billing ? normalizeMoney(billing.downpayment) : 0;
  if (fromBilling > 0) return fromBilling;
  const fromOrder = normalizeMoney(order?.downPaymentAmount);
  if (fromOrder > 0) return fromOrder;
  return DEFAULT_RESERVATION_FALLBACK;
}

/**
 * When `ready_pickup` gate has 5/5 photos: advance `serviceTrackingStage` to `ready_pickup`,
 * and if unpaid with balance due, set `order.status` to `ready_for_payment`.
 * @returns {{ changed: boolean }}
 */
export async function applyPickupGateCompleteSideEffects(order) {
  if (countGatePhotos(order, 'ready_pickup') < REQUIRED_GATE_PHOTOS) {
    return { changed: false };
  }

  let changed = false;
  if (order.serviceTrackingStage !== 'ready_pickup') {
    order.serviceTrackingStage = 'ready_pickup';
    order.serviceTrackingUpdatedAt = new Date();
    changed = true;
  }

  if (order.paymentStatus === 'paid') {
    return { changed };
  }

  const billing = await Billing.findOne({ order: order._id });
  let balanceDue = 0;

  if (billing?.lineItems?.length) {
    const dp = effectiveReservationDownpayment(billing, order);
    const computed = computeBillingTotals({
      lineItems: billing.lineItems,
      discount: billing.discount || { discountType: 'fixed', value: 0 },
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: dp,
    });
    balanceDue = computed.balanceDue;
  } else {
    const grand = normalizeMoney(order.totalPrice || order.totalAmount || 0);
    if (grand > 0) {
      const dp = effectiveReservationDownpayment(billing, order);
      balanceDue = Math.max(0, normalizeMoney(grand - Math.min(dp, grand)));
    }
  }

  if (balanceDue > 0 && order.status !== 'ready_for_payment') {
    order.status = 'ready_for_payment';
    changed = true;
  }

  return { changed };
}

/** After deleting a gate photo: if pickup incomplete and order was awaiting POS pay, revert status. */
export function revertReadyForPaymentIfPickupIncomplete(order) {
  if (countGatePhotos(order, 'ready_pickup') >= REQUIRED_GATE_PHOTOS) return false;
  if (order.status !== 'ready_for_payment') return false;
  order.status = 'in_progress';
  return true;
}
