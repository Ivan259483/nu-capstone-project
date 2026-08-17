import test from 'node:test';
import assert from 'node:assert/strict';
import { after, before, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  ADMIN_NOTIFICATION_EVENT,
  ADMIN_NOTIFICATION_ROOM,
  buildAdminDeepLink,
  buildAdminGroupingBucket,
  buildAdminGroupingKey,
  createAdminNotificationService,
  formatAdminGroupedCopy,
  inferAdminNotificationSeverity,
  normalizeAdminDeepLink,
  toAdminNotificationPayload,
} from '../services/adminNotification.service.js';
import Notification from '../models/notification.model.js';

const FIXED_NOW = new Date('2026-08-17T02:30:00.000Z');
let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-admin-notification-service-test'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Notification.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

function makeModel({ groupedCount = 1 } = {}) {
  const calls = {
    create: [],
    findOneAndUpdate: [],
    findByIdAndUpdate: [],
  };

  class FakeNotificationModel {
    static async create(document) {
      calls.create.push(document);
      return {
        _id: 'notification-created',
        ...document,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      };
    }

    static async findOneAndUpdate(query, update, options) {
      calls.findOneAndUpdate.push({ query, update, options });
      return {
        _id: 'notification-grouped',
        ...update.$set,
        firstOccurredAt: update.$setOnInsert.firstOccurredAt,
        groupCount: groupedCount,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      };
    }

    static async findByIdAndUpdate(id, update, options) {
      calls.findByIdAndUpdate.push({ id, update, options });
      const grouped = calls.findOneAndUpdate.at(-1);
      return {
        _id: id,
        ...grouped.update.$set,
        ...update.$set,
        firstOccurredAt: grouped.update.$setOnInsert.firstOccurredAt,
        groupCount: groupedCount,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      };
    }
  }

  return { FakeNotificationModel, calls };
}

function makeSocket() {
  const emitted = [];
  return {
    emitted,
    io: {
      to(room) {
        return {
          emit(event, payload) {
            emitted.push({ room, event, payload });
          },
        };
      },
    },
  };
}

test('severity, grouping, and deep-link helpers use stable operational semantics', () => {
  assert.equal(inferAdminNotificationSeverity('payment-failed'), 'critical');
  assert.equal(inferAdminNotificationSeverity('low stock'), 'warning');
  assert.equal(inferAdminNotificationSeverity('stock_replenished'), 'success');
  assert.equal(inferAdminNotificationSeverity('booking_created'), 'info');

  assert.equal(
    buildAdminGroupingKey('inventory', 'low stock', 'SKU 42'),
    'inventory:low_stock:sku_42',
  );
  assert.equal(
    buildAdminGroupingBucket(FIXED_NOW, 5 * 60 * 1000),
    `300000:${Math.floor(FIXED_NOW.getTime() / 300000)}`,
  );
  assert.equal(formatAdminGroupedCopy('{count} new bookings received', 4), '4 new bookings received');
  assert.equal(
    buildAdminDeepLink('live_tracking', { orderId: 'ORD 123', ignored: { nested: true } }),
    '/admin/dashboard?tab=live_tracking&orderId=ORD+123',
  );
  assert.equal(normalizeAdminDeepLink('//evil.example/phish'), '/admin/dashboard');
});

test('createAdminNotification persists a normalized broadcast and emits the saved payload', async () => {
  const { FakeNotificationModel, calls } = makeModel();
  const socket = makeSocket();
  const service = createAdminNotificationService({
    NotificationModel: FakeNotificationModel,
    getSocketIO: () => socket.io,
    now: () => FIXED_NOW,
  });

  const notification = await service.createAdminNotification({
    category: 'payments',
    event: 'payment_completed',
    title: ' Payment received ',
    message: ' Payment ORD-42 was completed. ',
    link: '/admin/dashboard?tab=dashboard&panel=payments&paymentId=pay_42',
    action: { label: 'Review payment' },
    metadata: { paymentId: 'pay_42', orderId: 'ORD-42' },
  });

  assert.equal(notification._id, 'notification-created');
  assert.equal(calls.create.length, 1);
  assert.deepEqual(
    {
      title: calls.create[0].title,
      message: calls.create[0].message,
      type: calls.create[0].type,
      event: calls.create[0].event,
      category: calls.create[0].category,
      severity: calls.create[0].severity,
      source: calls.create[0].source,
      priority: calls.create[0].priority,
      recipientRole: calls.create[0].recipientRole,
      recipientUserId: calls.create[0].recipientUserId,
      actionRequired: calls.create[0].actionRequired,
    },
    {
      title: 'Payment received',
      message: 'Payment ORD-42 was completed.',
      type: 'success',
      event: 'payment_completed',
      category: 'payments',
      severity: 'success',
      source: 'Payments',
      priority: 'normal',
      recipientRole: 'admin_family',
      recipientUserId: null,
      actionRequired: false,
    },
  );
  assert.deepEqual(calls.create[0].action, {
    label: 'Review payment',
    link: '/admin/dashboard?tab=dashboard&panel=payments&paymentId=pay_42',
  });

  assert.equal(socket.emitted.length, 1);
  assert.equal(socket.emitted[0].room, ADMIN_NOTIFICATION_ROOM);
  assert.equal(socket.emitted[0].event, ADMIN_NOTIFICATION_EVENT);
  assert.equal(socket.emitted[0].payload.id, 'notification-created');
  assert.equal(socket.emitted[0].payload.severity, 'success');
  assert.equal(socket.emitted[0].payload.event, 'payment_completed');
  assert.equal(socket.emitted[0].payload.actionRequired, false);
  assert.equal(socket.emitted[0].payload.metadata.paymentId, 'pay_42');
});

test('grouping uses an atomic windowed upsert and refreshes grouped copy', async () => {
  const { FakeNotificationModel, calls } = makeModel({ groupedCount: 4 });
  const socket = makeSocket();
  const service = createAdminNotificationService({
    NotificationModel: FakeNotificationModel,
    getSocketIO: () => socket.io,
    now: () => FIXED_NOW,
  });
  const groupingKey = buildAdminGroupingKey('appointments', 'booking_created');

  const notification = await service.createAdminNotification({
    category: 'appointments',
    event: 'booking_created',
    title: 'New booking received',
    message: 'Ivan booked SPF 89 for Aug 19 at 8:00 AM.',
    groupingKey,
    groupingWindowMs: 5 * 60 * 1000,
    groupedTitle: '{count} new bookings received',
    groupedMessage: '{count} customer bookings were received in the last few minutes.',
    link: buildAdminDeepLink('appointments'),
    metadata: { latestOrderId: 'order-4' },
  });

  assert.equal(calls.create.length, 0);
  assert.equal(calls.findOneAndUpdate.length, 1);
  const groupedCall = calls.findOneAndUpdate[0];
  assert.equal(groupedCall.query.recipientRole, 'admin_family');
  assert.equal(groupedCall.query.recipientUserId, null);
  assert.equal(groupedCall.query.groupingKey, groupingKey);
  assert.equal(
    groupedCall.query.groupingBucket,
    `300000:${Math.floor(FIXED_NOW.getTime() / 300000)}`,
  );
  assert.equal(
    groupedCall.query.lastOccurredAt.$gte.toISOString(),
    '2026-08-17T02:25:00.000Z',
  );
  assert.deepEqual(groupedCall.update.$inc, { groupCount: 1 });
  assert.equal('isRead' in groupedCall.update.$set, false);
  assert.equal('readAt' in groupedCall.update.$set, false);
  assert.equal(groupedCall.update.$set.actionRequired, false);
  assert.equal(groupedCall.options.upsert, true);
  assert.equal(groupedCall.options.new, true);

  assert.equal(calls.findByIdAndUpdate.length, 1);
  assert.equal(notification.title, '4 new bookings received');
  assert.equal(
    notification.message,
    '4 customer bookings were received in the last few minutes.',
  );
  assert.equal(socket.emitted[0].payload.groupCount, 4);
  assert.equal(socket.emitted[0].payload.title, '4 new bookings received');
});

test('a socket outage never rolls back or hides a persisted admin notification', async () => {
  const { FakeNotificationModel } = makeModel();
  const warnings = [];
  const service = createAdminNotificationService({
    NotificationModel: FakeNotificationModel,
    getSocketIO: () => {
      throw new Error('Socket.io not initialized');
    },
    now: () => FIXED_NOW,
    logger: { warn: (...args) => warnings.push(args.join(' ')) },
  });

  const notification = await service.createAdminNotification({
    category: 'inventory',
    event: 'out_of_stock',
    title: 'Out of stock',
    message: 'Ceramic Coating is now out of stock.',
  });

  assert.equal(notification._id, 'notification-created');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Socket emission unavailable/);
});

test('payload conversion preserves backward-compatible and premium fields', () => {
  const payload = toAdminNotificationPayload({
    _id: { toString: () => 'n-7' },
    title: 'SLA breached',
    message: 'ORD-7 missed its SLA.',
    type: 'error',
    category: 'live_tracking',
    severity: 'critical',
    source: 'Live Tracking',
    groupCount: 2,
    groupingKey: 'live_tracking:sla_breached:ord_7',
    metadata: { orderId: 'ORD-7' },
    createdAt: FIXED_NOW,
  });

  assert.equal(payload.id, 'n-7');
  assert.equal(payload._id, 'n-7');
  assert.equal(payload.type, 'error');
  assert.equal(payload.category, 'live_tracking');
  assert.equal(payload.severity, 'critical');
  assert.equal(payload.actionRequired, true);
  assert.equal(payload.groupCount, 2);
  assert.equal(payload.isRead, false);
});

test('invalid category, severity, and missing copy fail before persistence', async () => {
  const { FakeNotificationModel, calls } = makeModel();
  const service = createAdminNotificationService({
    NotificationModel: FakeNotificationModel,
    getSocketIO: () => makeSocket().io,
    now: () => FIXED_NOW,
  });

  await assert.rejects(
    service.createAdminNotification({ category: 'marketing', title: 'x', message: 'y' }),
    /Unsupported admin notification category/,
  );
  await assert.rejects(
    service.createAdminNotification({
      category: 'system',
      severity: 'urgent',
      title: 'x',
      message: 'y',
    }),
    /Unsupported admin notification severity/,
  );
  await assert.rejects(
    service.createAdminNotification({ category: 'system', title: '', message: 'y' }),
    /title is required/,
  );
  assert.equal(calls.create.length, 0);
  assert.equal(calls.findOneAndUpdate.length, 0);
});

test('real Mongo groups sequential and concurrent occurrences into one persisted row', async () => {
  const service = createAdminNotificationService({
    NotificationModel: Notification,
    getSocketIO: () => {
      throw new Error('socket intentionally absent in persistence test');
    },
    now: () => FIXED_NOW,
    logger: { warn() {} },
  });
  const groupingKey = buildAdminGroupingKey('appointments', 'booking_created');
  const input = {
    category: 'appointments',
    event: 'booking_created',
    title: 'New booking received',
    message: 'A customer booking was received.',
    groupingKey,
    groupingWindowMs: 10 * 60 * 1000,
  };

  await service.createAdminNotification(input);
  await service.createAdminNotification(input);

  let rows = await Notification.find({ groupingKey }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].groupCount, 2);
  assert.equal(rows[0].event, 'booking_created');

  await Promise.all([
    service.createAdminNotification(input),
    service.createAdminNotification(input),
  ]);

  rows = await Notification.find({ groupingKey }).lean();
  assert.equal(rows.length, 1, 'concurrent occurrences must not create duplicate groups');
  assert.equal(rows[0].groupCount, 4);

  const coldGroupingKey = buildAdminGroupingKey('appointments', 'booking_rescheduled');
  const coldInput = {
    ...input,
    event: 'booking_rescheduled',
    groupingKey: coldGroupingKey,
    title: 'Booking rescheduled',
  };
  await Promise.all([
    service.createAdminNotification(coldInput),
    service.createAdminNotification(coldInput),
  ]);
  const coldRows = await Notification.find({ groupingKey: coldGroupingKey }).lean();
  assert.equal(coldRows.length, 1, 'a cold concurrent upsert must create one group');
  assert.equal(coldRows[0].groupCount, 2);
});
