import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'system_lifecycle_security_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_system_lifecycle';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_system_lifecycle';
process.env.NODE_ENV = 'test';

const { config } = await import('../config/environment.js');
const { STAFF_2FA_AUTH_LEVEL } = await import('../constants/roles.js');
const { default: User } = await import('../models/user.model.js');
const { default: SystemState } = await import('../models/systemState.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Notification } = await import('../models/notification.model.js');
const { default: PaymentReconciliationEvent } = await import('../models/paymentReconciliationEvent.model.js');
const { default: SystemMutationAdmission } = await import('../models/systemMutationAdmission.model.js');
const {
  acquireSystemMutationLease,
  getSystemState,
  incrementGlobalSessionEpoch,
  releaseSystemMutationLease,
  renewSystemMutationLease,
} = await import('../services/systemState.service.js');
const { assertAdministratorMutationAllowed } = await import('../services/administratorProtection.service.js');
const { authenticate } = await import('../middleware/auth.middleware.js');
const {
  beginTrackedSystemMutation,
  enforceAnonymousChatOnboarding,
  enforceSystemLifecycle,
  waitForInFlightMutations,
} = await import('../middleware/systemLifecycle.middleware.js');
const { stripeWebhookHandler } = await import('../controllers/payment.controller.js');

let replSet;
let server;
let baseUrl;

const password = 'Lifecycle!Pass123';

const makeUser = (overrides = {}) => User.create({
  name: 'Lifecycle User',
  email: `lifecycle-${new mongoose.Types.ObjectId()}@example.test`,
  password,
  role: 'customer',
  isVerified: true,
  isActive: true,
  isDeleted: false,
  status: 'active',
  authVersion: 0,
  ...overrides,
});

const tokenFor = (user, state, overrides = {}) => jwt.sign({
  id: user._id.toString(),
  email: user.email,
  role: user.role,
  authVersion: Number(user.authVersion || 0),
  globalSessionEpoch: Number(state.globalSessionEpoch || 0),
  ...(user.role === 'customer'
    ? { otpVerified: true }
    : { authLevel: STAFF_2FA_AUTH_LEVEL, otpVerified: true }),
  ...overrides,
}, config.jwtSecret, { expiresIn: '1h' });

const request = async (path, { token, method = 'GET', body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    response,
    body: await response.json().catch(() => ({})),
  };
};

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    replSet: { count: 1 },
  });
  await mongoose.connect(replSet.getUri('autospf-system-lifecycle-security'));
  await Promise.all([
    User.init(),
    SystemState.init(),
    PaymentReconciliationEvent.init(),
    SystemMutationAdmission.init(),
  ]);

  const app = express();
  app.use(express.json());
  app.use(enforceSystemLifecycle);
  app.get('/protected', authenticate, (req, res) => res.json({ success: true, id: req.user.id }));
  app.get('/ordinary-read', (_req, res) => res.json({ success: true }));
  app.get('/api/orders/:orderId/billing', (_req, res) => res.json({ success: true }));
  app.get('/api/ai/generate-3d/:taskId', (_req, res) => res.json({ success: true }));
  app.post('/write', (_req, res) => res.json({ success: true }));
  app.post('/api/auth/register', (_req, res) => res.json({ success: true }));
  app.post('/api/orders', (_req, res) => res.json({ success: true }));
  app.post('/chat-onboarding', enforceAnonymousChatOnboarding, (_req, res) => (
    res.json({ success: true })
  ));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    SystemState.deleteMany({}),
    PaymentReconciliationEvent.deleteMany({}),
    SystemMutationAdmission.deleteMany({}),
    Notification.deleteMany({}),
    Payment.deleteMany({}),
    Order.deleteMany({}),
  ]);
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test('authVersion and global session epoch revoke customer sessions, and archive permits only the protected administrator', async () => {
  let state = await getSystemState();
  const customer = await makeUser();
  const customerV0 = tokenFor(customer, state);
  assert.equal((await request('/protected', { token: customerV0 })).response.status, 200);

  customer.authVersion = 1;
  await customer.save();
  const revokedByAccountVersion = await request('/protected', { token: customerV0 });
  assert.equal(revokedByAccountVersion.response.status, 401);
  assert.equal(revokedByAccountVersion.body.code, 'SESSION_REVOKED');

  const customerV1 = tokenFor(customer, state);
  assert.equal((await request('/protected', { token: customerV1 })).response.status, 200);
  state = await incrementGlobalSessionEpoch();
  const revokedGlobally = await request('/protected', { token: customerV1 });
  assert.equal(revokedGlobally.response.status, 401);
  assert.equal(revokedGlobally.body.code, 'GLOBAL_SESSION_REVOKED');

  const administrator = await makeUser({
    name: 'Protected Administrator',
    email: 'protected.lifecycle@example.test',
    role: 'administrator',
  });
  state = await SystemState.findOneAndUpdate(
    { key: 'primary' },
    {
      $set: {
        mode: 'archived',
        protectedAdministratorId: administrator._id,
        registrationEnabled: false,
        bookingsEnabled: false,
      },
    },
    { new: true },
  );

  const archivedCustomer = await request('/protected', { token: tokenFor(customer, state) });
  assert.equal(archivedCustomer.response.status, 423);
  assert.equal(archivedCustomer.body.code, 'SYSTEM_ARCHIVED');
  const archivedAdministrator = await request('/protected', {
    token: tokenFor(administrator, state),
  });
  assert.equal(archivedAdministrator.response.status, 200);
});

test('protected and last-usable Administrator mutations fail closed', async () => {
  const protectedAdministrator = await makeUser({
    email: 'protected.guard@example.test',
    role: 'administrator',
  });
  let state = await getSystemState();
  state.protectedAdministratorId = protectedAdministrator._id;
  await state.save();

  await assert.rejects(
    assertAdministratorMutationAllowed({
      targetUser: protectedAdministrator,
      changes: { isActive: false, status: 'suspended' },
    }),
    (error) => error.code === 'PROTECTED_ADMINISTRATOR' && error.statusCode === 409,
  );

  state.protectedAdministratorId = null;
  await state.save();
  await assert.rejects(
    assertAdministratorMutationAllowed({
      targetUser: protectedAdministrator,
      changes: { hardDelete: true, isDeleted: true, isActive: false },
    }),
    (error) => error.code === 'LAST_ADMINISTRATOR' && error.statusCode === 409,
  );

  await makeUser({
    email: 'second.guard@example.test',
    role: 'administrator',
  });
  await assert.rejects(
    assertAdministratorMutationAllowed({
      targetUser: protectedAdministrator,
      changes: { isActive: false, status: 'suspended' },
    }),
    (error) => error.code === 'LAST_ADMINISTRATOR' && error.statusCode === 409,
  );

  const survivingProtectedAdministrator = await makeUser({
    email: 'surviving.protected.guard@example.test',
    role: 'administrator',
  });
  state.protectedAdministratorId = survivingProtectedAdministrator._id;
  await state.save();
  await assert.doesNotReject(assertAdministratorMutationAllowed({
    targetUser: protectedAdministrator,
    changes: { isActive: false, status: 'suspended' },
  }));
});

test('persisted mutation lease and archive state block ordinary HTTP writes', async () => {
  const state = await getSystemState();
  state.mutationLease = {
    operationId: new mongoose.Types.ObjectId(),
    owner: 'test',
    acquiredAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  };
  await state.save();

  const leaseBlocked = await request('/write', { method: 'POST', body: {} });
  assert.equal(leaseBlocked.response.status, 503);
  assert.equal(leaseBlocked.body.code, 'SYSTEM_MUTATION_IN_PROGRESS');

  state.mutationLease = {};
  state.mode = 'archived';
  await state.save();
  const archiveBlocked = await request('/write', { method: 'POST', body: {} });
  assert.equal(archiveBlocked.response.status, 423);
  assert.equal(archiveBlocked.body.code, 'SYSTEM_ARCHIVED');
});

test('known mutating reads join the lease/archive barrier without blocking ordinary reads', async () => {
  const mutatingReads = [
    `/api/orders/${new mongoose.Types.ObjectId()}/billing`,
    '/api/ai/generate-3d/meshy-task-123',
    '/api/customers/me',
    '/api/settings',
    '/api/settings/public',
    '/api/orders/available-slots',
    '/api/slots',
    '/api/slots/schedule',
    '/api/slots/range',
    '/api/slots/settings',
    '/api/admin/availability/emergency',
    '/api/admin/availability/recurring',
    '/api/admin/availability/hours',
  ];
  const state = await getSystemState();
  state.mutationLease = {
    operationId: new mongoose.Types.ObjectId(),
    fencingToken: 'test-mutating-read-lease',
    owner: 'test',
    acquiredAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  };
  await state.save();

  for (const path of mutatingReads) {
    const blocked = await request(path);
    assert.equal(blocked.response.status, 503, path);
    assert.equal(blocked.body.code, 'SYSTEM_MUTATION_IN_PROGRESS', path);
  }
  const leaseBlockedHead = await request(mutatingReads[0], { method: 'HEAD' });
  assert.equal(leaseBlockedHead.response.status, 503);
  assert.equal((await request('/ordinary-read')).response.status, 200);

  state.mutationLease = {};
  state.mode = 'archived';
  await state.save();
  for (const path of mutatingReads) {
    const blocked = await request(path);
    assert.equal(blocked.response.status, 423, path);
    assert.equal(blocked.body.code, 'SYSTEM_ARCHIVED', path);
  }
  const archiveBlockedHead = await request(mutatingReads[0], { method: 'HEAD' });
  assert.equal(archiveBlockedHead.response.status, 423);
  assert.equal((await request('/ordinary-read')).response.status, 200);
});

test('mutation lease renewal and release are fenced to one live acquisition', async () => {
  const operationId = new mongoose.Types.ObjectId();
  const acquired = await acquireSystemMutationLease({
    operationId,
    owner: 'lease-fencing-test',
    ttlMs: 30_000,
  });
  const firstToken = acquired.mutationLease.fencingToken;
  assert.ok(firstToken);

  await assert.rejects(
    acquireSystemMutationLease({ operationId, owner: 'duplicate-attempt', ttlMs: 30_000 }),
    (error) => error.code === 'SYSTEM_MUTATION_LOCKED',
  );
  await assert.rejects(
    renewSystemMutationLease({ operationId, fencingToken: 'stale-token', ttlMs: 60_000 }),
    (error) => error.code === 'SYSTEM_MUTATION_LEASE_LOST',
  );
  assert.equal(await releaseSystemMutationLease({
    operationId,
    fencingToken: 'stale-token',
  }), false);

  const renewed = await renewSystemMutationLease({
    operationId,
    fencingToken: firstToken,
    ttlMs: 120_000,
  });
  assert.ok(renewed.mutationLease.expiresAt > acquired.mutationLease.expiresAt);

  await SystemState.updateOne(
    { key: 'primary' },
    { $set: { 'mutationLease.expiresAt': new Date(Date.now() - 1_000) } },
  );
  const replacement = await acquireSystemMutationLease({
    operationId,
    owner: 'replacement-attempt',
    ttlMs: 30_000,
  });
  const replacementToken = replacement.mutationLease.fencingToken;
  assert.notEqual(replacementToken, firstToken);
  await assert.rejects(
    renewSystemMutationLease({ operationId, fencingToken: firstToken, ttlMs: 60_000 }),
    (error) => error.code === 'SYSTEM_MUTATION_LEASE_LOST',
  );
  assert.equal(await releaseSystemMutationLease({ operationId, fencingToken: firstToken }), false);
  assert.equal(await releaseSystemMutationLease({
    operationId,
    fencingToken: replacementToken,
  }), true);
});

test('destructive drain waits for durable admissions from every backend instance', async () => {
  const localTicket = await beginTrackedSystemMutation({ kind: 'internal' });
  assert.equal(localTicket.allowed, true);
  await assert.rejects(
    waitForInFlightMutations({ timeoutMs: 25 }),
    (error) => error.code === 'MUTATION_DRAIN_TIMEOUT',
  );
  localTicket.release();
  await waitForInFlightMutations({ timeoutMs: 1_000 });

  const remote = await SystemMutationAdmission.create({
    token: `remote-${new mongoose.Types.ObjectId()}`,
    owner: 'another-backend-instance',
    kind: 'http',
    expiresAt: new Date(Date.now() + 60_000),
  });
  await assert.rejects(
    waitForInFlightMutations({ timeoutMs: 25 }),
    (error) => error.code === 'MUTATION_DRAIN_TIMEOUT',
  );
  await SystemMutationAdmission.deleteOne({ _id: remote._id });
  await waitForInFlightMutations({ timeoutMs: 1_000 });
});

test('decommissioning registration and booking gates use stable backend codes', async () => {
  const state = await getSystemState();
  state.registrationEnabled = false;
  state.bookingsEnabled = false;
  await state.save();

  const registration = await request('/api/auth/register', { method: 'POST', body: {} });
  assert.equal(registration.response.status, 403);
  assert.equal(registration.body.code, 'REGISTRATION_DISABLED');

  const booking = await request('/api/orders', { method: 'POST', body: {} });
  assert.equal(booking.response.status, 403);
  assert.equal(booking.body.code, 'BOOKINGS_DISABLED');

  const anonymousChat = await request('/chat-onboarding', { method: 'POST', body: {} });
  assert.equal(anonymousChat.response.status, 403);
  assert.equal(anonymousChat.body.code, 'REGISTRATION_DISABLED');
});

const invokeStripeWebhook = async (event) => {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  let statusCode = 200;
  let responseBody;
  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
    send(value) {
      responseBody = value;
      return this;
    },
  };
  await stripeWebhookHandler({
    body: Buffer.from(payload),
    headers: { 'stripe-signature': signature },
  }, res);
  return { statusCode, responseBody };
};

test('archived Stripe completed and failed events are idempotently reconciled without mutating payments or orders', async () => {
  const administrator = await makeUser({
    email: 'stripe.archive@example.test',
    role: 'administrator',
  });
  const state = await getSystemState();
  state.mode = 'archived';
  state.protectedAdministratorId = administrator._id;
  state.registrationEnabled = false;
  state.bookingsEnabled = false;
  await state.save();

  const paymentId = new mongoose.Types.ObjectId().toString();
  const orderId = new mongoose.Types.ObjectId().toString();
  const completed = {
    id: 'evt_archived_completed',
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: 'cs_archived_completed',
        object: 'checkout.session',
        status: 'complete',
        payment_status: 'paid',
        amount_total: 250000,
        currency: 'php',
        metadata: { paymentId, orderId },
      },
    },
  };

  const first = await invokeStripeWebhook(completed);
  const duplicate = await invokeStripeWebhook(completed);
  assert.equal(first.statusCode, 200);
  assert.equal(first.responseBody.archived, true);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(await PaymentReconciliationEvent.countDocuments({ eventId: completed.id }), 1);

  const completedRecord = await PaymentReconciliationEvent.findOne({ eventId: completed.id }).lean();
  assert.equal(completedRecord.signatureVerified, true);
  assert.equal(completedRecord.providerSnapshot.objectId, 'cs_archived_completed');
  assert.equal(completedRecord.providerSnapshot.amountMinor, 250000);
  assert.deepEqual(completedRecord.providerSnapshot.metadata, { orderId, paymentId });

  const failed = {
    id: 'evt_archived_failed',
    object: 'event',
    type: 'payment_intent.payment_failed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: 'pi_archived_failed',
        object: 'payment_intent',
        status: 'requires_payment_method',
        amount: 50000,
        currency: 'php',
        metadata: { paymentId, orderId },
      },
    },
  };
  const failedResponse = await invokeStripeWebhook(failed);
  assert.equal(failedResponse.statusCode, 200);
  assert.equal(await PaymentReconciliationEvent.countDocuments({}), 2);
  assert.equal(await Notification.countDocuments({ event: 'archived_payment_reconciliation' }), 2);
  assert.equal(await Payment.countDocuments({}), 0);
  assert.equal(await Order.countDocuments({}), 0);
});
