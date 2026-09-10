import type { PaymentReceipt } from '@/services/api/paymentService';

export type ReceiptSummaryRow = { label: string; value: number; negative?: boolean; emphasize?: boolean };

export const formatPeso = (amount: number) =>
  `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatReceiptDateTime = (value?: string) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { date: '—', time: '—' };
  return {
    date: date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }),
    time: date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }),
  };
};

export const receiptPaymentMethodLabel = (method: string) =>
  ({
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Card',
    split: 'Split payment',
    bank_transfer: 'Bank transfer',
    other: 'Other',
  })[method] || 'Not recorded';

export const isPaidReceiptStatus = (status?: string) =>
  ['paid', 'succeeded', 'completed', 'success'].includes(String(status || '').trim().toLowerCase());

export const receiptPaymentStatusLabel = (status?: string) =>
  isPaidReceiptStatus(status)
    ? 'Paid'
    : String(status || 'Pending').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Mirrors the web app's receiptPresentation() (frontend/src/lib/receipt-presentation.ts) so the
 * billing summary wording/amounts stay identical across web and mobile receipts.
 */
export function receiptPresentation(receipt: PaymentReceipt) {
  if (receipt.receiptKind === 'reservation_payment') {
    return {
      title: 'Reservation Payment Receipt',
      eyebrow: 'Payment Acknowledgement',
      rows: [{ label: 'Reservation fee paid', value: receipt.totalPaid }] as ReceiptSummaryRow[],
      collectedLabel: 'Total amount received',
      collectedAmount: receipt.totalPaid,
    };
  }

  const serviceTotal = Math.max(
    0,
    receipt.serviceTotal ?? receipt.subtotal - receipt.discount + receipt.tax + receipt.additionalFees,
  );
  const rows: ReceiptSummaryRow[] = [
    { label: 'Subtotal', value: receipt.subtotal },
    { label: 'Discount', value: receipt.discount, negative: true },
    { label: 'VAT / Tax', value: receipt.tax },
  ];
  if (receipt.additionalFees) rows.push({ label: 'Additional Fees', value: receipt.additionalFees });
  rows.push({ label: 'Service Total', value: serviceTotal, emphasize: true });

  if (receipt.reservationFee != null) {
    rows.push({ label: 'Reservation fee paid', value: receipt.reservationFee });
    const other = Math.max(0, receipt.priorPayments - receipt.reservationFee);
    if (other) rows.push({ label: 'Other prior payments', value: other });
  } else if (receipt.priorPayments > 0) {
    rows.push({ label: 'Prior payments', value: receipt.priorPayments });
  }
  rows.push({
    label: receipt.priorPayments > 0 ? 'Remaining balance paid' : 'Service payment received',
    value: receipt.totalPaid,
  });

  return {
    title: receipt.receiptKind === 'official_service' ? 'Official Service Receipt' : 'Official Receipt',
    eyebrow: 'Payment Record',
    rows,
    collectedLabel: 'Total amount received',
    collectedAmount: receipt.totalReceived ?? Math.round((receipt.priorPayments + receipt.totalPaid) * 100) / 100,
  };
}
