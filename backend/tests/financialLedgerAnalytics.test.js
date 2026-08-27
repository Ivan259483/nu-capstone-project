import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const {
  buildLedgerTransaction,
  createRefundLedgerEntry,
  allocateAmountToServices,
  getMethodAllocations,
  getOrderServiceTotal,
  getServiceLines,
  getSignedAmount,
  summarizeLedgerRows,
} = await import('../services/financialLedger.service.js');
const {
  buildCustomerRegistryFromRecords,
  buildSalesReportFromRecords,
} = await import('../services/salesAnalytics.service.js');
const { parseReportingRange, manilaDayStart } = await import('../utils/reportingRange.utils.js');
const { classifyLegacyPaidOrder } = await import('../services/ledgerReconciliation.service.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');

const currentRange = parseReportingRange({ range: 'custom', from: '2026-08-01', to: '2026-08-31' });
const approvedAt = new Date('2026-08-10T01:00:00.000Z');
const effectiveAt = new Date('2026-08-10T02:00:00.000Z');

const booking = (overrides = {}) => ({
  _id: 'booking-1',
  orderNumber: 'ORDER-1',
  customer: 'customer-1',
  customerName: 'Ivan Santos',
  serviceType: 'SPF 89 — Advanced',
  serviceTotal: 17_999,
  totalPrice: 17_999,
  status: 'confirmed',
  approvedAt,
  ...overrides,
});

const payment = (overrides = {}) => ({
  _id: 'payment-1',
  invoiceId: 'RSV-1',
  order: 'booking-1',
  customer: 'customer-1',
  amount: 500,
  amountSubmitted: 500,
  amountVerified: 500,
  status: 'succeeded',
  transactionType: 'reservation_fee',
  method: 'gcash',
  submittedAt: effectiveAt,
  effectiveAt,
  ...overrides,
});

test('Asia/Manila date bounds begin at the correct UTC instant', () => {
  assert.equal(manilaDayStart('2026-08-01').toISOString(), '2026-07-31T16:00:00.000Z');
  assert.equal(currentRange.end.toISOString(), '2026-08-31T15:59:59.999Z');
  const duration = currentRange.end.getTime() - currentRange.start.getTime() + 1;
  const previousDuration = currentRange.previousEnd.getTime() - currentRange.previousStart.getTime() + 1;
  assert.equal(previousDuration, duration);
});

test('₱17,999 booking plus verified ₱500 reservation separates booked, collected, and outstanding', () => {
  const report = buildSalesReportFromRecords({
    orders: [booking()],
    payments: [payment()],
    range: currentRange,
    serviceMetric: 'orders',
  });
  assert.equal(report.kpis.netCollectedRevenue, 500);
  assert.equal(report.kpis.bookedSalesValue, 17_999);
  assert.equal(report.kpis.confirmedOrders, 1);
  assert.equal(report.kpis.averageOrderValue, 17_999);
  assert.equal(report.secondary.outstandingBalance, 17_499);
  assert.equal(report.secondary.reservationFeesCollected, 500);
  assert.equal(report.topServices[0].bookedValue, 17_999);
  assert.equal(report.topServices[0].collected, 500);
});

test('pending and rejected proofs never become collected revenue', () => {
  const rows = [
    payment({ _id: 'pending', status: 'pending', amountVerified: null, effectiveAt: null }),
    payment({ _id: 'rejected', status: 'rejected', amountVerified: 0, effectiveAt: null }),
  ];
  const report = buildSalesReportFromRecords({ orders: [booking()], payments: rows, range: currentRange });
  assert.equal(report.kpis.netCollectedRevenue, 0);
  assert.equal(report.secondary.pendingVerification, 500);
});

test('multiple payments settle one booking without inflating order count', () => {
  const rows = [
    payment(),
    payment({
      _id: 'payment-2', invoiceId: 'BAL-1', amount: 17_499, amountSubmitted: 17_499,
      amountVerified: 17_499, transactionType: 'service_balance', method: 'cash',
    }),
  ];
  const report = buildSalesReportFromRecords({ orders: [booking()], payments: rows, range: currentRange });
  assert.equal(report.kpis.netCollectedRevenue, 17_999);
  assert.equal(report.kpis.confirmedOrders, 1);
  assert.equal(report.secondary.outstandingBalance, 0);
});

test('posted refunds retain the original and reduce net revenue exactly once', () => {
  const original = payment();
  const refund = payment({
    _id: 'refund-1', invoiceId: 'RFND-1', transactionType: 'refund', relatedPayment: 'payment-1',
    amount: 200, amountSubmitted: 200, amountVerified: 200, status: 'refunded', method: 'gcash',
  });
  assert.equal(getSignedAmount(original), 500);
  assert.equal(getSignedAmount(refund), -200);
  assert.deepEqual(summarizeLedgerRows([original, refund], 17_999), {
    verifiedPayments: 500,
    refunds: 200,
    netVerified: 300,
    outstandingBalance: 17_699,
  });
});

test('cancelled paid bookings leave financial history but leave booked KPIs', () => {
  const report = buildSalesReportFromRecords({
    orders: [booking({ status: 'cancelled', cancelledAt: approvedAt })],
    payments: [payment()],
    range: currentRange,
  });
  assert.equal(report.kpis.netCollectedRevenue, 500);
  assert.equal(report.kpis.bookedSalesValue, 0);
  assert.equal(report.kpis.confirmedOrders, 0);
  assert.equal(report.secondary.cancellations, 1);
});

test('split tenders expand into method components that reconcile to signed revenue', () => {
  const split = payment({
    amount: 1_000,
    amountVerified: 1_000,
    method: 'split',
    splitPayments: [{ method: 'cash', amount: 400 }, { method: 'gcash', amount: 600 }],
  });
  assert.deepEqual(getMethodAllocations(split), [
    { method: 'cash', amount: 400 },
    { method: 'gcash', amount: 600 },
  ]);
  assert.equal(buildLedgerTransaction(split, { order: booking(), orderPayments: [split] }).signedAmount, 1_000);
});

test('legacy totals survive a default zero serviceTotal and unallocatable charges stay explicit', () => {
  const legacyOrder = booking({
    serviceTotal: 0,
    totalPrice: 1_100,
    subtotal: 1_000,
    additionalFees: 100,
    items: [
      { name: 'Service A', price: 600, quantity: 1 },
      { name: 'Service B', price: 400, quantity: 1 },
    ],
  });
  assert.equal(getOrderServiceTotal(legacyOrder), 1_100);
  assert.deepEqual(getServiceLines(legacyOrder).map(({ name, value }) => ({ name, value })), [
    { name: 'Service A', value: 600 },
    { name: 'Service B', value: 400 },
    { name: 'Unassigned', value: 100 },
  ]);
  assert.deepEqual(allocateAmountToServices(1_100, legacyOrder).map(({ name, amount }) => ({ name, amount })), [
    { name: 'Service A', amount: 600 },
    { name: 'Service B', amount: 400 },
    { name: 'Unassigned', amount: 100 },
  ]);
});

test('reconciliation does not invent revenue from a quoted invoice balance', () => {
  const quotedOnly = classifyLegacyPaidOrder({
    hasPostedPayment: false,
    invoice: {
      _id: 'invoice-quoted',
      createdAt: effectiveAt,
      snapshot: { computed: { balanceDue: 17_999 }, paymentMethod: 'gcash' },
    },
  });
  assert.equal(quotedOnly.classification, 'ambiguous');
  assert.deepEqual(quotedOnly.missingEvidence, ['amount']);

  const immutableCollection = classifyLegacyPaidOrder({
    hasPostedPayment: false,
    invoice: {
      _id: 'invoice-paid',
      invoiceNumber: 'INV-EVIDENCE',
      createdAt: effectiveAt,
      snapshot: { payment: { amountCollected: 500, method: 'gcash' } },
    },
  });
  assert.equal(immutableCollection.classification, 'provable');
  assert.equal(immutableCollection.evidence.amount, 500);
  assert.equal(immutableCollection.evidence.method, 'gcash');
});

test('customer registry includes zero-purchase accounts but excludes them from average-spend denominator', () => {
  const users = [
    { _id: 'customer-1', role: 'customer', name: 'Buyer', email: 'buyer@example.com', createdAt: approvedAt },
    { _id: 'customer-2', role: 'customer', name: 'Registered Only', email: 'new@example.com', createdAt: approvedAt },
  ];
  const registry = buildCustomerRegistryFromRecords({
    users,
    vehicles: [],
    orders: [booking()],
    payments: [payment()],
    activityRange: currentRange,
  });
  assert.equal(registry.length, 2);
  assert.equal(registry.find((row) => row.name === 'Buyer').totalSpent, 500);
  assert.equal(registry.find((row) => row.name === 'Registered Only').totalSpent, 0);
  assert.equal(registry.filter((row) => row.hasVerifiedPayment).length, 1);
});

test('stored ledger amounts must remain positive, including split tender components', () => {
  const invalidPayment = new Payment({
    invoiceId: 'NEGATIVE-AMOUNTS',
    order: new mongoose.Types.ObjectId(),
    amount: -1,
    amountSubmitted: -2,
    amountVerified: -3,
    splitPayments: [{ method: 'cash', amount: -4 }],
  });

  const validationError = invalidPayment.validateSync();
  assert.ok(validationError?.errors.amount);
  assert.ok(validationError?.errors.amountSubmitted);
  assert.ok(validationError?.errors.amountVerified);
  assert.ok(validationError?.errors['splitPayments.0.amount']);
});

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { downloadDir: `${process.cwd()}/.mongodb-binaries`, version: '7.0.14' },
  });
  await mongoose.connect(mongo.getUri('autospf-ledger-test'));
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('partial refund creation is capped and idempotent while the original remains succeeded', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    orderNumber: 'REFUND-ORDER', customer: customerId, customerName: 'Refund Customer',
    serviceType: 'Refund Service', serviceTotal: 1_000, totalPrice: 1_000,
    status: 'confirmed', approvedAt,
  });
  const original = await Payment.create({
    invoiceId: 'REFUND-ORIGINAL', order: order._id, customer: customerId,
    amount: 1_000, amountSubmitted: 1_000, amountVerified: 1_000,
    status: 'succeeded', transactionType: 'full_service_payment', method: 'cash', effectiveAt,
  });
  const first = await createRefundLedgerEntry({
    originalPayment: original, amount: 250, reason: 'Customer-approved partial refund',
    actorId, idempotencyKey: 'refund-test-key-1',
  });
  const retry = await createRefundLedgerEntry({
    originalPayment: original, amount: 250, reason: 'Customer-approved partial refund',
    actorId, idempotencyKey: 'refund-test-key-1',
  });
  assert.equal(String(first.payment._id), String(retry.payment._id));
  assert.equal(retry.idempotent, true);
  assert.equal((await Payment.findById(original._id)).status, 'succeeded');
  await assert.rejects(
    createRefundLedgerEntry({
      originalPayment: original, amount: 751, reason: 'Too much', actorId,
      idempotencyKey: 'refund-test-key-2',
    }),
    (error) => error.code === 'REFUND_EXCEEDS_REFUNDABLE_BALANCE',
  );
});
