import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { default: Customer } = await import('../models/customer.model.js');
const { default: Notification } = await import('../models/notification.model.js');
const { default: User } = await import('../models/user.model.js');
const {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} = await import('../controllers/customer.controller.js');
const {
  createCustomerNotification,
  setCustomerPushSenderForTests,
} = await import('../services/customerNotification.service.js');
const {
  CUSTOMER_NOTIFICATION_PREFERENCE_FIELDS,
  customerNotificationAllowsExternalDelivery,
  normalizeCustomerNotificationPreferences,
  resolveCustomerNotificationPreferenceField,
} = await import('../utils/customerNotificationPreferences.utils.js');

let mongo;
let sentPushes;

function invoke(handler, { userId, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { user: { id: String(userId), role: 'customer' }, body };
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload });
        return this;
      },
    };
    Promise.resolve(handler(req, response, reject)).catch(reject);
  });
}

async function createCustomerUser(suffix) {
  return User.create({
    name: `Customer ${suffix}`,
    email: `customer-${suffix}@example.com`,
    role: 'customer',
    status: 'active',
    expoPushTokens: [`ExponentPushToken[${suffix.repeat(22).slice(0, 22)}]`],
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('autospf-notification-preferences-test'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Notification.syncIndexes();
  sentPushes = [];
  setCustomerPushSenderForTests(async (tokens, title, message, data) => {
    sentPushes.push({ tokens, title, message, data });
    return { tickets: [], receiptTokens: {}, invalidTokens: [] };
  });
});

after(async () => {
  setCustomerPushSenderForTests(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('canonical preferences expose exactly six safe backward-compatible defaults', () => {
  const normalized = normalizeCustomerNotificationPreferences({
    pushEnabled: false,
    smsEnabled: true,
    promotionalOffers: false,
  });

  assert.deepEqual(Object.keys(normalized), [...CUSTOMER_NOTIFICATION_PREFERENCE_FIELDS]);
  assert.deepEqual(normalized, {
    pushEnabled: false,
    emailEnabled: true,
    bookingConfirmation: true,
    jobStatusUpdates: true,
    paymentReminders: true,
    vehicleReminders: true,
  });
  assert.equal('smsEnabled' in normalized, false);
  assert.equal('promotionalOffers' in normalized, false);
});

test('one shared resolver enforces channel AND category for supported events', () => {
  const preferences = {
    pushEnabled: true,
    emailEnabled: false,
    bookingConfirmation: true,
    jobStatusUpdates: false,
    paymentReminders: true,
    vehicleReminders: false,
  };

  const booking = { event: 'booking_rescheduled' };
  const job = { event: 'service_progress' };
  const payment = { event: 'payment_confirmed' };
  const vehicle = { notificationPreferenceField: 'vehicleReminders' };

  assert.equal(resolveCustomerNotificationPreferenceField(booking), 'bookingConfirmation');
  assert.equal(resolveCustomerNotificationPreferenceField(job), 'jobStatusUpdates');
  assert.equal(resolveCustomerNotificationPreferenceField(payment), 'paymentReminders');
  assert.equal(resolveCustomerNotificationPreferenceField(vehicle), 'vehicleReminders');
  assert.equal(customerNotificationAllowsExternalDelivery(preferences, booking, 'push'), true);
  assert.equal(customerNotificationAllowsExternalDelivery(preferences, booking, 'email'), false);
  assert.equal(customerNotificationAllowsExternalDelivery(preferences, job, 'push'), false);
  assert.equal(customerNotificationAllowsExternalDelivery(preferences, payment, 'push'), true);
  assert.equal(customerNotificationAllowsExternalDelivery(preferences, vehicle, 'push'), false);
  assert.equal(
    customerNotificationAllowsExternalDelivery(preferences, { event: 'loyalty_points_earned' }, 'push'),
    false
  );
});

test('preference endpoint persists only canonical fields and isolates customer accounts', async () => {
  const customerA = await createCustomerUser('a');
  const customerB = await createCustomerUser('b');

  const initial = await invoke(getMyNotificationPreferences, { userId: customerA._id });
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.data, {
    pushEnabled: true,
    emailEnabled: true,
    bookingConfirmation: true,
    jobStatusUpdates: true,
    paymentReminders: true,
    vehicleReminders: true,
  });

  const updated = await invoke(updateMyNotificationPreferences, {
    userId: customerA._id,
    body: {
      notificationPreferences: {
        pushEnabled: false,
        emailEnabled: true,
        bookingConfirmation: false,
        jobStatusUpdates: true,
        paymentReminders: false,
        vehicleReminders: true,
      },
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.pushEnabled, false);
  assert.equal(updated.body.data.bookingConfirmation, false);
  assert.equal(updated.body.data.paymentReminders, false);

  const persistedA = await Customer.findOne({ user: customerA._id }).lean();
  assert.equal(persistedA.notificationPreferences.pushEnabled, false);
  assert.equal(persistedA.notificationPreferences.bookingConfirmation, false);
  assert.equal(persistedA.notificationPreferences.paymentReminders, false);

  const accountB = await invoke(getMyNotificationPreferences, { userId: customerB._id });
  assert.equal(accountB.body.data.pushEnabled, true);
  assert.equal(accountB.body.data.bookingConfirmation, true);
  assert.equal(accountB.body.data.paymentReminders, true);

  const removed = await invoke(updateMyNotificationPreferences, {
    userId: customerA._id,
    body: { notificationPreferences: { smsEnabled: true } },
  });
  assert.equal(removed.status, 400);
  assert.match(removed.body.message, /smsEnabled/);
});

test('rapid serialized preference updates leave MongoDB at the final visible value', async () => {
  const customer = await createCustomerUser('r');
  const states = [true, false, true, false];

  for (const pushEnabled of states) {
    const result = await invoke(updateMyNotificationPreferences, {
      userId: customer._id,
      body: { notificationPreferences: { pushEnabled } },
    });
    assert.equal(result.status, 200);
  }

  const persisted = await Customer.findOne({ user: customer._id }).lean();
  assert.equal(persisted.notificationPreferences.pushEnabled, false);
});

test('external Push is suppressed by preferences while the in-app record remains', async () => {
  const customer = await createCustomerUser('p');
  await Customer.create({
    user: customer._id,
    notificationPreferences: {
      pushEnabled: true,
      emailEnabled: true,
      bookingConfirmation: true,
      jobStatusUpdates: false,
      paymentReminders: true,
      vehicleReminders: true,
    },
  });

  await createCustomerNotification({
    userId: customer._id,
    event: 'service_progress',
    category: 'service',
    title: 'Service update',
    message: 'Your service is 50% complete.',
    eventKey: 'job-status-off',
  });
  assert.equal(await Notification.countDocuments({ recipientUserId: customer._id }), 1);
  assert.equal(sentPushes.length, 0);

  await Customer.updateOne(
    { user: customer._id },
    { $set: { 'notificationPreferences.jobStatusUpdates': true } }
  );
  await createCustomerNotification({
    userId: customer._id,
    event: 'service_progress',
    category: 'service',
    title: 'Service update',
    message: 'Your service is 75% complete.',
    eventKey: 'job-status-on',
  });
  assert.equal(await Notification.countDocuments({ recipientUserId: customer._id }), 2);
  assert.equal(sentPushes.length, 1);

  await createCustomerNotification({
    userId: customer._id,
    event: 'service_progress',
    category: 'service',
    title: 'Service update',
    message: 'Your service is 75% complete.',
    eventKey: 'job-status-on',
  });
  assert.equal(sentPushes.length, 1);
});
