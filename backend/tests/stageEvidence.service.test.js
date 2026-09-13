import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.CLOUDINARY_CLOUD_NAME = 'autospf-test';
process.env.CLOUDINARY_API_KEY = 'test-api-key';
process.env.CLOUDINARY_API_SECRET = 'test-api-secret';

const { default: Order } = await import('../models/order.model.js');
const { default: StageEvidencePhoto } = await import('../models/stageEvidencePhoto.model.js');
const {
  applyTrackerMediaRow,
  commitEvidence,
  createEvidenceIntents,
  failEvidence,
  listEvidenceStatus,
  removeTrackerMediaRow,
} = await import('../services/stageEvidence.service.js');
const { checkOrderEvidenceWriteAccess } = await import('../utils/stageEvidenceAccess.utils.js');

const SLOTS = ['front', 'rear', 'left', 'right', 'close_up'];
let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await StageEvidencePhoto.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Promise.all([Order.deleteMany({}), StageEvidencePhoto.deleteMany({})]);
});

let orderCounter = 0;
async function createOrder(overrides = {}) {
  orderCounter += 1;
  return Order.create({
    orderNumber: `ORD-EVIDENCE-${orderCounter}`,
    bookingReference: `ASPF-EVIDENCE-${orderCounter}`,
    customer: new mongoose.Types.ObjectId(),
    customerName: 'Evidence Customer',
    serviceType: 'SPF Service',
    status: 'in_progress',
    serviceTrackingStage: 'in_progress',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    ...overrides,
  });
}

/** What Cloudinary returns for a successful signed upload. */
function cloudinaryResponseFor(publicId, version = '1760000000') {
  const signature = createHash('sha1')
    .update(`public_id=${publicId}&version=${version}${process.env.CLOUDINARY_API_SECRET}`)
    .digest('hex');
  return { public_id: publicId, version, signature, format: 'webp', bytes: 312000, width: 1600, height: 1200 };
}

const qcUser = { id: new mongoose.Types.ObjectId().toString(), role: 'staff_quality_checker', name: 'QC Tester' };

test('five concurrent slot writes on one order all persist (atomic row updates)', async () => {
  const order = await createOrder();

  await Promise.all(SLOTS.map((slot) => applyTrackerMediaRow(order._id, {
    stage: 'in_progress',
    slot,
    photoUrl: `https://res.cloudinary.com/autospf-test/image/upload/v1/${slot}.webp`,
    uploadedByName: 'QC Tester',
  })));

  const saved = await Order.findById(order._id).lean();
  const slots = saved.trackerStageMedia.filter((row) => row.stage === 'in_progress').map((row) => row.slot).sort();
  assert.deepEqual(slots, [...SLOTS].sort());
  assert.ok(saved.trackerStageMedia.every((row) => row._id), 'pushed rows receive subdocument ids for signed photo URLs');
});

test('regression proof: the old hydrate + array save pattern loses concurrent slot uploads', async () => {
  const order = await createOrder();

  const outcomes = await Promise.allSettled(SLOTS.map(async (slot) => {
    const doc = await Order.findById(order._id);
    doc.trackerStageMedia.push({ stage: 'in_progress', slot, photoUrl: `data:image/jpeg;base64,${slot}` });
    doc.markModified('trackerStageMedia');
    await doc.save({ validateBeforeSave: false });
  }));

  const saved = await Order.findById(order._id).lean();
  const persisted = saved.trackerStageMedia.length;
  const rejected = outcomes.filter((outcome) => outcome.status === 'rejected').length;
  assert.ok(persisted < SLOTS.length || rejected > 0, `expected lost or rejected writes, got ${persisted} rows`);
});

test('repeated writes to one slot update the row in place instead of duplicating it', async () => {
  const order = await createOrder();
  await applyTrackerMediaRow(order._id, { stage: 'in_progress', slot: 'rear', photoUrl: 'https://res.cloudinary.com/a/1.webp' });
  await Promise.all([1, 2, 3].map((n) => applyTrackerMediaRow(order._id, {
    stage: 'in_progress',
    slot: 'rear',
    photoUrl: `https://res.cloudinary.com/a/${n + 1}.webp`,
  })));
  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia.filter((row) => row.slot === 'rear').length, 1);
});

test('legacy slotless photo row is claimed as the front angle', async () => {
  const order = await createOrder({
    trackerStageMedia: [{ stage: 'in_progress', photoUrl: 'https://res.cloudinary.com/a/legacy.jpg' }],
  });
  const result = await applyTrackerMediaRow(order._id, {
    stage: 'in_progress',
    slot: 'front',
    photoUrl: 'https://res.cloudinary.com/a/new-front.webp',
  });
  assert.equal(result.operation, 'legacy-front');
  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia.length, 1);
  assert.equal(saved.trackerStageMedia[0].slot, 'front');
});

test('note-only update on confirmed keeps the existing photo', async () => {
  const order = await createOrder({
    trackerStageMedia: [{ stage: 'confirmed', photoUrl: 'https://res.cloudinary.com/a/confirmed.jpg' }],
  });
  await applyTrackerMediaRow(order._id, { stage: 'confirmed', description: 'Booking confirmed' });
  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia[0].photoUrl, 'https://res.cloudinary.com/a/confirmed.jpg');
  assert.equal(saved.trackerStageMedia[0].description, 'Booking confirmed');
});

test('signed intents → parallel commits land all five photos and the ledger', async () => {
  const order = await createOrder({ assignedDetailer: qcUser.id });
  const intents = await createEvidenceIntents({
    orderId: order._id,
    user: qcUser,
    stage: 'in_progress',
    items: SLOTS.map((slot) => ({ slot, bytes: 300000, originalBytes: 4200000 })),
  });

  assert.equal(intents.length, 5);
  for (const intent of intents) {
    assert.equal(intent.uploadUrl, 'https://api.cloudinary.com/v1_1/autospf-test/image/upload');
    assert.equal(intent.fields.api_key, 'test-api-key');
    assert.ok(!JSON.stringify(intent).includes('test-api-secret'), 'API secret never leaves the backend');
    assert.match(intent.fields.public_id, new RegExp(`/orders/${order._id}/in_progress/${intent.slot}_`));
  }

  const results = await Promise.all(intents.map((intent) => commitEvidence({
    orderId: order._id,
    evidenceId: intent.evidenceId,
    body: { attemptId: intent.attemptId, ...cloudinaryResponseFor(intent.fields.public_id) },
  })));
  assert.ok(results.every((result) => !result.superseded));

  const saved = await Order.findById(order._id).lean();
  const rows = saved.trackerStageMedia.filter((row) => row.stage === 'in_progress');
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.photoUrl.startsWith('https://res.cloudinary.com/autospf-test/image/upload/v1760000000/')));
  assert.ok(rows.every((row) => row.evidenceId && row.cloudinaryPublicId));

  const ledger = await StageEvidencePhoto.find({ orderId: order._id }).lean();
  assert.equal(ledger.length, 5);
  assert.ok(ledger.every((row) => row.status === 'SUCCESS' && String(row.uploadedBy) === qcUser.id));

  const status = await listEvidenceStatus({ orderId: order._id, stage: 'in_progress' });
  assert.equal(status.filter((row) => row.status === 'SUCCESS').length, 5);
});

test('commit is idempotent for the same attempt', async () => {
  const order = await createOrder({ assignedDetailer: qcUser.id });
  const [intent] = await createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'left' }] });
  const body = { attemptId: intent.attemptId, ...cloudinaryResponseFor(intent.fields.public_id) };

  const first = await commitEvidence({ orderId: order._id, evidenceId: intent.evidenceId, body });
  const second = await commitEvidence({ orderId: order._id, evidenceId: intent.evidenceId, body });
  assert.equal(first.alreadyCommitted, false);
  assert.equal(second.alreadyCommitted, true);
  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia.length, 1);
});

test('commit rejects forged signatures and assets from another slot or order', async () => {
  const order = await createOrder({ assignedDetailer: qcUser.id });
  const otherOrder = await createOrder({ assignedDetailer: qcUser.id });
  const [front, rear] = await createEvidenceIntents({
    orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'front' }, { slot: 'rear' }],
  });
  const [foreign] = await createEvidenceIntents({ orderId: otherOrder._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'front' }] });

  const tampered = { attemptId: front.attemptId, ...cloudinaryResponseFor(front.fields.public_id), version: '1760000001' };
  await assert.rejects(
    commitEvidence({ orderId: order._id, evidenceId: front.evidenceId, body: tampered }),
    { code: 'CLOUDINARY_SIGNATURE_INVALID' }
  );

  await assert.rejects(
    commitEvidence({
      orderId: order._id,
      evidenceId: front.evidenceId,
      body: { attemptId: front.attemptId, ...cloudinaryResponseFor(rear.fields.public_id) },
    }),
    { code: 'PUBLIC_ID_MISMATCH' }
  );

  await assert.rejects(
    commitEvidence({
      orderId: order._id,
      evidenceId: foreign.evidenceId,
      body: { attemptId: foreign.attemptId, ...cloudinaryResponseFor(foreign.fields.public_id) },
    }),
    { code: 'EVIDENCE_NOT_FOUND' }
  );

  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia.length, 0);
});

test('a newer pick supersedes the in-flight attempt; the stale commit cannot overwrite it', async () => {
  const order = await createOrder({ assignedDetailer: qcUser.id });
  const [older] = await createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'right' }] });
  const [newer] = await createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'right' }] });

  await commitEvidence({
    orderId: order._id,
    evidenceId: newer.evidenceId,
    body: { attemptId: newer.attemptId, ...cloudinaryResponseFor(newer.fields.public_id) },
  });
  await assert.rejects(
    commitEvidence({
      orderId: order._id,
      evidenceId: older.evidenceId,
      body: { attemptId: older.attemptId, ...cloudinaryResponseFor(older.fields.public_id) },
    }),
    { code: 'SUPERSEDED' }
  );

  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia.length, 1);
  assert.ok(saved.trackerStageMedia[0].photoUrl.includes(newer.attemptId));
});

test('retrying only the failed photo creates a RETRY attempt for that slot alone', async () => {
  const order = await createOrder({ assignedDetailer: qcUser.id });
  const intents = await createEvidenceIntents({
    orderId: order._id, user: qcUser, stage: 'in_progress', items: SLOTS.map((slot) => ({ slot })),
  });
  const failed = intents.find((intent) => intent.slot === 'left');
  await Promise.all(intents.filter((intent) => intent !== failed).map((intent) => commitEvidence({
    orderId: order._id,
    evidenceId: intent.evidenceId,
    body: { attemptId: intent.attemptId, ...cloudinaryResponseFor(intent.fields.public_id) },
  })));
  assert.equal(await failEvidence({
    orderId: order._id, evidenceId: failed.evidenceId, attemptId: failed.attemptId, code: 'NETWORK', message: 'offline',
  }), true);

  const [retry] = await createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'left' }] });
  assert.equal(retry.status, 'RETRY');
  const retryRow = await StageEvidencePhoto.findById(retry.evidenceId).lean();
  assert.equal(retryRow.attempts, 2);

  await commitEvidence({
    orderId: order._id,
    evidenceId: retry.evidenceId,
    body: { attemptId: retry.attemptId, ...cloudinaryResponseFor(retry.fields.public_id) },
  });
  const saved = await Order.findById(order._id).lean();
  assert.equal(saved.trackerStageMedia.length, 5);
  assert.equal(await StageEvidencePhoto.countDocuments({ orderId: order._id, slot: { $ne: 'left' } }), 4);
});

test('removing a slot pulls only that row', async () => {
  const order = await createOrder();
  await Promise.all(SLOTS.map((slot) => applyTrackerMediaRow(order._id, {
    stage: 'in_progress', slot, photoUrl: `https://res.cloudinary.com/a/${slot}.webp`,
  })));
  assert.equal(await removeTrackerMediaRow(order._id, { stage: 'in_progress', slot: 'rear' }), true);
  const saved = await Order.findById(order._id).lean();
  assert.deepEqual(saved.trackerStageMedia.map((row) => row.slot).sort(), ['close_up', 'front', 'left', 'right']);
});

test('intents validate stage, slots and batch size', async () => {
  const order = await createOrder({ assignedDetailer: qcUser.id });
  await assert.rejects(createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'bogus', items: [{ slot: 'front' }] }), { code: 'INVALID_STAGE' });
  await assert.rejects(createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'roof' }] }), { code: 'INVALID_SLOT' });
  await assert.rejects(createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [{ slot: 'front' }, { slot: 'front' }] }), { code: 'DUPLICATE_SLOT' });
  await assert.rejects(createEvidenceIntents({ orderId: order._id, user: qcUser, stage: 'in_progress', items: [] }), { code: 'INVALID_ITEMS' });
});

test('evidence write access: assigned Quality Checker and admins only', () => {
  const assigneeId = new mongoose.Types.ObjectId();
  const order = { assignedDetailer: assigneeId, status: 'in_progress', archived: false };

  assert.equal(checkOrderEvidenceWriteAccess({ id: String(assigneeId), role: 'staff_quality_checker' }, order).ok, true);
  assert.equal(checkOrderEvidenceWriteAccess({ id: 'someone-else', role: 'administrator' }, order).ok, true);
  assert.equal(checkOrderEvidenceWriteAccess({ id: 'someone-else', role: 'office_admin' }, order).ok, true);

  const otherQc = checkOrderEvidenceWriteAccess({ id: new mongoose.Types.ObjectId().toString(), role: 'staff_quality_checker' }, order);
  assert.deepEqual([otherQc.ok, otherQc.status, otherQc.code], [false, 403, 'EVIDENCE_NOT_ASSIGNED']);

  const unassigned = checkOrderEvidenceWriteAccess({ id: String(assigneeId), role: 'staff_quality_checker' }, { ...order, assignedDetailer: null });
  assert.equal(unassigned.status, 403);

  assert.equal(checkOrderEvidenceWriteAccess({ id: 'c1', role: 'customer' }, order).status, 403);
  assert.equal(checkOrderEvidenceWriteAccess({ id: 'c1', role: 'sales' }, order).status, 403);
  assert.equal(checkOrderEvidenceWriteAccess({ id: String(assigneeId), role: 'staff_quality_checker' }, { ...order, archived: true }).status, 409);
  assert.equal(checkOrderEvidenceWriteAccess({ id: String(assigneeId), role: 'staff_quality_checker' }, { ...order, status: 'cancelled' }).status, 409);
  assert.equal(checkOrderEvidenceWriteAccess({ id: 'x', role: 'administrator' }, null).status, 404);
});
