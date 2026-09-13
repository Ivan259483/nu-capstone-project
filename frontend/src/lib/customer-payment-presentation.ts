import type { CustomerTone } from './customer-booking-presentation';

type PaymentRecord = {
  status?: unknown; transactionType?: unknown; amountVerified?: unknown;
  amountSubmitted?: unknown; proofUrl?: string; proofImage?: string;
};
type PaymentInput = {
  status?: unknown; paymentStatus?: unknown; serviceTotal?: unknown; totalPrice?: unknown;
  totalAmount?: unknown; amountCollected?: unknown; remainingBalance?: unknown;
  downPaymentAmount?: unknown; finalPaymentAmount?: unknown; hasPaymentProof?: boolean;
  paymentProofUrl?: string; downpaymentProof?: string; invoiceId?: string;
  invoiceRecord?: { _id?: string; invoiceNumber?: string } | null;
  reservationPayment?: PaymentRecord | null; balancePayment?: PaymentRecord | null;
  latestPayment?: PaymentRecord | null;
};

export function customerMoney(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    if (typeof value === 'string' && !value.trim()) continue;
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return null;
}

export function sumCustomerAmounts(values: Array<number | null>): number | null {
  return values.some(value => value === null) ? null : values.reduce<number>((sum, value) => sum + value, 0);
}

const state = (value: unknown) => String(value || '').trim().toLowerCase().replace(/-/g, '_');
const succeeded = (payment?: PaymentRecord | null) => state(payment?.status) === 'succeeded';

export function getCustomerPaymentPresentation(booking: PaymentInput) {
  const latest = booking.latestPayment;
  const reservation = booking.reservationPayment || (state(latest?.transactionType) === 'reservation_fee' ? latest : null);
  const balance = booking.balancePayment || (latest?.transactionType && !['reservation_fee', 'refund'].includes(state(latest.transactionType)) ? latest : null);
  const paymentStatus = state(booking.paymentStatus);
  const refunded = paymentStatus === 'refunded';
  const failed = !refunded && (paymentStatus === 'failed' || ['rejected', 'failed', 'voided'].includes(state(reservation?.status)) || ['rejected', 'failed', 'voided'].includes(state(balance?.status)));
  const total = customerMoney(booking.serviceTotal, booking.totalPrice, booking.totalAmount);
  const reservationPaidAmount = refunded ? 0 : succeeded(reservation)
    ? customerMoney(reservation?.amountVerified, booking.downPaymentAmount)
    : reservation ? 0 : customerMoney(booking.downPaymentAmount);
  const finalPaymentAmount = succeeded(balance)
    ? customerMoney(balance?.amountVerified, booking.finalPaymentAmount)
    : balance ? 0 : customerMoney(booking.finalPaymentAmount);
  // The server's aggregate is net of refunds and already includes the reservation.
  const missingVerifiedAmount = (succeeded(reservation) && reservationPaidAmount === null)
    || (succeeded(balance) && finalPaymentAmount === null);
  const verifiedParts = refunded || missingVerifiedAmount ? null : reservationPaidAmount !== null || finalPaymentAmount !== null
    ? (reservationPaidAmount ?? 0) + (finalPaymentAmount ?? 0) : null;
  const paid = customerMoney(booking.amountCollected, verifiedParts);
  const remaining = customerMoney(booking.remainingBalance, total !== null && paid !== null ? Math.max(0, total - paid) : null);
  const fullyPaid = !refunded && !failed && remaining === 0 && (paymentStatus === 'paid' || (total !== null && total > 0 && paid !== null && paid >= total));
  const proofUrl = booking.paymentProofUrl || booking.downpaymentProof || reservation?.proofImage || reservation?.proofUrl || null;
  const reservationPaid = !refunded && (reservationPaidAmount ?? 0) > 0;
  const underReview = !refunded && !failed && !fullyPaid && !reservationPaid && (state(reservation?.status) === 'pending' || Boolean(proofUrl || booking.hasPaymentProof));
  const reservationAmount = customerMoney(succeeded(reservation) ? reservation?.amountVerified : null, reservation?.amountSubmitted, booking.downPaymentAmount);
  const balancePaid = fullyPaid;
  const progress = total === null || paid === null ? null : total === 0 ? (fullyPaid ? 100 : 0) : Math.min(100, Math.max(0, Math.round(paid / total * 100)));
  const tone: CustomerTone = refunded ? 'neutral' : failed ? 'danger' : fullyPaid ? 'success' : 'warning';
  const reservationTone: CustomerTone = refunded ? 'neutral' : failed ? 'danger' : reservationPaid ? 'success' : 'warning';
  return {
    total, paid, remaining, progress, refunded, failed, fullyPaid, reservationPaid,
    reservationPaidAmount, reservationAmount, finalPaymentAmount, balancePaid, underReview, proofUrl,
    tone, reservationTone,
    label: refunded ? 'Refunded' : failed ? 'Payment failed' : fullyPaid ? 'Fully paid' : underReview ? 'Under review' : 'Balance due',
    reservationLabel: refunded ? 'Refunded' : failed ? 'Not approved' : reservationPaid ? 'Paid' : underReview ? 'Under review' : 'Unpaid',
    balanceLabel: refunded ? 'Refunded' : failed ? 'Payment failed' : balancePaid ? 'Paid' : 'Due at shop',
    receiptAvailable: Boolean(booking.invoiceId || booking.invoiceRecord?._id || booking.invoiceRecord?.invoiceNumber),
  };
}
