import assert from "node:assert/strict";
import test from "node:test";
import { receiptPresentation } from "../src/lib/receipt-presentation.ts";
import {
  formatPaymentDate,
  paymentAmount,
  paymentRecordSummary,
  matchesPaymentSearch,
  officialReceiptFromCustomerPayment,
  receiptAvailabilityMessage,
  receiptCreditLines,
  paymentDate,
  paymentMethodLabel,
  paymentStatusDetails,
  paymentTypeLabel,
  type CustomerPaymentReceipt,
  type CustomerPaymentTransaction,
} from "../src/lib/customer-payment-history.ts";
const payment = (
  values: Partial<CustomerPaymentTransaction>,
): CustomerPaymentTransaction => ({
  paymentId: "payment",
  transactionId: "TRANSACTION-1",
  transactionType: "reservation_fee",
  paymentStatus: "pending",
  amountSubmitted: 500,
  amountVerified: 0,
  signedAmount: 0,
  effectiveAt: null,
  submittedAt: "2026-09-04T18:00:00Z",
  createdAt: "2026-08-01T00:00:00Z",
  method: "gcash",
  vehicleInfo: "",
  vehiclePlate: "",
  services: [],
  receiptAvailable: false,
  receiptNumber: null,
  ...values,
});
test("a pending submission stays under review and is never presented as paid", () => {
  const row = payment({});
  assert.equal(paymentStatusDetails(row).label, "Awaiting verification");
  assert.equal(paymentAmount(row), 500);
  assert.equal(paymentDate(row), row.submittedAt);
});
test("final balance uses verified amount and financial date rather than submitted amount", () => {
  const row = payment({
    transactionType: "service_balance",
    paymentStatus: "succeeded",
    amountSubmitted: 8999,
    amountVerified: 8499,
    signedAmount: 8499,
    effectiveAt: "2026-09-05T00:00:00Z",
  });
  assert.equal(paymentAmount(row), 8499);
  assert.equal(paymentStatusDetails(row).label, "Paid");
  assert.equal(paymentDate(row), row.effectiveAt);
  assert.equal(paymentTypeLabel(row.transactionType), "Service Balance");
  assert.equal(paymentTypeLabel("reservation_fee"), "Reservation Fee");
});
test("a succeeded refund remains a negative refund, not a paid purchase", () => {
  const row = payment({
    transactionType: "refund",
    paymentStatus: "succeeded",
    amountVerified: 100,
    signedAmount: -100,
    effectiveAt: "2026-09-05T00:00:00Z",
  });
  assert.equal(paymentStatusDetails(row).label, "Refunded");
  assert.equal(paymentAmount(row), -100);
});
test("unknown statuses and methods do not invent a successful cash payment", () => {
  assert.equal(
    paymentStatusDetails(payment({ paymentStatus: "unknown" })).label,
    "Not confirmed",
  );
  assert.equal(paymentMethodLabel("unknown"), "Not recorded");
});
test("dates use Philippine calendar days and missing dates stay missing", () => {
  assert.match(formatPaymentDate("2026-09-04T18:00:00Z"), /Sep 5, 2026/);
  assert.equal(formatPaymentDate(""), "Not recorded");
});

test("summary uses posted transaction amounts only and separates refunds", () => {
  const rows = [
    payment({ signedAmount: 500 }),
    payment({ signedAmount: 8499 }),
    payment({ signedAmount: -100, transactionType: "refund" }),
    payment({ amountSubmitted: 900 }),
  ];
  assert.deepEqual(paymentRecordSummary(rows), {
    received: 8999,
    refunded: 100,
  });
});
test("search finds vehicle, service, receipt and mixed search terms", () => {
  const row = payment({
    vehicleInfo: "2024 Bentley Bentayga",
    vehiclePlate: "ABC 1234",
    services: [{ name: "SPF 80 Essential" }],
    receiptNumber: "OR-2026-0091",
  });
  for (const query of [
    "bentley",
    "spf 80",
    "OR 2026 0091",
    "Bentayga Essential",
    "ABC 1234",
    "",
  ])
    assert.equal(matchesPaymentSearch(row, query), true, query);
  assert.equal(matchesPaymentSearch(row, "SPF 101"), false);
});
test("receipt availability explains recorded payments versus unverified attempts", () => {
  assert.equal(
    receiptAvailabilityMessage(payment({ paymentStatus: "succeeded" })).title,
    "Not yet issued",
  );
  assert.equal(
    receiptAvailabilityMessage(payment({ paymentStatus: "succeeded" })).detail,
    "Receipt is being prepared.",
  );
  assert.equal(
    receiptAvailabilityMessage(payment({})).detail,
    "Payment is still being verified.",
  );
  assert.equal(
    receiptAvailabilityMessage(payment({ paymentStatus: "failed" })).title,
    "No receipt",
  );
  assert.equal(
    receiptAvailabilityMessage(payment({ transactionType: "refund" })).title,
    "Refund record",
  );
});
test("a general prior credit is never renamed as a reservation fee", () => {
  const receipt = { priorPayments: 750, reservationFee: null } as Parameters<
    typeof receiptCreditLines
  >[0];
  assert.deepEqual(receiptCreditLines(receipt), [
    { label: "Prior payments", amount: 750 },
  ]);
  assert.deepEqual(receiptCreditLines({ ...receipt, reservationFee: 500 }), [
    { label: "Reservation fee", amount: 500 },
    { label: "Other prior payments", amount: 250 },
  ]);
});

test("customer receipt data maps into the shared official receipt contract", () => {
  const source: CustomerPaymentReceipt = {
    receiptNumber: "INV-1",
    transactionNumber: "PAY-1",
    transactionType: "service_balance",
    bookingReference: "ASPF-BOOKING-1",
    orderNumber: "ORDER-1",
    issuedAt: "2026-09-05T14:44:00Z",
    staffName: "Ivan",
    paymentDate: "2026-09-05T14:44:00Z",
    paymentMethod: "cash",
    paymentStatus: "succeeded",
    splitPayments: [],
    customer: { name: "Customer", email: "", phone: "09170000000" },
    vehicle: {
      description: "2024 Bentley Bentayga",
      plate: "ANKC231",
      color: "Black",
      classification: "SUV",
    },
    servicePackage: "SPF 80 — Essential",
    coverage: [],
    company: { name: "AutoSPF+", address: "", phone: "", email: "" },
    lineItems: [
      { name: "SPF 80 — Essential", quantity: 1, unitPrice: 8999, amount: 8999 },
    ],
    subtotal: 8999,
    discount: 0,
    tax: 0,
    additionalFees: 0,
    serviceTotal: 8999,
    priorPayments: 500,
    reservationFee: 500,
    totalPaid: 8499,
    balanceDue: 0,
  };
  const official = officialReceiptFromCustomerPayment(source);
  assert.equal(official.bookingReference, "ASPF-BOOKING-1");
  assert.equal(official.orderNumber, "ORDER-1");
  assert.equal(official.staffName, "Ivan");
  assert.equal(official.paymentMethod, "Cash");
  assert.equal(official.downpayment, 500);
  assert.equal(official.total, 8499);
  assert.equal(official.balanceDue, 0);
  assert.deepEqual(official.lineItems, [
    { name: "SPF 80 — Essential", qty: 1, unitPrice: 8999 },
  ]);
  const summary = receiptPresentation(official);
  assert.equal(summary.title, "Official Service Receipt");
  assert.ok(summary.rows.some(([label, amount]) => label === "Service Total" && amount === 8999));
  assert.ok(summary.rows.some(([label, amount]) => label === "Reservation fee paid" && amount === 500));
  assert.ok(summary.rows.some(([label, amount]) => label === "Remaining balance paid" && amount === 8499));
  assert.equal(summary.collectedAmount, 8999);

  const reservation = officialReceiptFromCustomerPayment({
    ...source,
    receiptNumber: "RPR-PAY-RESERVATION",
    transactionType: "reservation_fee",
    paymentMethod: "gcash",
    lineItems: [{ name: "Reservation Fee", quantity: 1, unitPrice: 500, amount: 500 }],
    subtotal: 500,
    serviceTotal: 500,
    priorPayments: 0,
    totalPaid: 500,
    totalReceived: 500,
  });
  const acknowledgement = receiptPresentation(reservation);
  assert.equal(acknowledgement.title, "Reservation Payment Receipt");
  assert.equal(reservation.paymentMethod, "GCash");
  assert.deepEqual(acknowledgement.rows, [["Reservation fee paid", 500]]);
  assert.equal(acknowledgement.collectedAmount, 500);

  const unknownCredit = receiptPresentation({ ...official, reservationFee: null });
  assert.ok(unknownCredit.rows.some(([label]) => label === "Prior payments"));
  assert.ok(!unknownCredit.rows.some(([label]) => label === "Reservation fee paid"));
});
