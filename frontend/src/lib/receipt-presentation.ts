import type { DetailedReceipt } from "./receipt-document";

export type ReceiptSummaryRow = [label: string, amount: number, negative?: boolean];

// Shared wording and amounts for the HTML preview, print and PDF renderers.
export function receiptPresentation(receipt: DetailedReceipt) {
  if (receipt.receiptKind === "reservation_payment") {
    return {
      title: "Reservation Payment Receipt",
      eyebrow: "Payment Acknowledgement",
      rows: [["Reservation fee paid", receipt.total]] as ReceiptSummaryRow[],
      collectedLabel: "Total amount received",
      collectedAmount: receipt.total,
    };
  }
  const serviceTotal = Math.max(0, receipt.serviceTotal ??
    (receipt.subtotal - receipt.discount + receipt.tax + receipt.additionalFees));
  const rows: ReceiptSummaryRow[] = [
    ["Subtotal", receipt.subtotal],
    ["Discount", receipt.discount, true],
    ["VAT / Tax", receipt.tax],
  ];
  if (receipt.additionalFees) rows.push(["Additional Fees", receipt.additionalFees]);
  rows.push(["Service Total", serviceTotal]);
  if (receipt.reservationFee != null) {
    rows.push(["Reservation fee paid", receipt.reservationFee]);
    const other = Math.max(0, receipt.downpayment - receipt.reservationFee);
    if (other) rows.push(["Other prior payments", other]);
  } else if (receipt.downpayment > 0) {
    rows.push(["Prior payments", receipt.downpayment]);
  }
  rows.push([receipt.downpayment > 0 ? "Remaining balance paid" : "Service payment received", receipt.total]);
  return {
    title: receipt.receiptKind === "official_service" ? "Official Service Receipt" : "Official Receipt",
    eyebrow: "Payment Record",
    rows,
    collectedLabel: "Total amount received",
    collectedAmount: receipt.totalReceived ?? Math.round((receipt.downpayment + receipt.total) * 100) / 100,
  };
}
