import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET ||= "customer-payment-test-secret";
process.env.ENCRYPTION_KEY ||= "12345678901234567890123456789012";
const { resolveCustomerReceiptCoverage, resolveReceiptReservationFee, resolveReceiptPriorPayments } =
  await import("../utils/customerReceiptDetails.utils.js");
const { SPF_CATALOG_VERSION } = await import("../constants/spfPricing.js");
const { config } = await import("../config/environment.js");
const { default: User } = await import("../models/user.model.js");
const { default: Order } = await import("../models/order.model.js");
const { default: Payment } = await import("../models/payment.model.js");
const { default: InvoiceRecord } = await import(
  "../models/invoiceRecord.model.js"
);
const { default: paymentRoutes } = await import("../routes/payment.routes.js");
let mongo,
  server,
  baseUrl,
  customer,
  stranger,
  order,
  reservation,
  finalPayment,
  pending,
  refund;
const tokenFor = (user) =>
  jwt.sign(
    { id: String(user._id), role: user.role, otpVerified: true },
    config.jwtSecret,
    { expiresIn: "1h" },
  );
const request = async (path, user = customer) => {
  const response = await fetch(`${baseUrl}/api/payments${path}`, {
    headers: user ? { Authorization: `Bearer ${tokenFor(user)}` } : {},
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: "7.0.14",
    },
  });
  await mongoose.connect(mongo.getUri("customer-payment-history-test"));
  [customer, stranger] = await User.create([
    {
      name: "Receipt Test Customer",
      email: "receipt-customer@example.test",
      role: "customer",
      isActive: true,
      isVerified: true,
      status: "active",
    },
    {
      name: "Another Customer",
      email: "other-customer@example.test",
      role: "customer",
      isActive: true,
      isVerified: true,
      status: "active",
    },
  ]);
  order = await Order.create({
    orderNumber: "PAYMENT-HISTORY-1",
    customer: customer._id,
    customerName: customer.name,
    serviceType: "SPF 80 Essential",
    serviceTotal: 8999,
    totalPrice: 8999,
    vehicleYear: "2024",
    vehicleMake: "Bentley",
    vehicleModel: "Bentayga",
    vehiclePlate: "ABC 1234",
    status: "completed",
    paymentStatus: "paid",
  });
  const base = {
    order: order._id,
    customer: customer._id,
    provider: "test",
    status: "succeeded",
  };
  [reservation, finalPayment, pending, refund] = await Payment.create([
    {
      ...base,
      invoiceId: "TEST-RESERVATION-1",
      transactionType: "reservation_fee",
      amount: 500,
      amountVerified: 500,
      method: "gcash",
      effectiveAt: new Date("2026-09-01T04:00:00Z"),
    },
    {
      ...base,
      invoiceId: "TEST-FINAL-1",
      transactionType: "service_balance",
      amount: 8499,
      amountVerified: 8499,
      method: "cash",
      effectiveAt: new Date("2026-09-05T04:00:00Z"),
    },
    {
      ...base,
      invoiceId: "TEST-PENDING-1",
      transactionType: "additional_charge",
      amount: 900,
      amountVerified: 0,
      method: "gcash",
      status: "pending",
      proofImage: "https://example.test/proof.png",
      submittedAt: new Date("2026-09-05T05:00:00Z"),
    },
    {
      ...base,
      invoiceId: "TEST-REFUND-1",
      transactionType: "refund",
      amount: 100,
      amountVerified: 100,
      method: "cash",
      status: "refunded",
      effectiveAt: new Date("2026-09-05T06:00:00Z"),
    },
  ]);
  const invoice = await InvoiceRecord.create({
    invoiceNumber: "TEST-OFFICIAL-1",
    order: order._id,
    payment: finalPayment._id,
    snapshot: {
      coverage: ["3 Years Protection"],
      customerName: "Saved Receipt Customer",
      customerEmail: "saved@example.test",
      customerPhone: "09171234567",
      vehicle: {
        year: "2024",
        make: "Bentley",
        model: "Bentayga",
        plate: "ABC 1234",
        color: "Black",
      },
      lineItems: [
        {
          name: "SPF 80 Essential",
          quantity: 1,
          unitPrice: 8999,
          lineTotal: 8999,
        },
      ],
      computed: {
        subtotal: 8999,
        grandTotal: 8999,
        discountTotal: 0,
        taxVatTotal: 0,
        additionalFeesTotal: 0,
        balanceDue: 8499,
      },
      downpayment: 500,
    },
  });
  finalPayment.invoiceRecord = invoice._id;
  await finalPayment.save();
  const app = express();
  app.use("/api/payments", paymentRoutes);
  app.use((err, _req, res, _next) =>
    res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message }),
  );
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("history uses verified payments and signed refunds, not completed-order flags or uploaded proofs", async () => {
  const { status, body } = await request("/my");
  assert.equal(status, 200);
  assert.equal(body.totalSpent, 8899);
  assert.equal(body.data.length, 4);
  const unverified = body.data.find(
    (row) => row.paymentId === String(pending._id),
  );
  assert.equal(unverified.amountVerified, 0);
  assert.equal(unverified.signedAmount, 0);
  assert.equal(unverified.effectiveAt, null);
  assert.equal(unverified.receiptAvailable, false);
  assert.equal(
    body.data.find((row) => row.paymentId === String(refund._id)).signedAmount,
    -100,
  );
});

test("history exposes separate reservation and service receipts and supports subsequent pages", async () => {
  const { body } = await request("/my");
  assert.equal(
    body.data.find((row) => row.paymentId === String(reservation._id))
      .receiptAvailable,
    true,
  );
  assert.equal(body.data.find((row) => row.paymentId === String(reservation._id)).receiptNumber, "RPR-TEST-RESERVATION-1");
  assert.equal(
    body.data.find((row) => row.paymentId === String(finalPayment._id))
      .receiptNumber,
    "TEST-OFFICIAL-1",
  );
  const first = await request("/my?limit=2&page=1");
  const second = await request("/my?limit=2&page=2");
  assert.equal(first.body.pagination.total, 4);
  assert.equal(second.body.pagination.pages, 2);
  assert.equal(
    new Set(
      [...first.body.data, ...second.body.data].map((row) => row.paymentId),
    ).size,
    4,
  );
});

test("receipt returns saved itemization and the transaction amount, separate from earlier payments", async () => {
  const { status, body } = await request(`/my/${finalPayment._id}/receipt`);
  assert.equal(status, 200);
  assert.equal(body.data.customer.name, "Saved Receipt Customer");
  assert.equal(body.data.customer.email, "saved@example.test");
  assert.equal(body.data.vehicle.description, "2024 Bentley Bentayga");
  assert.equal(body.data.transactionNumber, "TEST-FINAL-1");
  assert.equal(body.data.orderNumber, "PAYMENT-HISTORY-1");
  assert.ok(body.data.issuedAt);
  assert.equal(body.data.paymentDate, "2026-09-05T04:00:00.000Z");
  assert.equal(body.data.paymentMethod, "cash");
  assert.equal(body.data.paymentStatus, "succeeded");
  assert.equal(body.data.subtotal, 8999);
  assert.equal(body.data.priorPayments, 500);
  assert.equal(body.data.reservationFee, 500);
  assert.deepEqual(body.data.coverage, ["3 Years Protection"]);
  assert.equal(body.data.totalPaid, 8499);
  assert.equal(body.data.totalReceived, 8999);
  assert.equal(body.data.receiptKind, "official_service");
  assert.equal(body.data.balanceDue, 0);
  assert.equal(body.data.lineItems[0].amount, 8999);
  assert.equal(Object.hasOwn(body.data, "bookingStatus"), false);
  // Optional local QA captures use only this isolated test database.
  if (process.env.CUSTOMER_PAYMENT_QA_DIR) {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(process.env.CUSTOMER_PAYMENT_QA_DIR, { recursive: true });
    await writeFile(
      `${process.env.CUSTOMER_PAYMENT_QA_DIR}/receipt.json`,
      JSON.stringify(body.data),
    );
    const history = await request("/my");
    await writeFile(
      `${process.env.CUSTOMER_PAYMENT_QA_DIR}/history.json`,
      JSON.stringify(history.body),
    );
  }
});

test("historical service receipt recovers an omitted reservation credit only from reconciled payments", async () => {
  await InvoiceRecord.updateOne({ _id: finalPayment.invoiceRecord }, { $set: { "snapshot.downpayment": 0 } });
  try {
    const { body } = await request(`/my/${finalPayment._id}/receipt`);
    assert.equal(body.data.priorPayments, 500);
    assert.equal(body.data.reservationFee, 500);
    assert.equal(body.data.totalPaid, 8499);
    assert.equal(body.data.totalReceived, 8999);
    assert.equal(body.data.balanceDue, 0);
  } finally {
    await InvoiceRecord.updateOne({ _id: finalPayment.invoiceRecord }, { $set: { "snapshot.downpayment": 500 } });
  }
  const current = { _id: "final", transactionType: "service_balance", status: "succeeded", amountVerified: 8499, effectiveAt: "2026-09-05T00:00:00Z" };
  const prior = { _id: "reservation", transactionType: "reservation_fee", status: "succeeded", amountVerified: 500, effectiveAt: "2026-09-01T00:00:00Z" };
  const snapshot = { downpayment: 0, computed: { grandTotal: 8999 } };
  assert.equal(resolveReceiptPriorPayments(snapshot, current, [{ ...prior, status: "pending" }]), 0);
  assert.equal(resolveReceiptPriorPayments(snapshot, current, [{ ...prior, amountVerified: 750 }]), 0);
  assert.equal(resolveReceiptPriorPayments(snapshot, current, [{ ...prior, effectiveAt: "2026-09-06T00:00:00Z" }]), 0);
});

test("unauthenticated requests and another customer cannot read receipts or payment history", async () => {
  assert.equal(
    (await request(`/my/${finalPayment._id}/receipt`, null)).status,
    401,
  );
  assert.equal(
    (await request(`/my/${finalPayment._id}/receipt`, stranger)).status,
    404,
  );
  assert.deepEqual((await request("/my", stranger)).body.data, []);
});

test("missing, invalid and pending receipts are unavailable", async () => {
  assert.equal((await request("/my/not-an-id/receipt")).status, 400);
  assert.equal(
    (await request(`/my/${new mongoose.Types.ObjectId()}/receipt`)).status,
    404,
  );
  assert.equal((await request(`/my/${pending._id}/receipt`)).status, 404);
});

test("reservation acknowledgement uses its verified payment and creates no payment or invoice records", async () => {
  const beforePayment = await Payment.findById(reservation._id).lean();
  const invoicesBefore = await InvoiceRecord.countDocuments();
  const paymentsBefore = await Payment.countDocuments();
  const { status, body } = await request(`/my/${reservation._id}/receipt`);
  assert.equal(status, 200);
  assert.equal(body.data.receiptKind, "reservation_payment");
  assert.equal(body.data.receiptNumber, "RPR-TEST-RESERVATION-1");
  assert.equal(body.data.paymentMethod, "gcash");
  assert.equal(body.data.paymentDate, "2026-09-01T04:00:00.000Z");
  assert.equal(body.data.totalPaid, 500);
  assert.equal(body.data.totalReceived, 500);
  assert.equal(body.data.priorPayments, 0);
  assert.equal(body.data.lineItems[0].amount, 500);
  assert.equal(body.data.vehicle.description, "2024 Bentley Bentayga");
  assert.deepEqual((await request(`/my/${reservation._id}/receipt`)).body, body);
  assert.equal((await request(`/my/${reservation._id}/receipt`, stranger)).status, 404);
  assert.deepEqual(await Payment.findById(reservation._id).lean(), beforePayment);
  assert.equal(await InvoiceRecord.countDocuments(), invoicesBefore);
  assert.equal(await Payment.countDocuments(), paymentsBefore);
});

test("reservation receipts require verification and do not depend on final payment or service completion", async () => {
  await Order.updateOne({ _id: order._id }, { $set: { status: "pending" } });
  await Payment.updateOne({ _id: finalPayment._id }, { $set: { status: "pending" } });
  try {
    assert.equal((await request(`/my/${reservation._id}/receipt`)).status, 200);
    for (const status of ["pending", "rejected", "failed", "voided"]) {
      await Payment.updateOne({ _id: reservation._id }, { $set: { status } });
      assert.equal((await request(`/my/${reservation._id}/receipt`)).status, 404);
      assert.equal((await request("/my")).body.data.find((row) => row.paymentId === String(reservation._id)).receiptAvailable, false);
    }
  } finally {
    await Payment.updateMany({ _id: { $in: [reservation._id, finalPayment._id] } }, { $set: { status: "succeeded" } });
    await Order.updateOne({ _id: order._id }, { $set: { status: "completed" } });
  }
});

test("a mismatched invoice reference cannot expose a different payment receipt", async () => {
  reservation.invoiceRecord = finalPayment.invoiceRecord;
  await reservation.save();
  const acknowledgement = await request(`/my/${reservation._id}/receipt`);
  assert.equal(acknowledgement.status, 200);
  assert.equal(acknowledgement.body.data.receiptNumber, "RPR-TEST-RESERVATION-1");
  assert.equal(acknowledgement.body.data.totalPaid, 500);
  assert.equal(
    (await request("/my")).body.data.find(
      (row) => row.paymentId === String(reservation._id),
    ).receiptAvailable,
    true,
  );
});

test("payment receipt stays available before vehicle release and after a later refund", async () => {
  await Order.updateOne(
    { _id: order._id },
    { $set: { status: "received", customerStatus: "received" } },
  );
  const { status, body } = await request(`/my/${finalPayment._id}/receipt`);
  assert.equal(status, 200);
  assert.equal(body.data.totalPaid, 8499);
  assert.equal(body.data.reservationFee, 500);
  assert.equal(
    (await request("/my")).body.data.find(
      (row) => row.paymentId === String(finalPayment._id),
    ).receiptAvailable,
    true,
  );
  for (const field of [
    "customerStatus",
    "bookingStatus",
    "handoverStatus",
    "qcStatus",
  ])
    assert.equal(Object.hasOwn(body.data, field), false);
});
test("coverage prefers the receipt and never borrows terms from a different catalog version", () => {
  const current = { packageCode: "SPF80", catalogVersion: SPF_CATALOG_VERSION };
  assert.deepEqual(
    resolveCustomerReceiptCoverage({ coverage: ["Saved coverage"] }, current),
    ["Saved coverage"],
  );
  assert.deepEqual(resolveCustomerReceiptCoverage({}, current), [
    "3 Years Protection",
  ]);
  assert.deepEqual(
    resolveCustomerReceiptCoverage(
      {},
      { ...current, catalogVersion: "historical-catalog" },
    ),
    [],
  );
  assert.deepEqual(resolveCustomerReceiptCoverage({}, null), []);
});
test("a reservation label requires historical ledger reconciliation, including related refunds", () => {
  const current = {
    _id: "final",
    status: "succeeded",
    effectiveAt: "2026-09-05T00:00:00Z",
  };
  const prior = [
    {
      _id: "reserve",
      status: "succeeded",
      amount: 500,
      transactionType: "reservation_fee",
      effectiveAt: "2026-09-01T00:00:00Z",
    },
    {
      _id: "credit",
      status: "succeeded",
      amount: 200,
      transactionType: "additional_charge",
      effectiveAt: "2026-09-02T00:00:00Z",
    },
    {
      _id: "refund",
      status: "refunded",
      amount: 100,
      transactionType: "refund",
      relatedPayment: "reserve",
      effectiveAt: "2026-09-03T00:00:00Z",
    },
  ];
  assert.equal(
    resolveReceiptReservationFee({ downpayment: 600 }, current, prior),
    400,
  );
  assert.equal(
    resolveReceiptReservationFee({ downpayment: 500 }, current, prior),
    null,
  );
  assert.equal(
    resolveReceiptReservationFee({ downpayment: 0 }, current, prior),
    0,
  );
});
