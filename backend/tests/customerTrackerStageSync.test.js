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
const { default: Order } = await import('../models/order.model.js');
const { default: User } = await import('../models/user.model.js');
const qcRoutes = (await import('../routes/qc.routes.js')).default;
const {
  buildCustomerStagePayload,
  customerStageRank,
  isForwardCustomerStageTransition,
  normalizeBookingStage,
  resolveCustomerTrackerStage,
} = await import('../utils/customerTrackerStage.utils.js');
const { TRACKER_GATE_STAGES } = await import('../utils/trackerGatePhotos.utils.js');

let mongo;
let server;
let baseUrl;

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
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

const seedUser = (role = 'customer') =>
  User.create({
    name: `${role} User`,
    email: `${role}-${Math.random().toString(16).slice(2)}@example.test`,
    role,
    isActive: true,
    isVerified: requiresStaffTwoFactor(role),
    status: 'active',
  });

const gateMedia = (stage) =>
  ['front', 'rear', 'left', 'right', 'close_up'].map((slot) => ({
    stage,
    slot,
    photoUrl: `https://example.test/${stage}-${slot}.jpg`,
  }));

async function seedInServiceOrder(overrides = {}) {
  const customer = overrides.customer || (await seedUser('customer'));
  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    bookingReference: `ASPF-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    customer: customer._id,
    customerName: 'Stage Sync Customer',
    serviceType: 'SPF 80 - Essential',
    vehicleYear: '2024',
    vehicleMake: 'Toyota',
    vehicleModel: 'Vios',
    vehiclePlate: 'XYZ9876',
    bookingDate: '2099-08-17',
    bookingTime: '10:00',
    status: 'in_progress',
    serviceTrackingStage: 'in_progress',
    paymentStatus: 'unpaid',
    // The Service In Progress gate is fully evidenced, so QC may advance into Quality Check.
    trackerStageMedia: gateMedia('in_progress'),
    totalAmount: 1000,
    totalPrice: 1000,
    ...overrides.order,
  });
  return { customer, order };
}

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { downloadDir: `${process.cwd()}/.mongodb-binaries`, version: '7.0.14' },
  });
  await mongoose.connect(mongo.getUri('autospf-customer-stage-sync-test'));

  const app = express();
  app.use(express.json());
  app.use('/api/qc', qcRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  });
  server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  socketServer = initSocket(server);
  socketServer.to = (room) => ({ emit: (event, payload) => socketEvents.push({ room, event, payload }) });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  socketEvents.length = 0;
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('a job in Quality Check resolves to customer step 4 of 5 at 75%, never step 3 at 50%', () => {
  const payload = buildCustomerStagePayload({ serviceTrackingStage: 'quality_check', status: 'in_progress' });

  assert.equal(payload.customerStage, 'quality_check');
  assert.equal(payload.customerStageLabel, 'Quality Check');
  assert.equal(payload.customerStageStep, 4);
  assert.equal(payload.customerStageTotalSteps, 5);
  assert.equal(payload.customerStageProgress, 75);

  assert.notEqual(payload.customerStageLabel, 'Service In Progress');
  assert.notEqual(payload.customerStageStep, 3);
  assert.notEqual(payload.customerStageProgress, 50);
});

test('the operational QC gate index is translated, never reused, as the customer step', () => {
  assert.equal(TRACKER_GATE_STAGES.length, 4);
  assert.equal(TRACKER_GATE_STAGES.indexOf('quality_check') + 1, 3, 'QC gate 3 of 4');
  assert.equal(resolveCustomerTrackerStage({ serviceTrackingStage: 'quality_check' }).customerStep, 4);

  for (const gate of TRACKER_GATE_STAGES) {
    assert.equal(
      resolveCustomerTrackerStage({ serviceTrackingStage: gate }).customerStep,
      TRACKER_GATE_STAGES.indexOf(gate) + 2
    );
  }
});

test('quality check aliases normalize to the one canonical stage', () => {
  for (const alias of ['quality_check', 'quality-check', 'QualityCheck', 'qc', 'qc_review']) {
    assert.equal(normalizeBookingStage({ serviceTrackingStage: alias }), 'quality_check');
  }
  assert.equal(customerStageRank('quality_check'), 4);
  assert.equal(customerStageRank('in_progress'), 3);
});

test('QC advancing a job into Quality Check patches the customer tracker over the socket', async () => {
  const qc = await seedUser('staff_quality_checker');
  const { customer, order } = await seedInServiceOrder();

  const advance = await requestJson(`/api/qc/jobs/${order._id}/service-status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenFor(qc)}` },
    body: JSON.stringify({ stage: 'quality_check' }),
  });

  assert.equal(advance.response.status, 200, JSON.stringify(advance.body));
  assert.equal(advance.body.data.serviceTrackingStage, 'quality_check');
  assert.equal(advance.body.data.customerStage, 'quality_check');
  assert.equal(advance.body.data.customerStageStep, 4);
  assert.equal(advance.body.data.customerStageProgress, 75);

  const saved = await Order.findById(order._id);
  assert.equal(saved.serviceTrackingStage, 'quality_check');
  // The top-level status stays in_progress by design — only the fine stage separates QC.
  assert.equal(saved.status, 'in_progress');

  const customerEvent = socketEvents.find(
    ({ room, event }) => room === `user:${customer._id}` && event === 'booking:status'
  );
  assert.ok(customerEvent, 'customer receives a targeted booking:status event');
  assert.equal(customerEvent.payload.bookingId, order._id.toString());
  assert.equal(customerEvent.payload.serviceTrackingStage, 'quality_check');
  assert.equal(customerEvent.payload.customerStage, 'quality_check');
  assert.equal(customerEvent.payload.customerStageLabel, 'Quality Check');
  assert.equal(customerEvent.payload.customerStageStep, 4);
  assert.equal(customerEvent.payload.customerStageProgress, 75);
});

test('a stale Service In Progress update cannot pull a job back out of Quality Check', async () => {
  const qc = await seedUser('staff_quality_checker');
  const { order } = await seedInServiceOrder({ order: { serviceTrackingStage: 'quality_check' } });
  const headers = { Authorization: `Bearer ${tokenFor(qc)}` };

  const regression = await requestJson(`/api/qc/jobs/${order._id}/service-status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ stage: 'in_progress' }),
  });

  assert.equal(regression.response.status, 409);
  assert.equal(regression.body.error, 'stage_regression_blocked');
  assert.equal(regression.body.currentStageRank, 4);
  assert.equal(regression.body.requestedStageRank, 3);

  const saved = await Order.findById(order._id);
  assert.equal(saved.serviceTrackingStage, 'quality_check');
  assert.equal(buildCustomerStagePayload(saved).customerStageProgress, 75);

  assert.equal(isForwardCustomerStageTransition(saved, 'in_progress'), false);
  assert.equal(isForwardCustomerStageTransition(saved, 'ready_pickup'), true);
});

test('missing QC evidence blocks the advance out of Quality Check without changing the stage', async () => {
  const qc = await seedUser('staff_quality_checker');
  // No quality_check photo: the gate out of Quality Check must stay shut.
  const { order } = await seedInServiceOrder({
    order: { serviceTrackingStage: 'quality_check', trackerStageMedia: gateMedia('in_progress') },
  });

  const blocked = await requestJson(`/api/qc/jobs/${order._id}/service-status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenFor(qc)}` },
    body: JSON.stringify({ stage: 'ready_pickup' }),
  });

  assert.equal(blocked.response.status, 400);
  assert.match(blocked.body.message, /photo/i);

  const saved = await Order.findById(order._id);
  assert.equal(saved.serviceTrackingStage, 'quality_check');
  const payload = buildCustomerStagePayload(saved);
  assert.equal(payload.customerStageLabel, 'Quality Check');
  assert.equal(payload.customerStageStep, 4);
  assert.equal(payload.customerStageProgress, 75);
});
