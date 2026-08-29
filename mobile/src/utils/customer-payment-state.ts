import type { BookingRecord, CustomerPaymentTransaction } from '@/services/api/types';

export const CUSTOMER_RESERVATION_FEE = 500;

export type ReservationPaymentState = 'required' | 'verifying' | 'paid' | 'action_required';
export type FullPaymentState = 'not_due' | 'due' | 'verifying' | 'paid';
export type CustomerPaymentStateCode =
  | 'AWAITING_PAYMENT'
  | 'VERIFYING_PAYMENT'
  | 'PAYMENT_ACTION_REQUIRED'
  | 'RESERVATION_PAID'
  | 'FULL_PAYMENT_DUE'
  | 'FULL_PAYMENT_VERIFYING'
  | 'FULLY_PAID';

export type CustomerPaymentState = {
  code: CustomerPaymentStateCode;
  reservation: ReservationPaymentState;
  fullPayment: FullPaymentState;
  hasSubmittedReceipt: boolean;
  reservationAmount: number;
  verifiedReservationAmount: number;
  totalAmount: number;
  remainingAmount: number;
  reservationMethod: string;
  fullPaymentMethod: string;
  reservationReviewedAt: string | null;
  reservationReviewReason: string | null;
};

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function positiveMoney(...values: unknown[]): number {
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function transactionStatus(payment: CustomerPaymentTransaction | null | undefined): string {
  return norm(payment?.status);
}

export function resolveCustomerPaymentState(booking: BookingRecord): CustomerPaymentState {
  const status = norm(booking.status);
  const stage = norm(booking.serviceTrackingStage);
  const customerStatus = norm(booking.customerStatus);
  const orderPaymentStatus = norm(booking.paymentStatus);
  const reservationPayment = booking.reservationPayment;
  const balancePayment = booking.balancePayment;
  const reservationTransactionStatus = transactionStatus(reservationPayment);
  const balanceTransactionStatus = transactionStatus(balancePayment);

  const totalAmount = positiveMoney(booking.serviceTotal, booking.totalPrice, booking.totalAmount);
  const reservationAmount = positiveMoney(
    reservationPayment?.amountSubmitted,
    reservationPayment?.amount,
    CUSTOMER_RESERVATION_FEE,
  );
  const verifiedReservationAmount = positiveMoney(
    reservationPayment?.amountVerified,
    booking.downPaymentAmount,
  );
  const hasSubmittedReceipt = Boolean(
    booking.hasPaymentProof
    || booking.paymentProofUrl
    || booking.downpaymentProof
    || reservationPayment?.submittedAt
    || positiveMoney(reservationPayment?.amountSubmitted) > 0
  );

  const reservationPaid =
    reservationTransactionStatus === 'succeeded'
    || (
      Boolean(booking.approvedAt)
      && ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'paid', 'released'].includes(status)
    );
  const reservationRejected = reservationTransactionStatus === 'rejected' || status === 'rejected';

  let reservation: ReservationPaymentState;
  if (reservationPaid) reservation = 'paid';
  else if (reservationRejected) reservation = 'action_required';
  else if (reservationTransactionStatus === 'pending' || hasSubmittedReceipt) reservation = 'verifying';
  else reservation = 'required';

  const paidBalanceAmount = positiveMoney(
    balancePayment?.amountVerified,
    booking.finalPaymentAmount,
  );
  const expectedBalance = Math.max(0, totalAmount - (verifiedReservationAmount || reservationAmount));
  const fullPaymentPaid =
    orderPaymentStatus === 'paid'
    || (
      balanceTransactionStatus === 'succeeded'
      && (expectedBalance === 0 || paidBalanceAmount + 0.009 >= expectedBalance)
    );
  const fullPaymentVerifying =
    !fullPaymentPaid
    && balanceTransactionStatus === 'pending'
    && positiveMoney(balancePayment?.amountSubmitted, balancePayment?.amount) > 0;
  const fullPaymentDue =
    !fullPaymentPaid
    && !fullPaymentVerifying
    && (
      ['ready_for_payment', 'completed'].includes(status)
      || stage === 'ready_pickup'
      || customerStatus === 'ready'
    );

  const fullPayment: FullPaymentState = fullPaymentPaid
    ? 'paid'
    : fullPaymentVerifying
      ? 'verifying'
      : fullPaymentDue
        ? 'due'
        : 'not_due';

  let code: CustomerPaymentStateCode;
  if (reservation === 'action_required') code = 'PAYMENT_ACTION_REQUIRED';
  else if (reservation === 'required') code = 'AWAITING_PAYMENT';
  else if (reservation === 'verifying') code = 'VERIFYING_PAYMENT';
  else if (fullPayment === 'paid') code = 'FULLY_PAID';
  else if (fullPayment === 'verifying') code = 'FULL_PAYMENT_VERIFYING';
  else if (fullPayment === 'due') code = 'FULL_PAYMENT_DUE';
  else code = 'RESERVATION_PAID';

  return {
    code,
    reservation,
    fullPayment,
    hasSubmittedReceipt,
    reservationAmount,
    verifiedReservationAmount,
    totalAmount,
    remainingAmount: Math.max(0, totalAmount - (verifiedReservationAmount || reservationAmount)),
    reservationMethod: norm(reservationPayment?.method || booking.paymentMethod || 'gcash'),
    fullPaymentMethod: norm(balancePayment?.method || booking.paymentMethod || ''),
    reservationReviewedAt: reservationPayment?.reviewedAt || booking.approvedAt || null,
    reservationReviewReason: reservationPayment?.reviewReason || booking.rejectionReason || null,
  };
}
