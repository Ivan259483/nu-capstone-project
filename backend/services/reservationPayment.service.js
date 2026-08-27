import Payment from '../models/payment.model.js';
import { normalizeMoney } from '../utils/billingTotals.js';

export const MINIMUM_RESERVATION_FEE = 500;
export const REQUIRED_RESERVATION_CHECKS = ['amount', 'identity', 'timestamp', 'reference'];

export function normalizeReservationAmount(value, serviceTotal = null) {
  const amount = normalizeMoney(value ?? MINIMUM_RESERVATION_FEE);
  if (!Number.isFinite(amount) || amount < MINIMUM_RESERVATION_FEE) {
    const error = new Error(`Reservation payment must be at least ₱${MINIMUM_RESERVATION_FEE.toFixed(2)}.`);
    error.statusCode = 400;
    error.status = 400;
    error.code = 'RESERVATION_PAYMENT_BELOW_MINIMUM';
    throw error;
  }
  const total = normalizeMoney(serviceTotal);
  if (total > 0 && amount > total) {
    const error = new Error('Reservation payment cannot exceed the service total.');
    error.statusCode = 400;
    error.status = 400;
    error.code = 'RESERVATION_PAYMENT_EXCEEDS_TOTAL';
    throw error;
  }
  return amount;
}

export function normalizeVerificationChecklist(value = {}) {
  return Object.fromEntries(
    REQUIRED_RESERVATION_CHECKS.map((key) => [key, value?.[key] === true])
  );
}

export function assertVerificationChecklistComplete(value) {
  const checklist = normalizeVerificationChecklist(value);
  const missing = REQUIRED_RESERVATION_CHECKS.filter((key) => !checklist[key]);
  if (missing.length) {
    const error = new Error('Complete all required payment verification checks before approval.');
    error.statusCode = 400;
    error.status = 400;
    error.code = 'PAYMENT_VERIFICATION_INCOMPLETE';
    error.missingChecks = missing;
    throw error;
  }
  return checklist;
}

export function reservationInvoiceId(order) {
  const reference = String(order?.bookingReference || order?.orderNumber || order?._id || '')
    .trim()
    .replace(/[^a-z0-9-]/gi, '')
    .toUpperCase();
  return `RSV-${reference}`;
}

/**
 * One reservation transaction per booking. Retries update that record instead
 * of creating duplicates, while statusHistory retains every prior submission.
 */
export async function ensurePendingReservationPayment({
  order,
  amount,
  proofImage,
  paymentMethod = 'gcash',
  paymentReference = null,
  submittedBy = null,
  session = null,
}) {
  const submittedAmount = normalizeReservationAmount(
    amount,
    order?.serviceTotal || order?.totalPrice || order?.totalAmount
  );
  const query = { order: order._id, transactionType: 'reservation_fee' };
  const options = session ? { session } : {};
  let payment = await Payment.findOne(query, null, options);

  if (!payment) {
    try {
      payment = await Payment.create([{
        invoiceId: reservationInvoiceId(order),
        order: order._id,
        customer: order.customer,
        vehicle: order.vehicle || null,
        service: order.serviceId || null,
        amount: submittedAmount,
        amountSubmitted: submittedAmount,
        amountVerified: null,
        status: 'pending',
        transactionType: 'reservation_fee',
        method: paymentMethod,
        provider: 'customer_proof',
        paymentReference: paymentReference || null,
        proofImage,
        submittedAt: new Date(),
        metadata: {
          bookingId: String(order._id),
          bookingReference: order.bookingReference || order.orderNumber,
          submittedBy: submittedBy ? String(submittedBy) : null,
        },
        statusHistory: [{
          status: 'pending',
          amountSubmitted: submittedAmount,
          proofImage,
          changedAt: new Date(),
          changedBy: submittedBy || null,
        }],
      }], options).then((rows) => rows[0]);
      return payment;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      payment = await Payment.findOne(query, null, options);
    }
  }

  if (!payment) throw new Error('Unable to create reservation transaction.');
  if (payment.status === 'succeeded') return payment;

  payment.amount = submittedAmount;
  payment.amountSubmitted = submittedAmount;
  payment.amountVerified = null;
  payment.status = 'pending';
  payment.method = paymentMethod;
  payment.provider = 'customer_proof';
  payment.paymentReference = paymentReference || payment.paymentReference || null;
  payment.proofImage = proofImage;
  payment.submittedAt = new Date();
  payment.reviewedAt = null;
  payment.reviewedBy = null;
  payment.reviewReason = null;
  payment.verificationChecklist = normalizeVerificationChecklist();
  payment.statusHistory.push({
    status: 'pending',
    amountSubmitted: submittedAmount,
    proofImage,
    changedAt: new Date(),
    changedBy: submittedBy || null,
  });
  await payment.save(options);
  return payment;
}

export function reservationPaymentAmount(payment) {
  return normalizeMoney(payment?.amountSubmitted ?? payment?.amount);
}

export function reservationRemainingBalance(order, approvedAmount) {
  const total = normalizeMoney(order?.serviceTotal || order?.totalPrice || order?.totalAmount);
  return normalizeMoney(Math.max(0, total - normalizeMoney(approvedAmount)));
}
