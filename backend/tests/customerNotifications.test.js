import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY = 'test_resend_key';

const { default: Notification } = await import('../models/notification.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Customer } = await import('../models/customer.model.js');
const { default: NotificationUserState } = await import(
  '../models/notificationUserState.model.js'
);
const { createCustomerNotification } = await import(
  '../services/customerNotification.service.js'
);
const { runAppointmentReminderSweep } = await import(
  '../services/appointmentReminder.service.js'
);
const {
  getNotifications,
  markAllAsRead,
  markAsRead,
} = await import('../controllers/notification.controller.js');
const { registerPushToken, unregisterPushToken } = await import(
  '../controllers/user.controller.js'
);
const {
  createCustomerBookingCancelledNotification,
  createCustomerBookingRescheduledNotification,
  createCustomerPaymentConfirmedNotification,
  createCustomerServiceProgressNotification,
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
  bookingDate,
  bookingTime,
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
    bookingDate,
    bookingTime,
  });

  if (paymentStatus === 'paid') {
    await Payment.create({
      invoiceId: `TEST-${order.orderNumber}`,
      order: order._id,
      customer: customer._id || customer,
      amount: totalPrice,
      amountSubmitted: totalPrice,
      amountVerified: totalPrice,
      status: 'succeeded',
      transactionType: 'full_service_payment',
      method: 'cash',
      submittedAt: new Date(),
      effectiveAt: new Date(),
    });
  }

  return { customer, order };
}

function invoke(handler, {
  userId,
  role = 'customer',
  query = {},
  params = {},
  body = {},
} = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      user: { id: userId.toString(), role },
      query,
      params,
      body,
    };
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, body: payload });
      },
    };
    const next = (error) => (error ? reject(error) : resolve({ statusCode: 200, body: null }));
    Promise.resolve(handler(req, response, next)).catch(reject);
  });
}

function manilaDateString(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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
  await NotificationUserState.syncIndexes();
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

test('booking reschedule and cancellation each create at most one external email', async () => {
  const { order } = await seedOrder({
    bookingDate: '2026-09-15',
    bookingTime: '2:00 PM',
  });

  await createCustomerBookingRescheduledNotification(order, {
    oldDate: '2026-09-14',
    oldTime: '1:00 PM',
  });
  await createCustomerBookingRescheduledNotification(order._id, {
    oldDate: '2026-09-14',
    oldTime: '1:00 PM',
  });
  await createCustomerBookingCancelledNotification(order, 'Customer request');
  await createCustomerBookingCancelledNotification(order._id, 'Customer request');

  assert.equal(await Notification.countDocuments({ event: 'booking_rescheduled' }), 1);
  assert.equal(await Notification.countDocuments({ event: 'booking_cancelled' }), 1);
  assert.equal(sentEmails.length, 2);
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

test('category OFF suppresses Email but keeps the in-app operational record', async () => {
  const { customer, order } = await seedOrder();
  await Customer.create({
    user: customer._id,
    notificationPreferences: { bookingConfirmation: false },
  });

  const notification = await createCustomerStageNotification(order, 'confirmed');

  assert.ok(notification?._id);
  assert.equal(await Notification.countDocuments({}), 1);
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

test('email delivery failure does not roll back the in-app notification', async () => {
  setCustomerNotificationEmailSenderForTests(async () => {
    throw new Error('Provider unavailable');
  });
  const { order } = await seedOrder();

  const notification = await createCustomerStageNotification(order, 'confirmed');

  assert.ok(notification?._id);
  assert.equal(await Notification.countDocuments({}), 1);
  assert.equal(notification.metadata.emailStatus, 'failed');
  assert.match(notification.metadata.emailError, /Provider unavailable/);
});

test('customer inbox, individual read, and read-all are isolated and persistent', async () => {
  const customerA = await User.create({
    name: 'Customer A', email: 'customer-a@example.com', role: 'customer', status: 'active',
  });
  const customerB = await User.create({
    name: 'Customer B', email: 'customer-b@example.com', role: 'customer', status: 'active',
  });

  const notificationA1 = await createCustomerNotification({
    userId: customerA._id,
    event: 'booking_confirmed',
    category: 'important',
    title: 'Booking Confirmed',
    message: 'Customer A booking was confirmed.',
    eventKey: 'customer-a-booking-confirmed',
  });
  await createCustomerNotification({
    userId: customerA._id,
    event: 'promotion',
    category: 'promotion',
    title: 'Customer A Offer',
    message: 'A private offer for Customer A.',
    eventKey: 'customer-a-promotion',
  });
  const notificationB = await createCustomerNotification({
    userId: customerB._id,
    event: 'vehicle_received',
    category: 'service',
    title: 'Vehicle Received',
    message: 'Customer B vehicle was received.',
    eventKey: 'customer-b-vehicle-received',
  });

  const inboxA = await invoke(getNotifications, { userId: customerA._id });
  assert.equal(inboxA.body.data.length, 2);
  assert.equal(inboxA.body.unreadCount, 2);
  assert.equal(inboxA.body.facets.unreadCategories.important, 1);
  assert.equal(inboxA.body.facets.unreadCategories.promotion, 1);
  assert.ok(inboxA.body.data.every((row) => String(row.recipientUserId) === String(customerA._id)));

  await assert.rejects(
    invoke(markAsRead, {
      userId: customerA._id,
      params: { id: notificationB._id.toString() },
    }),
    (error) => error?.status === 404
  );

  const marked = await invoke(markAsRead, {
    userId: customerA._id,
    params: { id: notificationA1._id.toString() },
  });
  assert.equal(marked.body.unreadCount, 1);

  const persisted = await invoke(getNotifications, { userId: customerA._id });
  assert.equal(
    persisted.body.data.find((row) => String(row._id) === String(notificationA1._id)).isRead,
    true
  );

  const readAll = await invoke(markAllAsRead, { userId: customerA._id });
  assert.equal(readAll.body.unreadCount, 0);
  const customerBInbox = await invoke(getNotifications, { userId: customerB._id });
  assert.equal(customerBInbox.body.unreadCount, 1);
  assert.equal(String(customerBInbox.body.data[0]._id), String(notificationB._id));
});

test('identical progress and appointment reminder events are idempotent', async () => {
  const now = new Date('2026-08-23T02:00:00.000Z');
  const bookingDate = manilaDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const { order } = await seedOrder({ bookingDate, bookingTime: '2:00 PM' });

  await createCustomerServiceProgressNotification(order, 50);
  await createCustomerServiceProgressNotification(order._id, 50);
  await createCustomerServiceProgressNotification(order, 75);
  await createCustomerPaymentConfirmedNotification(order, {
    paymentId: new mongoose.Types.ObjectId(),
    amount: 1000,
  });
  await createCustomerPaymentConfirmedNotification(order, { amount: 1000 });
  await runAppointmentReminderSweep(now);
  await runAppointmentReminderSweep(now);

  assert.equal(await Notification.countDocuments({ event: 'service_progress' }), 2);
  assert.equal(
    await Notification.countDocuments({
      event: 'service_progress',
      'metadata.progress': 50,
    }),
    1
  );
  assert.equal(await Notification.countDocuments({ event: 'appointment_reminder' }), 1);
  assert.equal(await Notification.countDocuments({ event: 'payment_confirmed' }), 1);
  const reminder = await Notification.findOne({ event: 'appointment_reminder' }).lean();
  assert.match(reminder.message, /2:00 PM/);
  assert.equal(reminder.metadata.orderId, order._id.toString());
});

test('one device push token transfers between accounts and unregisters on logout', async () => {
  const customerA = await User.create({
    name: 'Push Customer A', email: 'push-a@example.com', role: 'customer', status: 'active',
  });
  const customerB = await User.create({
    name: 'Push Customer B', email: 'push-b@example.com', role: 'customer', status: 'active',
  });
  const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

  await invoke(registerPushToken, { userId: customerA._id, body: { token } });
  await invoke(registerPushToken, { userId: customerB._id, body: { token } });

  const [afterA, afterB] = await Promise.all([
    User.findById(customerA._id).lean(),
    User.findById(customerB._id).lean(),
  ]);
  assert.deepEqual(afterA.expoPushTokens, []);
  assert.deepEqual(afterB.expoPushTokens, [token]);

  await invoke(unregisterPushToken, { userId: customerB._id, body: { token } });
  const loggedOut = await User.findById(customerB._id).lean();
  assert.deepEqual(loggedOut.expoPushTokens, []);
});
