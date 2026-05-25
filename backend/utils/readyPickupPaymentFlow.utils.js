import Billing from '../models/billing.model.js';
import { countGatePhotos, REQUIRED_GATE_PHOTOS } from './trackerGatePhotos.utils.js';
import { computeBillingTotals, normalizeMoney } from './billingTotals.js';
import { notifySalesBalancePickupQueue } from './bookingManagerNotifications.utils.js';

const DEFAULT_RESERVATION_FALLBACK = 500;

/** Billing.downpayment, else order.downPaymentAmount, else ₱500 (product default). */
export function effectiveReservationDownpayment(billing, order) {
  const fromBilling = billing ? normalizeMoney(billing.downpayment) : 0;
  if (fromBilling > 0) return fromBilling;
  const fromOrder = normalizeMoney(order?.downPaymentAmount);
  if (fromOrder > 0) return fromOrder;
  return DEFAULT_RESERVATION_FALLBACK;
}

/** Remaining balance due at POS for an order (same rules as pickup gate side effects). */
export async function computeOrderBalanceDue(order) {
  if (!order?._id) return 0;
  if (String(order.paymentStatus || '').toLowerCase() === 'paid') return 0;

  const billing = await Billing.findOne({ order: order._id });
  if (billing?.lineItems?.length) {
    const dp = effectiveReservationDownpayment(billing, order);
    const computed = computeBillingTotals({
      lineItems: billing.lineItems,
      discount: billing.discount || { discountType: 'fixed', value: 0 },
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: dp,
    });
    return Math.max(0, computed.balanceDue);
  }

  const grand = normalizeMoney(order.totalPrice || order.totalAmount || 0);
  if (grand <= 0) return 0;
  const dp = effectiveReservationDownpayment(billing, order);
  return Math.max(0, normalizeMoney(grand - Math.min(dp, grand)));
}

/**
 * When `ready_pickup` gate has 5/5 photos: advance `serviceTrackingStage` to `ready_pickup`,
 * and if unpaid with balance due, set `order.status` to `ready_for_payment`.
 * @returns {{ changed: boolean, enteredReadyForPayment: boolean, balanceDue: number }}
 */
export async function applyPickupGateCompleteSideEffects(order) {
  if (countGatePhotos(order, 'ready_pickup') < REQUIRED_GATE_PHOTOS) {
    return { changed: false, enteredReadyForPayment: false, balanceDue: 0 };
  }

  let changed = false;
  if (order.serviceTrackingStage !== 'ready_pickup') {
    order.serviceTrackingStage = 'ready_pickup';
    order.serviceTrackingUpdatedAt = new Date();
    changed = true;
  }

  if (order.paymentStatus === 'paid') {
    return { changed, enteredReadyForPayment: false, balanceDue: 0 };
  }

  const balanceDue = await computeOrderBalanceDue(order);
  let enteredReadyForPayment = false;

  if (balanceDue > 0 && order.status !== 'ready_for_payment') {
    order.status = 'ready_for_payment';
    changed = true;
    enteredReadyForPayment = true;
  }

  // Notify whenever order is in the POS balance queue (dedupe skips duplicates).
  if (balanceDue > 0 && order.status === 'ready_for_payment') {
    try {
      await notifySalesBalancePickupQueue(order, { balanceDue });
    } catch (ne) {
      console.warn('[readyPickup] Failed to notify sales balance pickup:', ne.message);
    }
  }

  return { changed, enteredReadyForPayment, balanceDue };
}

/** After deleting a gate photo: if pickup incomplete and order was awaiting POS pay, revert status. */
export function revertReadyForPaymentIfPickupIncomplete(order) {
  if (countGatePhotos(order, 'ready_pickup') >= REQUIRED_GATE_PHOTOS) return false;
  if (order.status !== 'ready_for_payment') return false;
  order.status = 'in_progress';
  return true;
}
