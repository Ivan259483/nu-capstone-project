import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'test_jwt_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { config } = await import('../config/environment.js');
const { default: Billing } = await import('../models/billing.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: User } = await import('../models/user.model.js');
const orderRoutes = (await import('../routes/orders.routes.js')).default;
const {
  evaluateReadyForPickupQueueEligibility,
} = await import('../utils/readyPickupPaymentFlow.utils.js');
const {
  REQUIRED_READY_PICKUP_SLOTS,
  readyPickupSlotProgress,
} = await import('../utils/trackerGatePhotos.utils.js');

let mongo;
let server;
let baseUrl;

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const tokenFor = (user) =>
  jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

const pickupMedia = (slots = REQUIRED_READY_PICKUP_SLOTS) =>
  slots.map((slot) => ({
    stage: 'ready_pickup',
    slot,
    photoUrl: `https://example.test/${slot}.jpg`,
  }));

const seedUser = (role = 'customer') =>
  User.create({
    name: `${role} User`,
    email: `${role}-${Math.random().toString(16).slice(2)}@example.test`,
    role,
    isActive: true,
  });

async function seedEligibleOrder(overrides = {}) {
  const customer = overrides.customer || await seedUser('customer');
  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    bookingReference: `ASPF-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    customer: customer._id,
    customerName: 'Queue Customer',
    serviceType: 'SPF 80 - Essential',
    vehicleYear: '2024',
    vehicleMake: 'Toyota',
    vehicleModel: 'Vios',
    vehiclePlate: 'ABC1234',
    bookingDate: '2026-06-20',
    bookingTime: '10:00',
    status: 'in_progress',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'unpaid',
    qcCompletedAt: new Date(),
    trackerStageMedia: pickupMedia(['front', 'rear', 'left', 'right', 'close_up', 'front']),
    totalAmount: 1000,
    totalPrice: 1000,
    ...overrides.order,
  });

  const billing = await Billing.create({
    order: order._id,
    status: overrides.billingStatus || 'updated',
    downpayment: 200,
    lineItems: [{ name: 'SPF 80 - Essential', unitPrice: 1000, quantity: 1 }],
    discount: { discountType: 'fixed', value: 0 },
  });

  return { customer, order, billing };
}

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-ready-pickup-queue-test'));

  const app = express();
  app.use(express.json());
  app.use('/api/bookings', orderRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  });
  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Payment.syncIndexes();
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('ready pickup slots are normalized and counted once per required slot', async () => {
  const progress = readyPickupSlotProgress({
    trackerStageMedia: pickupMedia(['front', 'rear', 'left', 'right', 'close-up', 'front']),
  });

  assert.equal(progress.complete, true);
  assert.equal(progress.readyPickupSlotCount, 5);
  assert.deepEqual(progress.missingSlots, []);
});

test('evaluator queues eligible order and preserves readyForPaymentAt on repeated runs', async () => {
  const { order } = await seedEligibleOrder();

  const first = await evaluateReadyForPickupQueueEligibility(order, { persist: true, emit: false });
  const firstSaved = await Order.findById(order._id);
  const firstReadyAt = firstSaved.readyForPaymentAt?.getTime();

  const second = await evaluateReadyForPickupQueueEligibility(firstSaved, { persist: true, emit: false });
  const secondSaved = await Order.findById(order._id);

  assert.equal(first.eligible, true);
  assert.equal(second.eligible, true);
  assert.equal(first.readyPickupSlotCount, 5);
  assert.equal(first.remainingBalance, 800);
  assert.equal(secondSaved.status, 'ready_for_payment');
  assert.equal(secondSaved.posQueueStatus, 'balance_pickup_queue');
  assert.equal(secondSaved.readyForPickupEvidenceComplete, true);
  assert.equal(secondSaved.readyForPaymentAt.getTime(), firstReadyAt);
});

test('evaluator clears queue fields when pickup evidence becomes incomplete', async () => {
  const { order } = await seedEligibleOrder();
  await evaluateReadyForPickupQueueEligibility(order, { persist: true, emit: false });

  const queued = await Order.findById(order._id);
  queued.trackerStageMedia = queued.trackerStageMedia.filter((entry) => entry.slot !== 'left');
  const result = await evaluateReadyForPickupQueueEligibility(queued, { persist: true, emit: false });
  const saved = await Order.findById(order._id);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'missing_ready_pickup_slots');
  assert.equal(saved.posQueueStatus, null);
  assert.equal(saved.readyForPickupEvidenceComplete, false);
  assert.equal(saved.status, 'in_progress');
});

test('checked out and finalized orders are not re-queued', async () => {
  const checkedOut = await seedEligibleOrder({ billingStatus: 'checked_out' });
  checkedOut.order.posQueueStatus = 'balance_pickup_queue';
  await checkedOut.order.save();

  const checkedOutResult = await evaluateReadyForPickupQueueEligibility(checkedOut.order, {
    persist: true,
    emit: false,
  });
  const checkedOutSaved = await Order.findById(checkedOut.order._id);

  assert.equal(checkedOutResult.eligible, false);
  assert.equal(checkedOutResult.reason, 'already_checked_out');
  assert.equal(checkedOutSaved.posQueueStatus, null);

  const finalized = await seedEligibleOrder({ order: { status: 'released', serviceTrackingStage: 'released' } });
  const finalizedResult = await evaluateReadyForPickupQueueEligibility(finalized.order, {
    persist: true,
    emit: false,
  });

  assert.equal(finalizedResult.eligible, false);
  assert.equal(finalizedResult.reason, 'already_released');
});

test('balance pickup queue route is protected and registered before dynamic order routes', async () => {
  const sales = await seedUser('sales');
  const customer = await seedUser('customer');
  await seedEligibleOrder();

  const customerResponse = await requestJson('/api/bookings/queue/balance-pickup', {
    headers: { Authorization: `Bearer ${tokenFor(customer)}` },
  });
  assert.equal(customerResponse.response.status, 403);

  const salesResponse = await requestJson('/api/bookings/queue/balance-pickup', {
    headers: { Authorization: `Bearer ${tokenFor(sales)}` },
  });

  assert.equal(salesResponse.response.status, 200);
  assert.equal(salesResponse.body.success, true);
  assert.equal(salesResponse.body.data.length, 1);
  const queuedRow = salesResponse.body.data[0];
  assert.match(queuedRow.orderId, /^[a-f0-9]{24}$/i);
  assert.equal(queuedRow.bookingId, queuedRow.orderId);
  assert.ok(queuedRow.bookingReference);
  assert.equal(queuedRow.customerName, 'Queue Customer');
  assert.equal(queuedRow.vehiclePlate, 'ABC1234');
  assert.equal(typeof queuedRow.remainingBalance, 'number');
  assert.ok(queuedRow.readyForPaymentAt);
  assert.equal(queuedRow.queueReason, 'readyForFinalPayment');
  assert.equal(queuedRow.remainingBalance, 800);
});
