import Order from '../models/order.model.js';
import Billing from '../models/billing.model.js';
import Payment from '../models/payment.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import {
  REQUIRED_READY_PICKUP_SLOTS,
  readyPickupSlotProgress,
} from './trackerGatePhotos.utils.js';
import { computeBillingTotals, normalizeMoney } from './billingTotals.js';
import { notifySalesBalancePickupQueue } from './bookingManagerNotifications.utils.js';
import { getIO } from './socket.utils.js';

const DEFAULT_RESERVATION_FALLBACK = 500;
const FINAL_ORDER_STATUSES = new Set(['released', 'completed', 'cancelled', 'rejected']);
const SAFE_CLEAR_STATUSES = new Set(['ready_for_payment']);

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || String(value || '');

const keyOf = (value) => String(value || '').trim().toLowerCase().replace(/-/g, '_');

const hasSave = (value) => value && typeof value.save === 'function';

const isRealCustomerBooking = (order) =>
  Boolean(
    order?.customer &&
    (order.bookingReference || (order.bookingDate && order.bookingTime))
  );

const isQcComplete = (order) => {
  const status = keyOf(order?.status);
  const stage = keyOf(order?.serviceTrackingStage);
  return Boolean(order?.qcCompletedAt)
    || stage === 'ready_pickup'
    || status === 'ready_for_payment';
};

const findOrder = async (orderOrId) => {
  if (hasSave(orderOrId)) return orderOrId;
  const id = idOf(orderOrId);
  if (!id) return null;
  return Order.findById(id);
};

/** Billing.downpayment, else order.downPaymentAmount, else optional legacy product default. */
export function effectiveReservationDownpayment(billing, order, { allowDefaultFallback = false } = {}) {
  const fromBilling = billing ? normalizeMoney(billing.downpayment) : 0;
  if (fromBilling > 0) return fromBilling;
  const fromOrder = normalizeMoney(order?.downPaymentAmount);
  if (fromOrder > 0) return fromOrder;
  return allowDefaultFallback ? DEFAULT_RESERVATION_FALLBACK : 0;
}

function financialTotalFromInvoice(invoiceRecord) {
  const snapshot = invoiceRecord?.snapshot || {};
  return normalizeMoney(
    snapshot?.payment?.grandTotal
    ?? snapshot?.computed?.grandTotal
    ?? snapshot?.grandTotal
    ?? snapshot?.totalAmount
    ?? 0
  );
}

function financialTotalFromOrder(order) {
  const explicit = normalizeMoney(order?.serviceTotal || order?.totalPrice || order?.totalAmount || 0);
  if (explicit > 0) return explicit;
  const subtotal = normalizeMoney(order?.subtotal);
  if (subtotal <= 0) return 0;
  return normalizeMoney(
    subtotal
    - normalizeMoney(order?.discountAmount)
    + normalizeMoney(order?.taxVatAmount)
    + normalizeMoney(order?.additionalFees)
  );
}

/**
 * Shared server-side financial state for POS queue and checkout guards.
 * Reads only persisted Order, Billing, Payment, and InvoiceRecord data.
 */
export async function computeOrderFinancialState(orderOrId) {
  const order = await findOrder(orderOrId);
  if (!order?._id) {
    return {
      order: null,
      billing: null,
      invoiceRecord: null,
      payments: [],
      totalAmount: 0,
      amountPaid: 0,
      finalPaymentsTotal: 0,
      downpaymentApplied: 0,
      remainingBalance: 0,
      billingStatus: null,
      checkedOutBilling: false,
      hasSucceededPayment: false,
      latestCheckoutReference: null,
    };
  }

  const [billing, payments, invoiceRecord] = await Promise.all([
    Billing.findOne({ order: order._id }),
    Payment.find({ order: order._id, status: 'succeeded' })
      .select('_id amount amountPaid downpayment grandTotal balanceRemaining status checkoutReference metadata createdAt')
      .sort({ createdAt: -1 }),
    InvoiceRecord.findOne({ order: order._id }).sort({ createdAt: -1 }),
  ]);

  let totalAmount = 0;
  let computed = null;
  const downpaymentApplied = effectiveReservationDownpayment(billing, order);

  if (billing?.lineItems?.length) {
    computed = computeBillingTotals({
      lineItems: billing.lineItems,
      discount: billing.discount || { discountType: 'fixed', value: 0 },
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: downpaymentApplied,
    });
    totalAmount = normalizeMoney(computed.grandTotal);
  }

  if (totalAmount <= 0) totalAmount = financialTotalFromInvoice(invoiceRecord);
  if (totalAmount <= 0) totalAmount = financialTotalFromOrder(order);

  const finalPaymentsTotal = normalizeMoney(
    payments.reduce((sum, payment) => sum + normalizeMoney(payment.amountPaid ?? payment.amount), 0)
  );
  const paidByRecords = normalizeMoney(downpaymentApplied + finalPaymentsTotal);
  const orderMarkedPaid = keyOf(order.paymentStatus) === 'paid';
  const amountPaid = orderMarkedPaid && totalAmount > paidByRecords
    ? totalAmount
    : paidByRecords;
  const remainingBalance = orderMarkedPaid
    ? 0
    : normalizeMoney(Math.max(0, totalAmount - amountPaid));

  return {
    order,
    billing,
    invoiceRecord,
    payments,
    totalAmount,
    amountPaid,
    finalPaymentsTotal,
    downpaymentApplied,
    remainingBalance,
    discount: billing?.discount || invoiceRecord?.snapshot?.discount || null,
    discountAmount: normalizeMoney(billing?.computed?.discountTotal ?? order.discountAmount),
    taxVatAmount: normalizeMoney(billing?.taxVatAmount ?? order.taxVatAmount),
    additionalFees: normalizeMoney(billing?.additionalFees ?? order.additionalFees),
    billingStatus: billing?.status || null,
    checkedOutBilling: billing?.status === 'checked_out',
    hasSucceededPayment: payments.length > 0,
    latestCheckoutReference:
      payments.find((payment) => payment.checkoutReference)?.checkoutReference
      || payments.find((payment) => payment.metadata?.checkoutReference)?.metadata?.checkoutReference
      || null,
    computed,
  };
}

/** Remaining balance due at POS for an order. */
export async function computeOrderBalanceDue(orderOrId) {
  const state = await computeOrderFinancialState(orderOrId);
  return state.remainingBalance;
}

export function emitPosQueueUpdated(order, result = {}) {
  try {
    const io = getIO();
    io.emit('pos:queue_updated', {
      orderId: idOf(order?._id || order),
      posQueueStatus: order?.posQueueStatus || null,
      status: order?.status || null,
      serviceTrackingStage: order?.serviceTrackingStage || null,
      paymentStatus: order?.paymentStatus || null,
      eligible: Boolean(result.eligible),
      reason: result.reason || null,
      remainingBalance: result.remainingBalance ?? null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[readyPickup] POS queue socket unavailable:', error.message);
  }
}

function clearQueueFields(order, { clearReadyForPaymentAt = false } = {}) {
  let changed = false;
  if (order.posQueueStatus) {
    order.posQueueStatus = null;
    changed = true;
  }
  if (order.readyForPickupEvidenceComplete) {
    order.readyForPickupEvidenceComplete = false;
    changed = true;
  }
  if (clearReadyForPaymentAt && order.readyForPaymentAt) {
    order.readyForPaymentAt = null;
    changed = true;
  }
  return changed;
}

function buildResult(overrides) {
  return {
    eligible: false,
    reason: 'unknown',
    readyPickupSlotCount: 0,
    missingSlots: [...REQUIRED_READY_PICKUP_SLOTS],
    remainingBalance: 0,
    queueStateChanged: false,
    eligibilitySummary: {},
    ...overrides,
  };
}

/**
 * Source of truth for POS Balance / Pickup Queue eligibility.
 *
 * @param {import('mongoose').Document|string} orderOrId
 * @param {{ persist?: boolean, emit?: boolean, notify?: boolean, debug?: boolean }} options
 */
export async function evaluateReadyForPickupQueueEligibility(orderOrId, options = {}) {
  const {
    persist = false,
    emit = false,
    notify = true,
    debug = process.env.POS_QUEUE_DEBUG === 'true',
  } = options;
  const order = await findOrder(orderOrId);
  if (!order?._id) return buildResult({ reason: 'order_not_found' });

  const before = {
    status: order.status || null,
    stage: order.serviceTrackingStage || null,
    posQueueStatus: order.posQueueStatus || null,
    evidenceComplete: Boolean(order.readyForPickupEvidenceComplete),
    readyForPaymentAt: order.readyForPaymentAt || null,
  };

  const slotProgress = readyPickupSlotProgress(order);
  const financial = await computeOrderFinancialState(order);
  const status = keyOf(order.status);
  const stage = keyOf(order.serviceTrackingStage);
  const paymentStatus = keyOf(order.paymentStatus);
  const finalized =
    FINAL_ORDER_STATUSES.has(status)
    || stage === 'released'
    || (paymentStatus === 'paid' && ['released', 'completed'].includes(status));

  let result;
  if (order.archived) {
    const changed = clearQueueFields(order, {
      clearReadyForPaymentAt: !financial.hasSucceededPayment && paymentStatus !== 'paid',
    });
    result = buildResult({ reason: 'archived', queueStateChanged: changed });
  } else if (finalized) {
    const changed = clearQueueFields(order, {
      clearReadyForPaymentAt: !financial.hasSucceededPayment && paymentStatus !== 'paid',
    });
    result = buildResult({
      reason: status === 'released' || stage === 'released' ? 'already_released' : 'already_finalized',
      queueStateChanged: changed,
    });
  } else if (!isRealCustomerBooking(order)) {
    result = buildResult({ reason: 'not_customer_booking' });
  } else if (!isQcComplete(order)) {
    result = buildResult({ reason: 'qc_not_complete' });
  } else if (!slotProgress.complete) {
    const changed = clearQueueFields(order, {
      clearReadyForPaymentAt: !financial.hasSucceededPayment && paymentStatus !== 'paid',
    });
    if (status === 'ready_for_payment' && SAFE_CLEAR_STATUSES.has(status)) {
      order.status = 'in_progress';
    }
    result = buildResult({
      reason: 'missing_ready_pickup_slots',
      readyPickupSlotCount: slotProgress.readyPickupSlotCount,
      missingSlots: slotProgress.missingSlots,
      remainingBalance: financial.remainingBalance,
      queueStateChanged: changed,
    });
  } else if (financial.checkedOutBilling) {
    const changed = clearQueueFields(order);
    result = buildResult({
      reason: 'already_checked_out',
      readyPickupSlotCount: slotProgress.readyPickupSlotCount,
      missingSlots: [],
      remainingBalance: financial.remainingBalance,
      queueStateChanged: changed,
    });
  } else if (paymentStatus === 'paid') {
    let changed = clearQueueFields(order);
    if (!order.readyForPickupEvidenceComplete) {
      order.readyForPickupEvidenceComplete = true;
      changed = true;
    }
    result = buildResult({
      reason: 'already_paid',
      readyPickupSlotCount: slotProgress.readyPickupSlotCount,
      missingSlots: [],
      remainingBalance: 0,
      queueStateChanged: changed,
    });
  } else if (financial.remainingBalance <= 0) {
    const changed = clearQueueFields(order, { clearReadyForPaymentAt: !financial.hasSucceededPayment });
    result = buildResult({
      reason: financial.totalAmount > 0 ? 'no_remaining_balance' : 'payment_pending_mismatch',
      readyPickupSlotCount: slotProgress.readyPickupSlotCount,
      missingSlots: [],
      remainingBalance: financial.remainingBalance,
      queueStateChanged: changed,
    });
  } else {
    let changed = false;
    if (order.serviceTrackingStage !== 'ready_pickup') {
      order.serviceTrackingStage = 'ready_pickup';
      order.serviceTrackingUpdatedAt = new Date();
      changed = true;
    }
    if (order.status !== 'ready_for_payment') {
      order.status = 'ready_for_payment';
      changed = true;
    }
    if (order.posQueueStatus !== 'balance_pickup_queue') {
      order.posQueueStatus = 'balance_pickup_queue';
      changed = true;
    }
    if (!order.readyForPickupEvidenceComplete) {
      order.readyForPickupEvidenceComplete = true;
      changed = true;
    }
    if (!order.readyForPaymentAt) {
      order.readyForPaymentAt = new Date();
      changed = true;
    }

    result = buildResult({
      eligible: true,
      reason: 'readyForFinalPayment',
      readyPickupSlotCount: slotProgress.readyPickupSlotCount,
      missingSlots: [],
      remainingBalance: financial.remainingBalance,
      queueStateChanged: changed,
      eligibilitySummary: {
        readyForFinalPayment: true,
        readyPickupEvidenceComplete: true,
        remainingBalanceDue: financial.remainingBalance,
      },
    });

    if (notify) {
      try {
        await notifySalesBalancePickupQueue(order, { balanceDue: financial.remainingBalance });
      } catch (error) {
        console.warn('[readyPickup] Failed to notify sales balance pickup:', error.message);
      }
    }
  }

  if (!result.eligibilitySummary) result.eligibilitySummary = {};
  result.readyPickupSlotCount = slotProgress.readyPickupSlotCount;
  result.missingSlots = result.missingSlots ?? slotProgress.missingSlots;
  result.remainingBalance = result.remainingBalance ?? financial.remainingBalance;
  result.eligibilitySummary = {
    readyForFinalPayment: Boolean(result.eligible),
    readyPickupEvidenceComplete: slotProgress.complete,
    remainingBalanceDue: financial.remainingBalance,
    ...result.eligibilitySummary,
  };

  const after = {
    status: order.status || null,
    stage: order.serviceTrackingStage || null,
    posQueueStatus: order.posQueueStatus || null,
    evidenceComplete: Boolean(order.readyForPickupEvidenceComplete),
    readyForPaymentAt: order.readyForPaymentAt || null,
  };
  result.queueStateChanged = result.queueStateChanged
    || JSON.stringify(before) !== JSON.stringify(after);

  if (persist && result.queueStateChanged) {
    await order.save({ validateBeforeSave: false });
  }
  if (emit && result.queueStateChanged) {
    emitPosQueueUpdated(order, result);
  }
  if (debug) {
    console.info('[readyPickup:evaluate]', {
      orderId: idOf(order._id),
      readyPickupSlotCount: slotProgress.readyPickupSlotCount,
      missingSlots: slotProgress.missingSlots,
      qcComplete: isQcComplete(order),
      paymentStatus: order.paymentStatus,
      totalAmount: financial.totalAmount,
      amountPaid: financial.amountPaid,
      remainingBalance: financial.remainingBalance,
      checkedOutBilling: financial.checkedOutBilling,
      result: result.reason,
      before,
      after,
    });
  }

  return result;
}

/**
 * When the Ready for Pickup gate becomes complete, advance into POS queue only
 * when the structured evaluator says it is eligible.
 */
export async function applyPickupGateCompleteSideEffects(order) {
  const result = await evaluateReadyForPickupQueueEligibility(order, {
    persist: false,
    emit: true,
    notify: true,
  });

  return {
    changed: result.queueStateChanged,
    enteredReadyForPayment: result.eligible && order.status === 'ready_for_payment',
    balanceDue: result.remainingBalance,
    result,
  };
}

/** After deleting a gate photo: re-evaluate and clear queue state if incomplete. */
export async function revertReadyForPaymentIfPickupIncomplete(order) {
  const result = await evaluateReadyForPickupQueueEligibility(order, {
    persist: false,
    emit: true,
    notify: false,
  });
  return result.queueStateChanged;
}

export function buildQueueReason(result) {
  if (result?.eligible) return 'readyForFinalPayment';
  return result?.reason || 'notEligible';
}
