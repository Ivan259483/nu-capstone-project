import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { runPosCheckoutCore } = await import('../controllers/payment.controller.js');
const {
  normalizePaymentMethod,
  normalizePosPaymentMethod,
} = await import('../utils/paymentMethod.utils.js');

let mongo;
let mongoUri;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  mongoUri = mongo.getUri('autospf-payment-method-test');
  await mongoose.connect(mongoUri);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('POS normalization requires an explicit supported method', () => {
  assert.equal(normalizePosPaymentMethod(undefined), null);
  assert.equal(normalizePosPaymentMethod('Cash'), 'cash');
  assert.equal(normalizePosPaymentMethod('GCash'), 'gcash');
  assert.equal(normalizePosPaymentMethod('card'), null);
  assert.equal(normalizePaymentMethod('split'), 'split');
});

test('Cash and GCash survive MongoDB persistence on the order and payment records', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const expectedMethods = ['cash', 'gcash'];

  for (const paymentMethod of expectedMethods) {
    const order = await Order.create({
      orderNumber: `ORDER-${paymentMethod.toUpperCase()}`,
      customer: customerId,
      customerName: `${paymentMethod} customer`,
      serviceType: 'Payment persistence test',
      totalAmount: 1000,
      totalPrice: 1000,
      paymentStatus: 'paid',
      paymentMethod,
      status: 'paid',
    });
    await Payment.create({
      invoiceId: `INV-${paymentMethod.toUpperCase()}`,
      order: order._id,
      customer: customerId,
      amount: 1000,
      status: 'succeeded',
      method: paymentMethod,
      provider: 'pos',
    });
  }

  // Re-read from MongoDB rather than asserting against in-memory documents.
  const persistedOrders = await Order.find({ orderNumber: /^ORDER-/ }).sort({ orderNumber: 1 }).lean();
  const persistedPayments = await Payment.find({ invoiceId: /^INV-/ }).sort({ invoiceId: 1 }).lean();

  assert.deepEqual(persistedOrders.map((row) => row.paymentMethod).sort(), expectedMethods);
  assert.deepEqual(persistedPayments.map((row) => row.method).sort(), expectedMethods);
});

test('the real POS completion path persists and returns Cash and GCash after reconnect', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const cashierId = new mongoose.Types.ObjectId();
  const scenarios = [
    { method: 'cash', cashReceived: 1000 },
    { method: 'gcash', amountReceived: 1000, paymentReference: 'GCASH-TEST-001' },
  ];

  for (const scenario of scenarios) {
    const order = await Order.create({
      orderNumber: `POS-${scenario.method.toUpperCase()}`,
      bookingReference: `ASPF-${scenario.method.toUpperCase()}`,
      customer: customerId,
      customerName: `${scenario.method} POS customer`,
      serviceType: 'POS payment test',
      items: [],
      totalAmount: 1000,
      totalPrice: 1000,
      paymentStatus: 'unpaid',
      status: 'in_progress',
      isWalkIn: true,
    });

    const result = await runPosCheckoutCore({
      req: { user: { id: cashierId.toString(), name: 'Test Cashier', role: 'sales' } },
      order,
      allItems: [{ name: 'POS payment test', price: 1000, quantity: 1, isAddon: false }],
      subtotal: 1000,
      discountAmount: 0,
      discount: null,
      grandTotal: 1000,
      balanceDue: 1000,
      paymentMethod: scenario.method,
      staffId: null,
      cashReceived: scenario.cashReceived,
      amountReceived: scenario.amountReceived,
      paymentReference: scenario.paymentReference,
    });

    assert.equal(result.receiptData.paymentMethod, scenario.method);
  }

  await mongoose.disconnect();
  await mongoose.connect(mongoUri);

  const ordersAfterReconnect = await Order.find({ orderNumber: /^POS-/ }).lean();
  const paymentsAfterReconnect = await Payment.find({ 'metadata.posTransaction': true }).lean();
  assert.deepEqual(ordersAfterReconnect.map((row) => row.paymentMethod).sort(), ['cash', 'gcash']);
  assert.deepEqual(paymentsAfterReconnect.map((row) => row.method).sort(), ['cash', 'gcash']);
});
