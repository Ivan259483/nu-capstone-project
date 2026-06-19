import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY = 'test_resend_key';

const { default: Notification } = await import('../models/notification.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Customer } = await import('../models/customer.model.js');
const {
  createCustomerStageNotification,
  createCustomerStageMediaNotification,
  setCustomerNotificationEmailSenderForTests,
} = await import('../utils/customerStageNotifications.utils.js');

let mongo;
let sentEmails;

const pickupMedia = () =>
  ['front', 'rear', 'left', 'right', 'close_up'].map((slot) => ({
    stage: 'ready_pickup',
    slot,
    photoUrl: `https://example.com/${slot}.jpg`,
  }));

async function seedOrder({
  customerEmail = 'customer@example.com',
  createUser = true,
  status = 'confirmed',
  serviceTrackingStage = 'confirmed',
  paymentStatus = 'unpaid',
  trackerStageMedia = [],
  qcCompletedAt = null,
  totalPrice = 1000,
  downPaymentAmount = 300,
} = {}) {
  const customer = createUser
    ? await User.create({
        name: 'Test Customer',
        email: customerEmail,
        role: 'customer',
        status: 'active',
      })
    : new mongoose.Types.ObjectId();

  const order = await Order.create({
    orderNumber: `ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    customer: customer._id || customer,
    customerName: 'Test Customer',
    serviceType: 'SPF 80 - Essential',
    vehicleYear: '2022',
    vehicleMake: 'Acura',
    vehicleModel: 'ILX',
    bookingReference: `ASPF-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    status,
    serviceTrackingStage,
    paymentStatus,
    trackerStageMedia,
    qcCompletedAt,
    totalPrice,
    totalAmount: totalPrice,
    downPaymentAmount,
  });

  return { customer, order };
}

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-customer-notifications-test'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Notification.syncIndexes();
  sentEmails = [];
  process.env.RESEND_API_KEY = 'test_resend_key';
  setCustomerNotificationEmailSenderForTests(async ({ to, spec, idempotencyKey }) => {
    sentEmails.push({ to, spec, idempotencyKey });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      success: true,
      messageId: `email-${sentEmails.length}`,
      subject: spec.emailSubject || spec.subject,
    };
  });
});

after(async () => {
  setCustomerNotificationEmailSenderForTests(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('duplicate concurrent stage calls create one notification and send one email', async () => {
  const { order } = await seedOrder();

  await Promise.all([
    createCustomerStageNotification(order, 'confirmed'),
    createCustomerStageNotification(order._id, 'confirmed'),
  ]);

  const notifications = await Notification.find({}).lean();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].metadata.kind, 'confirmed');
  assert.match(notifications[0].metadata.idempotencyKey, /^customer:.+:order:.+:kind:confirmed:stage:confirmed$/);
  assert.equal(notifications[0].metadata.emailStatus, 'sent');
  assert.equal(notifications[0].metadata.emailSent, true);
  assert.equal(sentEmails.length, 1);
});

test('ready pickup with pending payment creates payment due instead of pickup copy', async () => {
  const { order } = await seedOrder({
    status: 'ready_for_payment',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'unpaid',
    trackerStageMedia: pickupMedia(),
    qcCompletedAt: new Date(),
  });

  const notification = await createCustomerStageNotification(order, 'ready_pickup');

  assert.equal(notification.metadata.kind, 'payment_due');
  assert.equal(notification.priority, 'high');
  assert.match(notification.message, /remaining balance|Payment confirmation/i);
  assert.doesNotMatch(notification.message, /ready for collection/i);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].spec.kind, 'payment_due');
});

test('ready pickup sends only when QC, evidence, and payment are complete', async () => {
  const { order } = await seedOrder({
    status: 'completed',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'paid',
    trackerStageMedia: pickupMedia(),
    qcCompletedAt: new Date(),
  });

  const notification = await createCustomerStageNotification(order, 'ready_pickup');

  assert.equal(notification.metadata.kind, 'ready_pickup');
  assert.equal(notification.priority, 'high');
  assert.match(notification.message, /ready for collection/i);
  assert.equal(notification.metadata.emailStatus, 'sent');
  assert.equal(sentEmails.length, 1);
});

test('stage media notification sends once for meaningful evidence, not per photo slot', async () => {
  const { order } = await seedOrder({
    status: 'received',
    serviceTrackingStage: 'received',
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: 'https://example.com/front.jpg' },
    ],
  });

  await createCustomerStageMediaNotification(order, 'received');
  order.trackerStageMedia.push({
    stage: 'received',
    slot: 'rear',
    photoUrl: 'https://example.com/rear.jpg',
  });
  await order.save({ validateBeforeSave: false });
  await createCustomerStageMediaNotification(order._id, 'received');

  const notifications = await Notification.find({ 'metadata.kind': 'stage_media' }).lean();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].metadata.mediaCount, 2);
  assert.equal(sentEmails.length, 1);
});

test('email is skipped when Resend config is missing', async () => {
  process.env.RESEND_API_KEY = '';
  const { order } = await seedOrder();

  const notification = await createCustomerStageNotification(order, 'confirmed');

  assert.equal(notification.metadata.emailStatus, 'skipped');
  assert.equal(notification.metadata.emailSkippedReason, 'missing_resend_config');
  assert.equal(sentEmails.length, 0);
});

test('email is skipped when customer email is disabled', async () => {
  const { customer, order } = await seedOrder();
  await Customer.create({
    user: customer._id,
    notificationPreferences: { emailEnabled: false },
  });

  const notification = await createCustomerStageNotification(order, 'confirmed');

  assert.equal(notification.metadata.emailStatus, 'skipped');
  assert.equal(notification.metadata.emailSkippedReason, 'customer_email_disabled');
  assert.equal(sentEmails.length, 0);
});

test('email is skipped when no registered customer email exists', async () => {
  const { customer, order } = await seedOrder();
  await User.updateOne({ _id: customer._id }, { $unset: { email: '' } });

  const notification = await createCustomerStageNotification(order, 'confirmed');

  assert.equal(notification.metadata.emailStatus, 'skipped');
  assert.equal(notification.metadata.emailSkippedReason, 'missing_customer_email');
  assert.equal(sentEmails.length, 0);
});
