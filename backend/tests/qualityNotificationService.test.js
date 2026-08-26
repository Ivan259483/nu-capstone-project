import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { default: Notification } = await import('../models/notification.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: QualityNotificationRetry } = await import(
  '../models/qualityNotificationRetry.model.js'
);
const { default: User } = await import('../models/user.model.js');
const {
  QUALITY_NOTIFICATION_CHANNEL,
  QUALITY_NOTIFICATION_TYPES,
  buildQualityNotificationLink,
  createQualityNotificationService,
  enqueueQualityNotificationRetry,
  notifyQualityVehicleArrived,
  runQualityNotificationRetrySweep,
} = await import('../services/qualityNotification.service.js');
const { gatePhotoStageToValidateForAdvance } = await import(
  '../utils/trackerGatePhotos.utils.js'
);

let mongo;

function socketRecorder() {
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

function makeOrder(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: `ORD-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    customer: new mongoose.Types.ObjectId(),
    customerName: 'Quality Customer',
    vehicleYear: '2025',
    vehicleMake: 'Toyota',
    vehicleModel: 'Vios',
    status: 'in_progress',
    serviceTrackingStage: 'in_progress',
    trackerStageMedia: [],
    ...overrides,
  };
}

const media = (stage, slots) => slots.map((slot) => ({
  stage,
  slot,
  photoUrl: `https://example.test/${stage}/${slot}.jpg`,
}));

async function seedQc(name) {
  return User.create({
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(16).slice(2)}@example.test`,
    role: 'staff_quality_checker',
    isActive: true,
    isVerified: true,
    status: 'active',
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-quality-notification-service-test'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Promise.all([
    Notification.syncIndexes(),
    QualityNotificationRetry.syncIndexes(),
    User.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('assigned QC receives a targeted alert while an unassigned job uses the QC role room', async () => {
  const qc = await seedQc('QC Alpha');
  const socket = socketRecorder();
  const service = createQualityNotificationService({ getSocketIO: () => socket.io });

  const assigned = makeOrder({ assignedDetailer: qc._id, status: 'received' });
  const targeted = await service.notifyQualityVehicleArrived(assigned);
  const unassigned = await service.notifyQualityVehicleArrived(
    makeOrder({ assignedDetailer: null, status: 'received' }),
  );
  const unverifiedQc = await User.create({
    name: 'QC Pending',
    email: `qc-pending-${Math.random().toString(16).slice(2)}@example.test`,
    role: 'staff_quality_checker',
    isActive: true,
    isVerified: false,
  });
  const pendingAccount = await service.notifyQualityVehicleArrived(
    makeOrder({ assignedDetailer: unverifiedQc._id, status: 'received' }),
  );

  assert.equal(String(targeted.recipientUserId), String(qc._id));
  assert.equal(targeted.recipientRole, 'staff_quality_checker');
  assert.equal(unassigned.recipientUserId, null);
  assert.equal(pendingAccount.recipientUserId, null);
  assert.equal(unassigned.recipientRole, 'staff_quality_checker');
  assert.deepEqual(socket.emitted.map((row) => row.room), [
    `user:${qc._id}`,
    'role:staff_quality_checker',
    'role:staff_quality_checker',
  ]);
  assert.equal(targeted.metadata.channel, QUALITY_NOTIFICATION_CHANNEL);
  assert.equal(targeted.metadata.notificationType, QUALITY_NOTIFICATION_TYPES.JOB_ARRIVED);
  assert.match(targeted.link, new RegExp(`orderId=${assigned._id}`));
  assert.match(targeted.link, /action=UPLOAD_EVIDENCE/);
  assert.match(targeted.link, /#qc_review$/);
});

test('concurrent evidence sync is durable, deduplicated, and updates progress without re-alerting', async () => {
  const socket = socketRecorder();
  const service = createQualityNotificationService({ getSocketIO: () => socket.io });
  const order = makeOrder();

  await Promise.all(
    Array.from({ length: 8 }, () => service.syncQualityEvidenceAttention(order, 'in_progress')),
  );

  let rows = await Notification.find({
    'metadata.orderId': String(order._id),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED,
  }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.missingCount, 5);
  assert.equal(socket.emitted.filter((row) => row.event === 'notification:new').length, 1);
  const firstOccurredAt = rows[0].lastOccurredAt.getTime();

  order.trackerStageMedia = media('in_progress', ['front']);
  await service.syncQualityEvidenceAttention(order, 'in_progress');
  rows = await Notification.find({
    'metadata.orderId': String(order._id),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED,
  }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.missingCount, 4);
  assert.equal(rows[0].lastOccurredAt.getTime(), firstOccurredAt);
  assert.equal(socket.emitted.filter((row) => row.event === 'notification:new').length, 1);
});

test('evidence completion resolves and later reactivates the same condition rows', async () => {
  const socket = socketRecorder();
  const service = createQualityNotificationService({ getSocketIO: () => socket.io });
  const order = makeOrder();
  const slots = ['front', 'rear', 'left', 'right', 'close_up'];

  const evidence = await service.syncQualityEvidenceAttention(order, 'in_progress');
  order.trackerStageMedia = media('in_progress', slots);
  const ready = await service.syncQualityEvidenceAttention(order, 'in_progress');

  const resolvedEvidence = await Notification.findById(evidence._id).lean();
  assert.ok(resolvedEvidence.resolvedAt);
  assert.equal(resolvedEvidence.isRead, true);
  assert.equal(ready.metadata.notificationType, QUALITY_NOTIFICATION_TYPES.READY_FOR_QC);

  const emittedAfterComplete = socket.emitted.length;
  await service.syncQualityEvidenceAttention(order, 'in_progress');
  assert.equal(socket.emitted.length, emittedAfterComplete, 'repeated complete sync is a no-op');

  order.trackerStageMedia = media('in_progress', slots.slice(0, 4));
  const reactivatedEvidence = await service.syncQualityEvidenceAttention(order, 'in_progress');
  assert.equal(String(reactivatedEvidence._id), String(evidence._id));
  assert.equal(reactivatedEvidence.resolvedAt, null);
  assert.equal(reactivatedEvidence.isRead, false);
  assert.ok((await Notification.findById(ready._id).lean()).resolvedAt);

  order.trackerStageMedia = media('in_progress', slots);
  const reactivatedReady = await service.syncQualityEvidenceAttention(order, 'in_progress');
  assert.equal(String(reactivatedReady._id), String(ready._id));
  assert.equal(reactivatedReady.resolvedAt, null);
  assert.equal(await Notification.countDocuments({ 'metadata.orderId': String(order._id) }), 2);
});

test('reassignment resolves old recipient attention and reactivates the original row when assigned back', async () => {
  const [qcA, qcB] = await Promise.all([seedQc('QC A'), seedQc('QC B')]);
  const socket = socketRecorder();
  const service = createQualityNotificationService({ getSocketIO: () => socket.io });
  const order = makeOrder({ assignedDetailer: qcA._id });

  const forA = await service.syncQualityEvidenceAttention(order, 'in_progress');
  order.assignedDetailer = qcB._id;
  const forB = await service.syncQualityEvidenceAttention(order, 'in_progress');
  assert.ok((await Notification.findById(forA._id).lean()).resolvedAt);
  assert.equal(String(forB.recipientUserId), String(qcB._id));

  order.assignedDetailer = qcA._id;
  const forAAgain = await service.syncQualityEvidenceAttention(order, 'in_progress');
  assert.equal(String(forAAgain._id), String(forA._id));
  assert.equal(forAAgain.resolvedAt, null);
  assert.ok((await Notification.findById(forB._id).lean()).resolvedAt);
  assert.equal(await Notification.countDocuments({
    'metadata.orderId': String(order._id),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED,
  }), 2);
});

test('persisted assignment wins over stale and concurrent order snapshots', async () => {
  const [qcA, qcB] = await Promise.all([seedQc('QC Current A'), seedQc('QC Current B')]);
  const socket = socketRecorder();
  const orderId = new mongoose.Types.ObjectId();
  const persistedOrderModel = {
    findById(requestedId) {
      return {
        select: async () => ({ _id: requestedId, assignedDetailer: qcB._id }),
      };
    },
  };
  const service = createQualityNotificationService({
    OrderModel: persistedOrderModel,
    getSocketIO: () => socket.io,
  });
  const staleForA = makeOrder({ _id: orderId, assignedDetailer: qcA._id });
  const currentForB = { ...staleForA, assignedDetailer: qcB._id };

  await Promise.all([
    service.syncQualityEvidenceAttention(staleForA, 'in_progress'),
    service.syncQualityEvidenceAttention(currentForB, 'in_progress'),
  ]);
  await service.syncQualityEvidenceAttention(staleForA, 'in_progress');

  const active = await Notification.find({
    'metadata.orderId': String(orderId),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.EVIDENCE_REQUIRED,
    resolvedAt: null,
  }).lean();
  assert.equal(active.length, 1);
  assert.equal(String(active[0].recipientUserId), String(qcB._id));
  assert.equal(socket.emitted.filter((row) => row.event === 'notification:new').length, 1);
});

test('a distinct replacement request resurfaces a read row while an identical retry is quiet', async () => {
  const socket = socketRecorder();
  let timestamp = Date.parse('2026-08-25T00:00:00.000Z');
  const service = createQualityNotificationService({
    getSocketIO: () => socket.io,
    now: () => new Date(timestamp += 1_000),
  });
  const order = makeOrder();

  const left = await service.notifyQualityEvidenceReplacement(order, 'in_progress', 'left');
  await Notification.updateOne(
    { _id: left._id },
    { $set: { isRead: true, readAt: new Date(timestamp) } },
  );
  const right = await service.notifyQualityEvidenceReplacement(order, 'in_progress', 'right');
  assert.equal(String(right._id), String(left._id));
  assert.equal(right.isRead, false);
  assert.equal(right.metadata.slot, 'right');
  assert.ok(right.lastOccurredAt.getTime() > left.lastOccurredAt.getTime());
  assert.equal(socket.emitted.filter((row) => row.event === 'notification:new').length, 2);

  const lastOccurredAt = right.lastOccurredAt.getTime();
  const retry = await service.notifyQualityEvidenceReplacement(order, 'in_progress', 'right');
  assert.equal(retry.lastOccurredAt.getTime(), lastOccurredAt);
  assert.equal(socket.emitted.filter((row) => row.event === 'notification:new').length, 2);
});

test('deleting complete evidence resolves success until the replacement is uploaded', async () => {
  const service = createQualityNotificationService({
    getSocketIO: () => socketRecorder().io,
  });
  const slots = ['front', 'rear', 'left', 'right', 'close_up'];
  for (const [stage, readyType] of [
    ['in_progress', QUALITY_NOTIFICATION_TYPES.READY_FOR_QC],
    ['ready_pickup', QUALITY_NOTIFICATION_TYPES.READY_FOR_PICKUP],
  ]) {
    const order = makeOrder({ serviceTrackingStage: stage });
    order.trackerStageMedia = media(stage, slots);
    const ready = await service.syncQualityEvidenceAttention(order, stage);
    assert.equal(ready.metadata.notificationType, readyType);

    order.trackerStageMedia = media(stage, slots.slice(0, 4));
    const replacement = await service.notifyQualityEvidenceReplacement(order, stage, 'close_up');
    assert.ok((await Notification.findById(ready._id).lean()).resolvedAt);
    assert.equal((await Notification.findById(replacement._id).lean()).resolvedAt, null);

    order.trackerStageMedia = media(stage, slots);
    const readyAgain = await service.syncQualityEvidenceAttention(order, stage);
    assert.equal(String(readyAgain._id), String(ready._id));
    assert.equal(readyAgain.resolvedAt, null);
    assert.ok((await Notification.findById(replacement._id).lean()).resolvedAt);
  }
});

test('concurrent completion emits one resolution event for the winning transition', async () => {
  const socket = socketRecorder();
  const service = createQualityNotificationService({ getSocketIO: () => socket.io });
  const order = makeOrder();
  const evidence = await service.syncQualityEvidenceAttention(order, 'in_progress');
  order.trackerStageMedia = media('in_progress', ['front', 'rear', 'left', 'right', 'close_up']);

  await Promise.all(
    Array.from({ length: 8 }, () => service.syncQualityEvidenceAttention(order, 'in_progress')),
  );

  assert.equal(socket.emitted.filter((row) => (
    row.event === 'notification:resolved'
    && row.payload.id === String(evidence._id)
  )).length, 1);
});

test('assignment replacement is failure-safe and closed jobs resolve assignment attention', async () => {
  const [qcA, qcB] = await Promise.all([seedQc('QC Assignment A'), seedQc('QC Assignment B')]);
  const socket = socketRecorder();
  let rejectCreatesForUser = '';
  const NotificationModel = new Proxy(Notification, {
    get(target, property, receiver) {
      if (property === 'create') {
        return async (document) => {
          if (String(document?.recipientUserId || '') === rejectCreatesForUser) {
            throw new Error('simulated persistence failure');
          }
          return target.create(document);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const service = createQualityNotificationService({
    NotificationModel,
    getSocketIO: () => socket.io,
  });
  const order = makeOrder({ assignedDetailer: qcA._id });

  const forA = await service.notifyQualityJobAssignment(order, null);
  rejectCreatesForUser = String(qcB._id);
  order.assignedDetailer = qcB._id;
  await assert.rejects(
    () => service.notifyQualityJobAssignment(order, qcA._id),
    /simulated persistence failure/,
  );
  assert.equal((await Notification.findById(forA._id).lean()).resolvedAt, null);

  rejectCreatesForUser = '';
  const forB = await service.notifyQualityJobAssignment(order, qcA._id);
  assert.ok((await Notification.findById(forA._id).lean()).resolvedAt);
  assert.equal((await Notification.findById(forB._id).lean()).resolvedAt, null);

  await service.handleQualityStageTransition(order, 'ready_pickup', 'completed');
  assert.ok((await Notification.findById(forB._id).lean()).resolvedAt);
});

test('reassignment and unassignment retarget every active QC condition', async () => {
  const [qcA, qcB] = await Promise.all([seedQc('QC Retarget A'), seedQc('QC Retarget B')]);
  const service = createQualityNotificationService({
    getSocketIO: () => socketRecorder().io,
  });
  const order = makeOrder({
    assignedDetailer: qcA._id,
    serviceTrackingStage: 'quality_check',
  });
  const failureForA = await service.notifyQualityQcFailed(order, 'Rear panel needs correction.');

  order.assignedDetailer = qcB._id;
  await service.notifyQualityJobAssignment(order, qcA._id);
  const failureForB = await Notification.findOne({
    dedupeKey: failureForA.dedupeKey,
    recipientUserId: qcB._id,
  }).lean();
  assert.ok((await Notification.findById(failureForA._id).lean()).resolvedAt);
  assert.ok(failureForB);
  assert.equal(failureForB.resolvedAt, null);

  order.assignedDetailer = null;
  await service.notifyQualityJobAssignment(order, qcB._id);
  const sharedFailure = await Notification.findOne({
    dedupeKey: failureForA.dedupeKey,
    recipientUserId: null,
  }).lean();
  assert.ok((await Notification.findById(failureForB._id).lean()).resolvedAt);
  assert.ok(sharedFailure);
  assert.equal(sharedFailure.resolvedAt, null);
});

test('identical QC failures are idempotent and socket failure never rolls back persistence', async () => {
  const qc = await seedQc('QC Retry');
  const socket = socketRecorder();
  const service = createQualityNotificationService({ getSocketIO: () => socket.io });
  const order = makeOrder({ assignedDetailer: qc._id, serviceTrackingStage: 'quality_check' });
  const qcId = new mongoose.Types.ObjectId();

  const first = await service.notifyQualityQcFailed(order, 'Left panel needs correction.', qcId);
  const firstOccurredAt = first.lastOccurredAt.getTime();
  const retryQcId = new mongoose.Types.ObjectId();
  const second = await service.notifyQualityQcFailed(order, 'Left panel needs correction.', retryQcId);
  assert.equal(String(first._id), String(second._id));
  assert.equal(second.lastOccurredAt.getTime(), firstOccurredAt);
  assert.equal(String(second.metadata.qcId), String(retryQcId), 'the deep link may follow the latest audit row without resurfacing');
  assert.equal(socket.emitted.filter((row) => row.event === 'notification:new').length, 1);

  await service.handleQualityStageTransition(order, 'in_progress', 'quality_check');
  const resolved = await Notification.findById(first._id).lean();
  assert.ok(resolved.resolvedAt);

  const nextQcId = new mongoose.Types.ObjectId();
  const nextAttempt = await service.notifyQualityQcFailed(
    order,
    'Left panel needs correction.',
    nextQcId,
  );
  assert.equal(String(nextAttempt._id), String(first._id));
  assert.equal(nextAttempt.resolvedAt, null);
  assert.equal(String(nextAttempt.metadata.qcId), String(nextQcId));
  assert.equal(
    socket.emitted.filter((row) => (
      row.event === 'notification:new' && row.payload.type === QUALITY_NOTIFICATION_TYPES.QC_FAILED
    )).length,
    2,
    'a new QC cycle resurfaces the same durable condition',
  );

  const withoutSocket = createQualityNotificationService({
    getSocketIO: () => { throw new Error('socket offline'); },
    logger: { warn() {} },
  });
  const persisted = await withoutSocket.notifyQualityVehicleArrived(
    makeOrder({ assignedDetailer: qc._id, status: 'received' }),
  );
  assert.ok(await Notification.findById(persisted._id));
});

test('a failed persistence write is durably retried against current order state', async () => {
  const qc = await seedQc('QC Recovery');
  const order = await Order.create(makeOrder({
    assignedDetailer: qc._id,
    status: 'received',
    serviceTrackingStage: 'received',
  }));
  const originalCreate = Notification.create;
  Notification.create = async () => {
    throw new Error('temporary notification write failure');
  };
  try {
    await assert.rejects(
      () => notifyQualityVehicleArrived(order),
      /temporary notification write failure/,
    );
  } finally {
    Notification.create = originalCreate;
  }

  assert.equal(await QualityNotificationRetry.countDocuments({ orderId: order._id }), 1);
  const summary = await runQualityNotificationRetrySweep();
  assert.deepEqual(summary, { processed: 1, reconciled: 1, discarded: 0, failed: 0 });
  assert.equal(await QualityNotificationRetry.countDocuments({ orderId: order._id }), 0);
  assert.equal(await Notification.countDocuments({
    'metadata.orderId': String(order._id),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.JOB_ARRIVED,
  }), 1);
});

test('a stale replacement retry reconciles fresh evidence without resurrecting its warning', async () => {
  const order = await Order.create(makeOrder({
    status: 'in_progress',
    serviceTrackingStage: 'in_progress',
    trackerStageMedia: media('in_progress', ['front', 'rear', 'left', 'right', 'close_up']),
  }));
  await enqueueQualityNotificationRetry(
    'evidence_replacement',
    order,
    { stage: 'in_progress', slot: 'left' },
    new Error('temporary notification write failure'),
  );

  const summary = await runQualityNotificationRetrySweep();
  assert.equal(summary.processed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(await Notification.countDocuments({
    'metadata.orderId': String(order._id),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.EVIDENCE_REPLACEMENT_REQUIRED,
    resolvedAt: null,
  }), 0);
  assert.equal(await Notification.countDocuments({
    'metadata.orderId': String(order._id),
    'metadata.notificationType': QUALITY_NOTIFICATION_TYPES.READY_FOR_QC,
    resolvedAt: null,
  }), 1);
});

test('deep links stay internal and the first tracker gate does not require evidence before arrival', () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const link = buildQualityNotificationLink({
    orderId,
    view: 'live-tracker',
    action: 'START_QC',
    stage: 'in_progress',
  });
  assert.equal(
    link,
    `/detailer/dashboard?qcv=live-tracker&orderId=${orderId}&action=START_QC&stage=in_progress#qc_review`,
  );
  assert.equal(gatePhotoStageToValidateForAdvance('received'), null);
  assert.equal(gatePhotoStageToValidateForAdvance('in_progress'), 'received');
  assert.equal(gatePhotoStageToValidateForAdvance('quality_check'), 'in_progress');
});
