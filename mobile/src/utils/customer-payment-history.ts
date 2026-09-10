/**
 * Customer payment history projections.
 *
 * GET /api/payments/my is the financial source of truth. These helpers only
 * format that ledger DTO for native presentation; they never infer paid
 * amounts from a booking status or price.
 */

import type { PaymentRecord } from '@/services/api/paymentService';

export type PaymentHistorySummary = {
  reservationCount: number;
  reservationTotal: number;
  servicePaymentTotal: number;
  refunds: number;
  totalPaid: number;
  verifiedPaymentCount: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const paymentTypeLabel = (type: string) =>
  ({
    reservation_fee: 'Reservation Fee',
    service_balance: 'Service Balance',
    full_service_payment: 'Full Service Payment',
    additional_charge: 'Additional Charge Payment',
    refund: 'Payment Refund',
  })[type] || 'Payment';

export const paymentMethodLabel = (method: string) =>
  ({
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Card',
    split: 'Split payment',
    bank_transfer: 'Bank transfer',
    other: 'Other',
  })[method] || 'Not recorded';

export const paymentStatusLabel = (payment: PaymentRecord) => {
  if (payment.transactionType === 'refund' && ['succeeded', 'refunded'].includes(payment.paymentStatus)) {
    return 'Refunded';
  }
  return ({
    succeeded: 'Paid',
    pending: 'Awaiting verification',
    rejected: 'Not verified',
    failed: 'Unsuccessful',
    voided: 'Cancelled payment',
    refunded: 'Refunded',
    partially_refunded: 'Refunded',
  })[payment.paymentStatus] || 'Not confirmed';
};

export const isVerifiedPositivePayment = (payment: PaymentRecord) =>
  payment.paymentStatus === 'succeeded' && payment.transactionType !== 'refund' && payment.signedAmount > 0;

export const paymentDisplayAmount = (payment: PaymentRecord) =>
  payment.effectiveAt ? payment.signedAmount : payment.amountSubmitted;

export function summarizePaymentHistory(
  payments: PaymentRecord[],
  backendTotalPaid: number,
): PaymentHistorySummary {
  const verified = payments.filter(isVerifiedPositivePayment);
  const reservationPayments = verified.filter((payment) => payment.transactionType === 'reservation_fee');
  const servicePayments = verified.filter((payment) =>
    ['service_balance', 'full_service_payment'].includes(payment.transactionType),
  );
  const refunds = payments
    .filter((payment) => payment.transactionType === 'refund' && payment.signedAmount < 0)
    .reduce((sum, payment) => sum + Math.abs(payment.signedAmount), 0);

  return {
    reservationCount: reservationPayments.length,
    reservationTotal: roundMoney(reservationPayments.reduce((sum, payment) => sum + payment.signedAmount, 0)),
    servicePaymentTotal: roundMoney(servicePayments.reduce((sum, payment) => sum + payment.signedAmount, 0)),
    refunds: roundMoney(refunds),
    totalPaid: roundMoney(Number(backendTotalPaid) || 0),
    verifiedPaymentCount: verified.length,
  };
}

export function sortPaymentsNewestFirst(payments: PaymentRecord[]): PaymentRecord[] {
  return [...payments].sort((left, right) => {
    const rightTime = new Date(right.effectiveAt || right.submittedAt || right.createdAt || 0).getTime();
    const leftTime = new Date(left.effectiveAt || left.submittedAt || left.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export const paymentEffectiveDate = (payment: PaymentRecord) =>
  payment.effectiveAt || payment.submittedAt || payment.createdAt || '';

export type PaymentDateFilter = 'all' | '30' | '365';

/** Epoch cutoff for a date-range filter; 0 means "no cutoff" (all time). */
export const paymentDateFilterCutoff = (filter: PaymentDateFilter) =>
  filter === 'all' ? 0 : Date.now() - Number(filter) * 86_400_000;

/** Mirrors web's `matchesPaymentSearch` (frontend/src/lib/customer-payment-history.ts) field-for-field. */
export function matchesPaymentSearch(payment: PaymentRecord, query: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const fields = [
    payment.transactionId,
    payment.receiptNumber,
    payment.vehicleInfo,
    payment.vehiclePlate,
    ...(payment.services || []).map((service) => service.name),
  ]
    .filter(Boolean)
    .map((value) => normalize(value as string));
  return normalize(query)
    .split(/\s+/)
    .every((word) => fields.some((field) => field.includes(word)));
}

export type PaymentFilterGroup = 'reservation' | 'service' | 'refund';

export const paymentFilterGroup = (payment: PaymentRecord): PaymentFilterGroup => {
  if (payment.transactionType === 'refund') return 'refund';
  if (payment.transactionType === 'reservation_fee') return 'reservation';
  return 'service';
};

/** Mirrors web's `receiptAvailabilityMessage`; same copy for the same unavailable reasons. */
export function receiptAvailabilityMessage(payment: PaymentRecord) {
  if (payment.transactionType === 'refund')
    return { title: 'Refund record', detail: 'No payment receipt issued.' };
  if (payment.paymentStatus === 'succeeded')
    return { title: 'Not yet issued', detail: 'Receipt is being prepared.' };
  if (payment.paymentStatus === 'pending')
    return { title: 'No receipt yet', detail: 'Payment is still being verified.' };
  if (['failed', 'rejected', 'voided'].includes(payment.paymentStatus))
    return { title: 'No receipt', detail: 'This payment was not completed.' };
  return { title: 'No receipt on file', detail: 'No official receipt is linked to this record.' };
}
