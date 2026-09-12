import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.EMAIL_PROVIDER = 'console';
process.env.JWT_SECRET ||= 'test_jwt_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { config } = await import('../config/environment.js');
const { STAFF_2FA_AUTH_LEVEL, requiresStaffTwoFactor } = await import('../constants/roles.js');
const { initSocket } = await import('../utils/socket.utils.js');
const socketEvents = [];
let socketServer;
const { default: Billing } = await import('../models/billing.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const {
  buildDefaultRecurringSchedule,
  default: ShopAvailability,
} = await import('../models/shopAvailability.model.js');
const { default: User } = await import('../models/user.model.js');
const orderRoutes = (await import('../routes/orders.routes.js')).default;
const qcRoutes = (await import('../routes/qc.routes.js')).default;
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
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      ...(requiresStaffTwoFactor(user.role) ? { authLevel: STAFF_2FA_AUTH_LEVEL } : {}),
    },
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
    isVerified: requiresStaffTwoFactor(role),
    status: 'active',
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
    bookingDate: '2099-08-17',
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

  await Payment.create({
    invoiceId: `RSV-${order.orderNumber}`,
    order: order._id,
    customer: customer._id,
    amount: 200,
    amountSubmitted: 200,
    amountVerified: 200,
    status: 'succeeded',
    transactionType: 'reservation_fee',
    method: 'gcash',
    submittedAt: new Date(),
    effectiveAt: new Date(),
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
  app.use('/api/qc', qcRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  });
  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  socketServer = initSocket(server);
  socketServer.to = (room) => ({ emit: (event, payload) => socketEvents.push({ room, event, payload }) });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  socketEvents.length = 0;
  await mongoose.connection.db.dropDatabase();
  await Payment.syncIndexes();
});

after(async () => {
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  if (server?.listening) {
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

test('POS queue hydration excludes inline media and returns canonical customer, vehicle, service, and billing data', async () => {
  const sales = await seedUser('sales');
  const inlinePhoto = `data:image/jpeg;base64,${'A'.repeat(256 * 1024)}`;
  const { order } = await seedEligibleOrder({
    order: {
      trackerStageMedia: REQUIRED_READY_PICKUP_SLOTS.map((slot) => ({
        stage: 'ready_pickup',
        slot,
        photoUrl: inlinePhoto,
      })),
    },
  });

  const { response, body } = await requestJson(`/api/bookings/${order._id}/pos-queue-load`, {
    headers: { Authorization: `Bearer ${tokenFor(sales)}` },
  });

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(body.data.order._id, order._id.toString());
  assert.equal(body.data.order.customer.name, 'customer User');
  assert.equal(body.data.order.vehicleMake, 'Toyota');
  assert.equal(body.data.order.vehicleModel, 'Vios');
  assert.equal(body.data.order.vehiclePlate, 'ABC1234');
  assert.equal(body.data.order.serviceType, 'SPF 80 - Essential');
  assert.equal(body.data.billing.computed.balanceDue, 800);
  assert.equal(JSON.stringify(body).includes('data:image/jpeg;base64'), false);
  assert.ok(JSON.stringify(body).length < 30_000);
});

test('POS queue hydration returns specific relation errors without returning a partial payload', async () => {
  const sales = await seedUser('sales');
  const auth = { Authorization: `Bearer ${tokenFor(sales)}` };

  const notFoundResult = await requestJson(
    `/api/bookings/${new mongoose.Types.ObjectId()}/pos-queue-load`,
    { headers: auth }
  );
  assert.equal(notFoundResult.response.status, 404);
  assert.equal(notFoundResult.body.code, 'POS_QUEUE_ORDER_NOT_FOUND');

  const missingCustomer = await seedEligibleOrder();
  await User.deleteOne({ _id: missingCustomer.customer._id });
  const customerResult = await requestJson(`/api/bookings/${missingCustomer.order._id}/pos-queue-load`, {
    headers: auth,
  });
  assert.equal(customerResult.response.status, 422);
  assert.equal(customerResult.body.code, 'POS_QUEUE_CUSTOMER_MISSING');

  const missingVehicle = await seedEligibleOrder();
  await Order.updateOne(
    { _id: missingVehicle.order._id },
    { $set: { vehicle: null, vehicleMake: '', vehicleModel: '' } }
  );
  const vehicleResult = await requestJson(`/api/bookings/${missingVehicle.order._id}/pos-queue-load`, {
    headers: auth,
  });
  assert.equal(vehicleResult.response.status, 422);
  assert.equal(vehicleResult.body.code, 'POS_QUEUE_VEHICLE_MISSING');

  const missingService = await seedEligibleOrder();
  await Promise.all([
    Order.updateOne(
      { _id: missingService.order._id },
      { $set: { serviceType: '', items: [], serviceId: null } }
    ),
    Billing.updateOne({ order: missingService.order._id }, { $set: { lineItems: [] } }),
  ]);
  const serviceResult = await requestJson(`/api/bookings/${missingService.order._id}/pos-queue-load`, {
    headers: auth,
  });
  assert.equal(serviceResult.response.status, 422);
  assert.equal(serviceResult.body.code, 'POS_QUEUE_SERVICE_MISSING');
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
  await ShopAvailability.syncIndexes();
  const availability = await ShopAvailability.getSingleton();
  availability.recurringSchedule = buildDefaultRecurringSchedule().map((row) => ({
    ...row,
    open: row.dow === 1,
    from: row.dow === 1 ? '08:00' : row.from,
    to: row.dow === 1 ? '17:00' : row.to,
    slots: row.dow === 1 ? 2 : row.slots,
  }));
  await availability.save();

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


test('final QC gate creates a Sales task; payment enables handover without completing the service', async () => {
  const qc = await seedUser('staff_quality_checker');
  const sales = await seedUser('sales');
  const { order, billing } = await seedEligibleOrder({ order: {
    serviceTrackingStage: 'quality_check',
    qcCompletedAt: null,
    totalAmount: 7999,
    totalPrice: 7999,
    downPaymentAmount: 500,
    trackerStageMedia: [...pickupMedia(), { stage: 'quality_check', slot: 'front', photoUrl: 'https://example.test/qc.jpg' }],
  } });
  billing.lineItems = [{ name: 'SPF 80 - Essential', unitPrice: 7999, quantity: 1 }];
  await billing.save();
  await Payment.updateOne(
    { order: order._id, transactionType: 'reservation_fee' },
    { $set: { amount: 500, amountSubmitted: 500, amountVerified: 500 } }
  );
  const qcHeaders = { Authorization: `Bearer ${tokenFor(qc)}` };
  const salesHeaders = { Authorization: `Bearer ${tokenFor(sales)}` };
  const setStage = (stage) => requestJson(`/api/qc/jobs/${order._id}/service-status`, {
    method: 'PATCH', headers: qcHeaders, body: JSON.stringify({ stage }),
  });

  const finalGate = await setStage('ready_pickup');
  assert.equal(finalGate.response.status, 200, JSON.stringify(finalGate.body));
  const queued = await Order.findById(order._id);
  assert.equal(queued.posQueueStatus, 'balance_pickup_queue');
  assert.equal(queued.status, 'ready_for_payment');
  assert.ok(queued.qcCompletedAt);
  assert.ok(queued.readyForPaymentAt);

  for (const terminalStage of ['released', 'completed']) {
    const blocked = await setStage(terminalStage);
    assert.equal(blocked.response.status, 400);
    assert.match(blocked.body.message, /final balance/);
  }
  const deniedCheckout = await requestJson(`/api/bookings/${order._id}/billing/checkout`, {
    method: 'POST', headers: qcHeaders, body: JSON.stringify({ paymentMethod: 'cash', cashReceived: 7499 }),
  });
  assert.equal(deniedCheckout.response.status, 403);

  const beforeCheckoutStatus = await requestJson(
    `/api/bookings/${order._id}/billing/checkout-status`,
    { headers: salesHeaders }
  );
  assert.equal(beforeCheckoutStatus.response.status, 200);
  assert.equal(beforeCheckoutStatus.body.paymentCommitted, false);

  const inlinePhoto = `data:image/jpeg;base64,${'A'.repeat(350 * 1024)}`;
  await Order.collection.updateOne(
    { _id: order._id },
    { $set: {
      'trackerStageMedia.$[media].photoUrl': inlinePhoto,
    } },
    { arrayFilters: [{ 'media.stage': 'ready_pickup' }] }
  );

  const checkoutStartedAt = performance.now();
  const checkout = await requestJson(`/api/bookings/${order._id}/billing/checkout`, {
    method: 'POST',
    headers: { ...salesHeaders, 'Idempotency-Key': `pos-final:${order._id}` },
    body: JSON.stringify({ paymentMethod: 'cash', cashReceived: 7499 }),
  });
  const checkoutDurationMs = performance.now() - checkoutStartedAt;
  assert.equal(checkout.response.status, 200, JSON.stringify(checkout.body));
  assert.ok(checkoutDurationMs < 3000, `checkout took ${checkoutDurationMs.toFixed(1)}ms`);
  assert.ok(checkout.body.data.receipt.transactionId);
  assert.equal(checkout.body.data.vehicleReleaseAvailable, true);
  const paid = await Order.findById(order._id);
  assert.equal(paid.paymentStatus, 'paid');
  assert.equal(paid.amountCollected, 7999);
  assert.equal(paid.downPaymentAmount, 500);
  assert.equal(paid.finalPaymentAmount, 7499);
  assert.equal(paid.status, 'ready_for_payment');
  assert.equal(paid.serviceTrackingStage, 'ready_pickup');
  assert.equal(paid.posQueueStatus, null);
  const paymentUpdate = socketEvents.find(({ room, event, payload }) => room === 'realtime:staff' && event === 'orderUpdated' && payload.paymentStatus === 'paid');
  assert.ok(paymentUpdate, 'QC receives payment confirmation without MongoDB change streams');
  assert.equal(paymentUpdate.payload.serviceTrackingStage, 'ready_pickup');
  assert.equal(paymentUpdate.payload.posQueueStatus, null);
  assert.ok(paymentUpdate.payload.invoiceId);
  assert.equal(JSON.stringify(paymentUpdate.payload).includes('data:image'), false);
  assert.equal(paid.readyForPaymentAt.getTime(), queued.readyForPaymentAt.getTime());

  const qcJobs = await requestJson(`/api/qc/jobs?scope=all&orderId=${order._id}`, { headers: qcHeaders });
  assert.equal(qcJobs.response.status, 200);
  const paidJob = qcJobs.body.jobs[0];
  assert.equal(paidJob.paymentStatus, 'paid');
  assert.equal(paidJob.orderStatus, 'ready_for_payment');
  assert.ok(paidJob.invoiceId);
  assert.equal(paidJob.readyForPickupEvidenceComplete, true);
  const paymentQueue = await requestJson('/api/bookings/queue/balance-pickup', { headers: salesHeaders });
  assert.equal(paymentQueue.body.data.length, 0);

  const duplicate = await requestJson(`/api/bookings/${order._id}/billing/checkout`, {
    method: 'POST',
    headers: { ...salesHeaders, 'Idempotency-Key': `pos-final:${order._id}` },
    body: JSON.stringify({ paymentMethod: 'cash', cashReceived: 7499 }),
  });
  assert.equal(duplicate.response.status, 200, JSON.stringify(duplicate.body));
  assert.equal(duplicate.body.idempotent, true);
  assert.equal(duplicate.body.paymentCommitted, true);
  assert.equal(duplicate.body.data.paymentId, checkout.body.data.paymentId);
  assert.equal(await Payment.countDocuments({ order: order._id, transactionType: 'service_balance' }), 1);
  const finalPayment = await Payment.findOne({ order: order._id, transactionType: 'service_balance' });
  assert.equal(finalPayment.amount, 7499);
  assert.equal(finalPayment.downpayment, 500);
  const afterCheckoutStatus = await requestJson(
    `/api/bookings/${order._id}/billing/checkout-status`,
    { headers: salesHeaders }
  );
  assert.equal(afterCheckoutStatus.response.status, 200);
  assert.equal(afterCheckoutStatus.body.paymentCommitted, true);
  assert.equal(afterCheckoutStatus.body.data.paymentId, checkout.body.data.paymentId);
  const persistedMedia = (await Order.collection.findOne({ _id: order._id })).trackerStageMedia;
  assert.ok(persistedMedia.filter((row) => row.stage === 'ready_pickup').every((row) => row.photoUrl === inlinePhoto));

  const handover = await setStage('released');
  assert.equal(handover.response.status, 200, JSON.stringify(handover.body));
  const completed = await Order.findById(order._id);
  assert.equal(completed.status, 'released');
  assert.equal(completed.serviceTrackingStage, 'released');
});


test('prepaid service retains pickup evidence readiness after final QC completion', async () => {
  const { order } = await seedEligibleOrder({ billingStatus: 'checked_out', order: { paymentStatus: 'paid' } });
  await Payment.create({ invoiceId: `BAL-${order.orderNumber}`, order: order._id, customer: order.customer, amount: 800, amountSubmitted: 800, amountVerified: 800, status: 'succeeded', transactionType: 'service_balance', method: 'cash' });
  const result = await evaluateReadyForPickupQueueEligibility(order, { persist: true, emit: false });
  const saved = await Order.findById(order._id);
  assert.equal(result.eligible, false);
  assert.equal(saved.posQueueStatus, null);
  assert.equal(saved.readyForPickupEvidenceComplete, true);
  assert.equal(saved.serviceTrackingStage, 'ready_pickup');
  assert.notEqual(saved.status, 'completed');
  assert.notEqual(saved.status, 'released');
});

test('GET /api/qc/jobs returns a real saved photoUrl and never claims a photo without one', async () => {
  // Regression test for the "Photo saved" placeholder bug: the QC jobs-list
  // projection used to omit trackerStageMedia.photoUrl entirely, so any
  // already-uploaded evidence photo would vanish from the QC dashboard/modal
  // on the next refetch (mount, realtime refresh, modal reopen) even though it
  // was correctly persisted in MongoDB.
  const qc = await seedUser('staff_quality_checker');
  const qcHeaders = { Authorization: `Bearer ${tokenFor(qc)}` };
  const { order } = await seedEligibleOrder({
    order: {
      status: 'received',
      serviceTrackingStage: 'received',
      trackerStageMedia: [
        { stage: 'received', slot: 'front', photoUrl: 'https://media.example.test/arrival-front.jpg' },
        // Inline base64 preview persisted while awaiting Cloudinary backfill — real photo,
        // just too heavy to include in the paginated jobs-list payload.
        { stage: 'received', slot: 'rear', photoUrl: 'data:image/jpeg;base64,AAAA' },
        { stage: 'confirmed', photoUrl: '' },
      ],
    },
  });

  const qcJobs = await requestJson(`/api/qc/jobs?scope=all&orderId=${order._id}`, { headers: qcHeaders });
  assert.equal(qcJobs.response.status, 200);
  const job = qcJobs.body.jobs[0];
  const media = job.trackerStageMedia;

  const front = media.find((m) => m.stage === 'received' && m.slot === 'front');
  assert.equal(front.photoUrl, 'https://media.example.test/arrival-front.jpg');
  assert.equal(front.hasPhoto, true);

  const rear = media.find((m) => m.stage === 'received' && m.slot === 'rear');
  assert.equal(rear.hasPhoto, true, 'a pending inline photo must still be reported as present');
  assert.equal(rear.photoUrl, undefined, 'inline base64 photos stay out of the list payload for size');
  assert.equal(rear.photoPending, true);

  const confirmedRow = media.find((m) => m.stage === 'confirmed');
  assert.equal(confirmedRow.hasPhoto, false, 'hasPhoto must reflect a real photoUrl, not just the stage');
});
