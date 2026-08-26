import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.RESEND_API_KEY ||= 'test_resend_key';

const { default: Notification } = await import('../models/notification.model.js');
const { default: NotificationUserState } = await import(
  '../models/notificationUserState.model.js'
);
const {
  bulkSetArchivedState,
  bulkSetReadState,
  clearNotifications,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} = await import('../controllers/notification.controller.js');

let mongo;

function invoke(handler, {
  userId = new mongoose.Types.ObjectId(),
  role = 'administrator',
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
    const next = (error) => {
      if (error) reject(error);
      else resolve({ statusCode: response.statusCode, body: null });
    };
    Promise.resolve(handler(req, response, next)).catch(reject);
  });
}

async function createAdminNotification(overrides = {}) {
  return Notification.create({
    title: 'Operational update',
    message: 'An operational event needs attention.',
    type: 'system_update',
    category: 'system',
    severity: 'info',
    source: 'System',
    recipientRole: 'admin_family',
    link: '/admin/dashboard',
    ...overrides,
  });
}

async function createQualityNotification(overrides = {}) {
  return Notification.create({
    title: 'Quality action required',
    message: 'Review the service evidence for this job.',
    type: 'EVIDENCE_REQUIRED',
    event: 'evidence_required',
    category: 'live_tracking',
    severity: 'warning',
    source: 'Quality Command Center',
    actionRequired: true,
    recipientRole: 'staff_quality_checker',
    metadata: {
      channel: 'quality_control',
      notificationType: 'EVIDENCE_REQUIRED',
      orderId: new mongoose.Types.ObjectId().toString(),
      stage: 'in_progress',
    },
    ...overrides,
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-admin-notifications-api-test'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Notification.syncIndexes();
  await NotificationUserState.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('role broadcasts keep read state isolated and persistent for each administrator', async () => {
  const adminA = new mongoose.Types.ObjectId();
  const adminB = new mongoose.Types.ObjectId();
  const notification = await createAdminNotification({
    title: 'Emergency closure enabled',
    message: 'Bookings for today were temporarily closed.',
    type: 'emergency_closure_enabled',
    category: 'appointments',
    severity: 'critical',
    source: 'Availability Controls',
    actionRequired: true,
    action: { label: 'Review availability', link: '/admin/availability' },
    link: '/admin/availability',
  });

  const initial = await invoke(getNotifications, { userId: adminA });
  assert.equal(initial.body.unreadCount, 1);
  assert.equal(initial.body.data[0].isRead, false);
  assert.equal(initial.body.data[0].severity, 'critical');
  assert.equal(initial.body.data[0].sourceModule, 'Availability Controls');
  assert.equal(initial.body.data[0].quickAction.label, 'Review availability');

  const marked = await invoke(markAsRead, {
    userId: adminA,
    params: { id: notification._id.toString() },
  });
  assert.equal(marked.body.data.isRead, true);
  assert.ok(marked.body.data.readAt);
  assert.equal(marked.body.unreadCount, 0);

  const [forAdminA, forAdminB, sourceDocument] = await Promise.all([
    invoke(getNotifications, { userId: adminA }),
    invoke(getNotifications, { userId: adminB }),
    Notification.findById(notification._id).lean(),
  ]);
  assert.equal(forAdminA.body.data[0].isRead, true);
  assert.equal(forAdminA.body.unreadCount, 0);
  assert.equal(forAdminB.body.data[0].isRead, false);
  assert.equal(forAdminB.body.unreadCount, 1);
  assert.equal(sourceDocument.isRead, false, 'a broadcast source row must not be globally read');
  assert.equal(await NotificationUserState.countDocuments({}), 1);

  // A grouped notification reuses its ID. A newer occurrence must resurface
  // without deleting receipt history or touching every administrator row.
  const nextOccurrence = new Date(new Date(marked.body.data.readAt).getTime() + 1);
  await Notification.updateOne(
    { _id: notification._id },
    { $set: { lastOccurredAt: nextOccurrence }, $inc: { groupCount: 1 } }
  );
  const resurfaced = await invoke(getNotifications, { userId: adminA });
  assert.equal(resurfaced.body.data[0].isRead, false);
  assert.equal(resurfaced.body.data[0].readAt, null);
  assert.equal(resurfaced.body.data[0].groupCount, 2);
  assert.equal(resurfaced.body.unreadCount, 1);

  const unreadAgain = await invoke(markAsRead, {
    userId: adminA,
    params: { id: notification._id.toString() },
    body: { isRead: false },
  });
  assert.equal(unreadAgain.body.data.isRead, false);
  assert.equal(unreadAgain.body.unreadCount, 1);
});

test('list supports search, category/type aliases, severity, read filter and pagination', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const baseTime = Date.now() - 10_000;
  const lowStock = await createAdminNotification({
    title: 'Low stock alert',
    message: 'Ceramic Coating stock is below its reorder threshold.',
    type: 'warning',
    event: 'low_stock',
    category: 'inventory',
    severity: 'warning',
    source: 'Inventory',
    lastOccurredAt: new Date(baseTime + 4000),
  });
  await createAdminNotification({
    title: 'Out of stock alert',
    message: 'PPF Film stock is unavailable.',
    type: 'error',
    event: 'out_of_stock',
    category: 'inventory',
    severity: 'critical',
    source: 'Inventory',
    lastOccurredAt: new Date(baseTime + 3000),
  });
  await createAdminNotification({
    title: 'New booking received',
    message: 'A customer booked SPF 89 – Advanced.',
    type: 'booking',
    event: 'booking_created',
    category: 'appointments',
    severity: 'info',
    source: 'Appointments',
    lastOccurredAt: new Date(baseTime + 2000),
  });
  await createAdminNotification({
    title: 'Permissions changed',
    message: 'A staff permission set was updated.',
    type: 'warning',
    event: 'permissions_changed',
    category: 'security',
    severity: 'warning',
    source: 'User Management',
    lastOccurredAt: new Date(baseTime + 1000),
  });

  await invoke(markAsRead, {
    userId: adminId,
    params: { id: lowStock._id.toString() },
  });

  const filtered = await invoke(getNotifications, {
    userId: adminId,
    query: {
      search: 'stock',
      category: 'inventory',
      severity: 'critical',
      readStatus: 'unread',
      page: '1',
      limit: '1',
    },
  });
  assert.equal(filtered.body.data.length, 1);
  assert.equal(filtered.body.data[0].event, 'out_of_stock');
  assert.deepEqual(filtered.body.pagination, {
    page: 1,
    limit: 1,
    total: 1,
    pages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  assert.equal(filtered.body.unreadCount, 3, 'badge count is independent of current list filters');
  assert.equal(filtered.body.facets.categories.inventory, 2);
  assert.equal(filtered.body.facets.severities.warning, 2);

  const bookingAlias = await invoke(getNotifications, {
    userId: adminId,
    query: { type: 'booking', limit: '10' },
  });
  assert.equal(bookingAlias.body.pagination.total, 1);
  assert.equal(bookingAlias.body.data[0].category, 'appointments');

  const eventType = await invoke(getNotifications, {
    userId: adminId,
    query: { type: 'out_of_stock' },
  });
  assert.equal(eventType.body.pagination.total, 1);
  assert.equal(eventType.body.data[0].severity, 'critical');

  const systemTab = await invoke(getNotifications, {
    userId: adminId,
    query: { tab: 'system' },
  });
  assert.equal(systemTab.body.pagination.total, 1);
  assert.equal(systemTab.body.data[0].category, 'security');

  await assert.rejects(
    () => invoke(getNotifications, { userId: adminId, query: { severity: 'urgent' } }),
    (error) => error.status === 400 && /severity/i.test(error.message)
  );
});

test('bulk read, archive, restore and clear remain explicitly scoped to accessible rows', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const first = await createAdminNotification({ title: 'First alert' });
  const second = await createAdminNotification({ title: 'Second alert' });
  const third = await createAdminNotification({ title: 'Third alert' });
  const inaccessible = await createAdminNotification({
    title: 'Private customer alert',
    recipientRole: 'customer',
    recipientUserId: otherUserId,
  });

  const marked = await invoke(bulkSetReadState, {
    userId: adminId,
    body: {
      ids: [first._id.toString(), second._id.toString(), inaccessible._id.toString()],
      isRead: true,
    },
  });
  assert.equal(marked.body.modifiedCount, 2);
  assert.equal(marked.body.unreadCount, 1);

  const archived = await invoke(bulkSetArchivedState, {
    userId: adminId,
    body: { ids: [first._id.toString()] },
  });
  assert.equal(archived.body.modifiedCount, 1);
  assert.equal(archived.body.archived, true);

  const defaultList = await invoke(getNotifications, { userId: adminId });
  assert.equal(defaultList.body.pagination.total, 2);
  assert.equal(defaultList.body.data.some((row) => row.id === first.id), false);

  const archivedList = await invoke(getNotifications, {
    userId: adminId,
    query: { archived: 'only' },
  });
  assert.equal(archivedList.body.pagination.total, 1);
  assert.equal(archivedList.body.data[0].isArchived, true);

  await invoke(bulkSetArchivedState, {
    userId: adminId,
    body: { ids: [first._id.toString()], archived: false },
  });
  const restored = await invoke(getNotifications, { userId: adminId });
  assert.equal(restored.body.pagination.total, 3);

  const cleared = await invoke(clearNotifications, {
    userId: adminId,
    body: { ids: [second._id.toString(), inaccessible._id.toString()] },
  });
  assert.equal(cleared.body.clearedCount, 1);
  assert.ok(await Notification.exists({ _id: second._id }), 'clear must retain source data');

  const afterClear = await invoke(getNotifications, {
    userId: adminId,
    query: { archived: 'include' },
  });
  assert.equal(afterClear.body.data.some((row) => row.id === second.id), false);

  const markAll = await invoke(markAllAsRead, { userId: adminId });
  assert.equal(markAll.body.modifiedCount, 1, 'only the remaining unread row changes');
  assert.equal(markAll.body.unreadCount, 0);

  const unreadCount = await invoke(getUnreadCount, { userId: adminId });
  assert.equal(unreadCount.body.unreadCount, 0);
  assert.ok(third._id);
});

test('legacy targeted notifications retain document read compatibility but can be made unread', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const notification = await Notification.create({
    title: 'Appointment confirmed',
    message: 'Your appointment is confirmed.',
    type: 'booking',
    recipientRole: 'customer',
    recipientUserId: customerId,
    isRead: true,
  });

  const initial = await invoke(getNotifications, {
    userId: customerId,
    role: 'customer',
  });
  assert.equal(initial.body.data[0].isRead, true);
  assert.equal(initial.body.data[0].category, 'appointments');

  await invoke(markAsRead, {
    userId: customerId,
    role: 'customer',
    params: { id: notification._id.toString() },
    body: { isRead: false },
  });
  const [updatedDocument, updatedList] = await Promise.all([
    Notification.findById(notification._id).lean(),
    invoke(getNotifications, { userId: customerId, role: 'customer' }),
  ]);
  assert.equal(updatedDocument.isRead, false);
  assert.equal(updatedDocument.readAt, null);
  assert.equal(updatedList.body.data[0].isRead, false);
});

test('an administrator cannot mutate a notification outside their audience', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const privateNotification = await Notification.create({
    title: 'Private receipt',
    message: 'Your receipt is ready.',
    type: 'success',
    recipientRole: 'customer',
    recipientUserId: customerId,
  });

  await assert.rejects(
    () => invoke(markAsRead, {
      userId: adminId,
      params: { id: privateNotification._id.toString() },
    }),
    (error) => error.status === 404
  );
  assert.equal(await NotificationUserState.countDocuments({}), 0);
});

test('sales users cannot read or mutate another sales user\'s targeted booking alert', async () => {
  const salesA = new mongoose.Types.ObjectId();
  const salesB = new mongoose.Types.ObjectId();
  const own = await Notification.create({
    title: 'Own booking approval',
    message: 'Booking Approvals item for the current salesperson.',
    type: 'booking',
    recipientRole: 'sales',
    recipientUserId: salesA,
    metadata: { kind: 'booking', orderId: new mongoose.Types.ObjectId() },
  });
  const privateForB = await Notification.create({
    title: 'Other booking approval',
    message: 'Booking Approvals item for a different salesperson.',
    type: 'booking',
    recipientRole: 'sales',
    recipientUserId: salesB,
    metadata: { kind: 'booking', orderId: new mongoose.Types.ObjectId() },
  });

  const list = await invoke(getNotifications, { userId: salesA, role: 'sales' });
  assert.deepEqual(list.body.data.map((row) => row.id), [String(own._id)]);
  await assert.rejects(
    () => invoke(markAsRead, {
      userId: salesA,
      role: 'sales',
      params: { id: String(privateForB._id) },
    }),
    (error) => error.status === 404,
  );
});

test('QC channel scope isolates targeted rows, badge counts, and mark-all receipts', async () => {
  const qcA = new mongoose.Types.ObjectId();
  const qcB = new mongoose.Types.ObjectId();
  const targetedA = await createQualityNotification({ recipientUserId: qcA });
  const broadcast = await createQualityNotification({
    title: 'Shared Quality reminder',
    recipientUserId: null,
  });
  await createQualityNotification({
    title: 'QC B only',
    recipientUserId: qcB,
  });
  const generic = await Notification.create({
    title: 'Generic staff notice',
    message: 'This is not a Quality Control notification.',
    type: 'system_update',
    category: 'system',
    severity: 'info',
    source: 'System',
    recipientRole: 'all',
  });

  const scoped = await invoke(getNotifications, {
    userId: qcA,
    role: 'staff_quality_checker',
    query: { channel: 'quality_control', countScope: 'filtered' },
  });
  assert.equal(scoped.body.pagination.total, 2);
  assert.equal(scoped.body.unreadCount, 2);
  assert.deepEqual(
    new Set(scoped.body.data.map((row) => row.id)),
    new Set([String(targetedA._id), String(broadcast._id)]),
  );

  const count = await invoke(getUnreadCount, {
    userId: qcA,
    role: 'staff_quality_checker',
    query: { channel: 'quality_control' },
  });
  assert.equal(count.body.unreadCount, 2);

  await assert.rejects(
    () => invoke(markAsRead, {
      userId: qcB,
      role: 'staff_quality_checker',
      params: { id: targetedA._id.toString() },
      body: { channel: 'quality_control' },
    }),
    (error) => error.status === 404,
  );

  await assert.rejects(
    () => invoke(markAsRead, {
      userId: qcA,
      role: 'staff_quality_checker',
      params: { id: generic._id.toString() },
      body: { channel: 'quality_control' },
    }),
    (error) => error.status === 404,
    'a scoped mutation cannot change an accessible notification from another channel',
  );

  const marked = await invoke(markAllAsRead, {
    userId: qcA,
    role: 'staff_quality_checker',
    body: { channel: 'quality_control' },
  });
  assert.equal(marked.body.modifiedCount, 2);
  assert.equal(marked.body.unreadCount, 0);

  const [unscopedA, scopedB, receipts] = await Promise.all([
    invoke(getNotifications, { userId: qcA, role: 'staff_quality_checker' }),
    invoke(getUnreadCount, {
      userId: qcB,
      role: 'staff_quality_checker',
      query: { channel: 'quality_control' },
    }),
    NotificationUserState.find({ userId: qcA }).lean(),
  ]);
  assert.equal(unscopedA.body.unreadCount, 1);
  assert.equal(
    unscopedA.body.data.find((row) => row.id === String(generic._id)).isRead,
    false,
  );
  assert.equal(scopedB.body.unreadCount, 2, 'QC B keeps its own broadcast receipt state');
  assert.equal(receipts.length, 2);
  assert.equal(await Notification.countDocuments({}), 4, 'mark-all never deletes source rows');
});

test('resolved QC broadcasts remain history but are read and non-actionable for every recipient', async () => {
  const resolvedAt = new Date();
  const notification = await createQualityNotification({
    title: 'Resolved evidence reminder',
    recipientUserId: null,
    resolvedAt,
    resolutionReason: 'All evidence was uploaded.',
    resolvedByEvent: 'evidence_completed',
  });
  const qcA = new mongoose.Types.ObjectId();
  const qcB = new mongoose.Types.ObjectId();

  const [forA, forB] = await Promise.all([
    invoke(getNotifications, {
      userId: qcA,
      role: 'staff_quality_checker',
      query: { channel: 'quality_control', countScope: 'filtered' },
    }),
    invoke(getNotifications, {
      userId: qcB,
      role: 'staff_quality_checker',
      query: { channel: 'quality_control', countScope: 'filtered' },
    }),
  ]);

  for (const result of [forA, forB]) {
    assert.equal(result.body.unreadCount, 0);
    assert.equal(result.body.data.length, 1);
    assert.equal(result.body.data[0].id, String(notification._id));
    assert.equal(result.body.data[0].isResolved, true);
    assert.equal(result.body.data[0].isRead, true);
    assert.equal(result.body.data[0].actionRequired, false);
    assert.equal(result.body.data[0].resolutionReason, 'All evidence was uploaded.');
  }
  assert.equal(await NotificationUserState.countDocuments({}), 0);
});

test('mark-all applies the source and channel scopes as an intersection', async () => {
  const qcId = new mongoose.Types.ObjectId();
  const matching = await createQualityNotification({ recipientUserId: qcId });
  const otherSource = await createQualityNotification({
    recipientUserId: qcId,
    source: 'Another Quality Source',
  });
  const otherChannel = await createQualityNotification({
    recipientUserId: qcId,
    metadata: {
      channel: 'another_channel',
      notificationType: 'EVIDENCE_REQUIRED',
      orderId: new mongoose.Types.ObjectId().toString(),
      stage: 'in_progress',
    },
  });

  const result = await invoke(markAllAsRead, {
    userId: qcId,
    role: 'staff_quality_checker',
    body: {
      source: 'Quality Command Center',
      channel: 'quality_control',
    },
  });
  assert.equal(result.body.modifiedCount, 1);
  assert.equal(result.body.unreadCount, 0);

  const states = await NotificationUserState.find({ userId: qcId }).lean();
  assert.deepEqual(states.map((row) => String(row.notificationId)), [String(matching._id)]);
  assert.equal(await Notification.countDocuments({
    _id: { $in: [otherSource._id, otherChannel._id] },
    isRead: false,
  }), 2);
});
