import type { DetailedReceipt } from "./receipt-document";

export interface CustomerPaymentTransaction {
  paymentId: string;
  transactionId: string;
  transactionType: string;
  paymentStatus: string;
  amountSubmitted: number;
  amountVerified: number;
  signedAmount: number;
  effectiveAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  method: string;
  vehicleInfo: string;
  vehiclePlate: string;
  services: { name: string }[];
  receiptAvailable: boolean;
  receiptNumber: string | null;
}

export interface CustomerPaymentReceipt {
  receiptKind?: "reservation_payment" | "official_service";
  receiptNumber: string;
  transactionNumber: string;
  transactionType: string;
  bookingReference?: string;
  orderNumber?: string;
  issuedAt?: string;
  staffName?: string;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus?: string;
  splitPayments: { method: string; amount: number }[];
  customer: { name: string; email: string; phone: string };
  vehicle: {
    description: string;
    plate: string;
    color: string;
    classification?: string;
  };
  servicePackage: string;
  coverage?: string[];
  company: { name: string; address: string; phone: string; email: string };
  lineItems: {
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  additionalFees: number;
  serviceTotal: number;
  priorPayments: number;
  /** Null means the historical credit cannot be identified as a reservation fee. */
  reservationFee?: number | null;
  totalPaid: number;
  totalReceived?: number;
  notes?: string;
  balanceDue?: number;
}

export function officialReceiptFromCustomerPayment(
  receipt: CustomerPaymentReceipt,
): DetailedReceipt {
  const balanceDue = Math.max(
    0,
    receipt.balanceDue ??
      receipt.serviceTotal - receipt.priorPayments - receipt.totalPaid,
  );
  return {
    receiptKind: receipt.receiptKind || (receipt.transactionType === "reservation_fee" ? "reservation_payment" : "official_service"),
    receiptNumber: receipt.receiptNumber,
    orderNumber: receipt.orderNumber,
    bookingReference: receipt.bookingReference,
    issuedAt: receipt.issuedAt || receipt.paymentDate,
    paidAt: receipt.paymentDate,
    staffName: receipt.staffName,
    customerName: receipt.customer.name,
    customerPhone: receipt.customer.phone,
    customerEmail: receipt.customer.email,
    vehiclePlate: receipt.vehicle.plate,
    vehicleInfo: receipt.vehicle.description,
    vehicleColor: receipt.vehicle.color,
    vehicleClass: receipt.vehicle.classification,
    lineItems: receipt.lineItems.map((line) => ({
      name: line.name,
      qty: line.quantity,
      unitPrice: line.unitPrice,
    })),
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    additionalFees: receipt.additionalFees,
    downpayment: receipt.priorPayments,
    reservationFee: receipt.reservationFee,
    totalReceived: receipt.totalReceived,
    notes: receipt.notes,
    serviceTotal: receipt.serviceTotal,
    total: receipt.totalPaid,
    balanceDue,
    paymentMethod: paymentMethodLabel(receipt.paymentMethod),
    paymentStatus: receipt.paymentStatus || "succeeded",
  };
}

export const paymentTypeLabel = (type: string) =>
  ({
    reservation_fee: "Reservation Fee",
    service_balance: "Service Balance",
    full_service_payment: "Full Service Payment",
    additional_charge: "Additional Charge Payment",
    refund: "Payment Refund",
  })[type] || "Payment";

export const paymentMethodLabel = (method: string) =>
  ({
    cash: "Cash",
    gcash: "GCash",
    maya: "Maya",
    card: "Card",
    split: "Split payment",
    bank_transfer: "Bank transfer",
    other: "Other",
  })[method] || "Not recorded";

export function paymentStatusDetails(payment: CustomerPaymentTransaction) {
  if (
    payment.transactionType === "refund" &&
    ["succeeded", "refunded"].includes(payment.paymentStatus)
  ) {
    return { label: "Refunded", tone: "refund", filter: "refunded" };
  }
  switch (payment.paymentStatus) {
    case "succeeded":
      return { label: "Paid", tone: "paid", filter: "paid" };
    case "pending":
      return {
        label: "Awaiting verification",
        tone: "pending",
        filter: "pending",
      };
    case "rejected":
      return { label: "Not verified", tone: "failed", filter: "failed" };
    case "failed":
      return { label: "Unsuccessful", tone: "failed", filter: "failed" };
    case "voided":
      return { label: "Cancelled payment", tone: "muted", filter: "failed" };
    case "refunded":
      return { label: "Refunded", tone: "refund", filter: "refunded" };
    case "partially_refunded":
      return {
        label: "Partially refunded",
        tone: "refund",
        filter: "refunded",
      };
    default:
      return { label: "Not confirmed", tone: "muted", filter: "pending" };
  }
}

export function receiptAvailabilityMessage(
  payment: CustomerPaymentTransaction,
) {
  if (payment.transactionType === "refund")
    return { title: "Refund record", detail: "No payment receipt issued." };
  if (payment.paymentStatus === "succeeded")
    return {
      title: "Not yet issued",
      detail: "Receipt is being prepared.",
    };
  if (["pending"].includes(payment.paymentStatus))
    return {
      title: "No receipt yet",
      detail: "Payment is still being verified.",
    };
  if (["failed", "rejected", "voided"].includes(payment.paymentStatus))
    return { title: "No receipt", detail: "This payment was not completed." };
  return {
    title: "No receipt on file",
    detail: "No official receipt is linked to this record.",
  };
}

export function paymentRecordSummary(
  transactions: CustomerPaymentTransaction[],
) {
  const totals = transactions.reduce(
    (summary, row) => {
      summary.received += Math.max(0, row.signedAmount);
      summary.refunded += Math.abs(Math.min(0, row.signedAmount));
      return summary;
    },
    { received: 0, refunded: 0 },
  );
  return {
    received: Math.round(totals.received * 100) / 100,
    refunded: Math.round(totals.refunded * 100) / 100,
  };
}

export function matchesPaymentSearch(
  payment: CustomerPaymentTransaction,
  query: string,
) {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const fields = [
    payment.transactionId,
    payment.receiptNumber,
    payment.vehicleInfo,
    payment.vehiclePlate,
    ...(payment.services || []).map((service) => service.name),
  ]
    .filter(Boolean)
    .map((value) => normalize(value));
  return normalize(query)
    .split(/\s+/)
    .every((word) => fields.some((field) => field.includes(word)));
}

export function receiptCreditLines(receipt: CustomerPaymentReceipt) {
  if (receipt.reservationFee == null)
    return receipt.priorPayments > 0
      ? [{ label: "Prior payments", amount: receipt.priorPayments }]
      : [];
  const other = Math.max(0, receipt.priorPayments - receipt.reservationFee);
  return [
    ...(receipt.reservationFee > 0
      ? [{ label: "Reservation fee", amount: receipt.reservationFee }]
      : []),
    ...(other > 0 ? [{ label: "Other prior payments", amount: other }] : []),
  ];
}

export const receiptPaymentCaption = (type: string) =>
  type === "service_balance"
    ? "Final balance · paid in this transaction"
    : type === "reservation_fee"
      ? "Reservation fee · paid in this transaction"
      : "Paid in this transaction";

export const paymentDate = (payment: CustomerPaymentTransaction) =>
  payment.effectiveAt || payment.submittedAt || payment.createdAt;

export const paymentAmount = (payment: CustomerPaymentTransaction) =>
  payment.effectiveAt ? payment.signedAmount : payment.amountSubmitted;

export const formatPaymentDate = (value: string, withTime = false) => {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? ({ hour: "numeric", minute: "2-digit" } as const) : {}),
  });
};

export const paymentMoney = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
