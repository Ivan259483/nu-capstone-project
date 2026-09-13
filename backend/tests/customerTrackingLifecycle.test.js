import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.JWT_SECRET ||= 'customer-tracking-lifecycle-test-secret';

const { default: Order } = await import('../models/order.model.js');
const { getOrderTrackerMedia } = await import('../controllers/order.controller.js');
const { getTrackerMediaPhoto } = await import('../controllers/tracker.controller.js');
const {
  closeCustomerLiveTracking,
  resolveCustomerTrackingState,
} = await import('../constants/orderLifecycle.js');
const { buildCustomerStagePayload } = await import('../utils/customerTrackerStage.utils.js');

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const res = {
      locals: {},
      headersSent: false,
      statusCode: 200,
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ statusCode: this.statusCode, headers, body }); },
      redirect(code, location) { resolve({ statusCode: code, headers: { ...headers, location } }); },
      end(buffer) { resolve({ statusCode: this.statusCode, headers, buffer }); },
    };
    Promise.resolve(handler({ method: 'GET', originalUrl: '/test', ...req }, res, (error) => (
      error ? reject(error) : resolve({ statusCode: 200, headers })
    ))).catch(reject);
  });
}

function photoRequestFromUrl(url) {
  const parsed = new URL(url, 'http://local.test');
  const [, , , orderId, , mediaId] = parsed.pathname.split('/');
  return {
    params: { id: orderId, mediaId },
    query: Object.fromEntries(parsed.searchParams.entries()),
  };
}

test('tracking completes only when payment is settled with a receipt at Ready for Pickup', () => {
  // The reported order: pickup gate done, balance paid at POS, receipt issued, status never advanced.
  assert.equal(resolveCustomerTrackingState({
    status: 'ready_for_payment',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'paid',
    invoiceId: 'INV-20260912-426299',
  }), 'completed');

  assert.equal(resolveCustomerTrackingState({
    status: 'ready_for_payment', serviceTrackingStage: 'ready_pickup', paymentStatus: 'partially_paid', invoiceId: 'INV-1',
  }), 'live', 'a remaining balance keeps tracking live');
  assert.equal(resolveCustomerTrackingState({
    status: 'ready_for_payment', serviceTrackingStage: 'ready_pickup', paymentStatus: 'paid',
  }), 'live', 'no receipt keeps tracking live');
  assert.equal(resolveCustomerTrackingState({
    status: 'confirmed', serviceTrackingStage: 'confirmed', paymentStatus: 'paid', invoiceId: 'INV-UPFRONT',
  }), 'live', 'an up-front full payment must not end tracking before service');
  assert.equal(resolveCustomerTrackingState({ status: 'released', paymentStatus: 'paid' }), 'completed');
  assert.equal(resolveCustomerTrackingState({ status: 'cancelled' }), 'cancelled');
});

test('stage payload carries the tracking lifecycle and the team that owns the order', () => {
  const settled = buildCustomerStagePayload({
    status: 'ready_for_payment',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'paid',
    invoiceId: 'INV-7',
    paidAt: new Date('2026-09-12T18:06:20.244Z'),
    serviceStaffAssignments: [],
  });
  assert.equal(settled.customerTrackingState, 'completed');
  assert.equal(settled.customerTrackingLive, false);
  assert.equal(new Date(settled.customerTrackingCompletedAt).toISOString(), '2026-09-12T18:06:20.244Z');
  assert.equal(settled.customerReceiptInvoiceId, 'INV-7');
  assert.equal(settled.customerAssignedTeam, 'Sales team');

  const inQueue = buildCustomerStagePayload({
    status: 'ready_for_payment',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'partially_paid',
    serviceStaffAssignments: [{ name: 'Mara', role: 'Sales' }, { name: 'Jun', role: 'Quality Checker' }],
  });
  assert.equal(inQueue.customerTrackingLive, true);
  assert.equal(inQueue.customerAssignedTeam, 'Sales · Mara');

  assert.equal(
    buildCustomerStagePayload({ status: 'in_progress', serviceTrackingStage: 'quality_check' }).customerAssignedTeam,
    'Quality Check team'
  );
});

test('customer receives a signed URL that serves the inline photo bytes; tampering or replacement invalidates it', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const order = await Order.create({
    orderNumber: 'ORD-SIGNED-PHOTO',
    bookingReference: 'ASPF-SIGNED-PHOTO',
    customer: customerId,
    customerName: 'Signed Photo Customer',
    serviceType: 'SPF Service',
    status: 'received',
    serviceTrackingStage: 'received',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    trackerStageMedia: [
      {
        stage: 'received',
        slot: 'front',
        photoUrl: `data:image/png;base64,${pngBytes.toString('base64')}`,
        uploadedAt: new Date('2026-09-12T07:00:00.000Z'),
      },
    ],
  });

  const tracker = await invoke(getOrderTrackerMedia, {
    params: { id: order._id.toString() },
    user: { id: customerId.toString(), role: 'customer' },
  });
  const [media] = tracker.body.data.trackerStageMedia;
  assert.ok(media.photoUrl);

  const photo = await invoke(getTrackerMediaPhoto, photoRequestFromUrl(media.photoUrl));
  assert.equal(photo.statusCode, 200);
  assert.equal(photo.headers['content-type'], 'image/png');
  assert.equal(photo.headers['cross-origin-resource-policy'], 'cross-origin');
  assert.deepEqual(photo.buffer, pngBytes);

  const tampered = photoRequestFromUrl(media.photoUrl);
  tampered.query.sig = `${tampered.query.sig.slice(0, -2)}xx`;
  assert.equal((await invoke(getTrackerMediaPhoto, tampered)).statusCode, 404);

  await Order.updateOne(
    { _id: order._id, 'trackerStageMedia._id': order.trackerStageMedia[0]._id },
    { $set: { 'trackerStageMedia.$.uploadedAt': new Date('2026-09-12T08:00:00.000Z') } }
  );
  assert.equal((await invoke(getTrackerMediaPhoto, photoRequestFromUrl(media.photoUrl))).statusCode, 404);
});

test('closeCustomerLiveTracking closes the session on settlement and preserves history', async () => {
  const media = [
    { stage: 'received', slot: 'front', photoUrl: 'https://res.cloudinary.com/demo/received.jpg' },
    { stage: 'ready_pickup', slot: 'rear', photoUrl: 'https://res.cloudinary.com/demo/pickup.jpg' },
  ];
  const order = await Order.create({
    orderNumber: 'ORD-CLOSE-TRACKING',
    customer: new mongoose.Types.ObjectId(),
    customerName: 'Close Tracking Customer',
    serviceType: 'SPF Service',
    status: 'ready_for_payment',
    serviceTrackingStage: 'ready_pickup',
    paymentStatus: 'paid',
    invoiceId: 'INV-CLOSE-1',
    totalPrice: 7999,
    trackerStageMedia: media,
    serviceSteps: [{ name: 'Main Service Execution', status: 'completed' }],
  });
  assert.equal(order.liveTracking, undefined, 'no default session is stamped on new or legacy rows');
  assert.equal(buildCustomerStagePayload(order).liveTracking.active, false, 'legacy settled rows derive a closed session');

  const now = new Date('2026-09-13T03:11:29.914Z');
  assert.equal(closeCustomerLiveTracking(order, { closedBy: 'Sales Mara', now }), true);
  await order.save();

  const stored = await Order.findById(order._id).lean();
  assert.equal(stored.status, 'completed');
  assert.equal(stored.serviceTrackingStage, 'completed');
  assert.equal(stored.paymentStatus, 'paid');
  assert.equal(stored.customerStatus, 'completed');
  assert.equal(stored.completedAt.toISOString(), now.toISOString());
  assert.deepEqual(
    { ...stored.liveTracking, closedAt: stored.liveTracking.closedAt.toISOString() },
    { active: false, customerVisible: false, closedAt: now.toISOString(), closedReason: 'payment_settled', closedBy: 'Sales Mara' }
  );
  assert.equal(stored.trackerStageMedia.length, 2, 'tracker evidence is preserved');
  assert.deepEqual(stored.trackerStageMedia.map((row) => row.photoUrl), media.map((row) => row.photoUrl));
  assert.equal(stored.serviceSteps.length, 1);

  const payload = buildCustomerStagePayload(stored);
  assert.equal(payload.customerTrackingState, 'completed');
  assert.equal(payload.liveTracking.active, false);
  assert.equal(payload.liveTracking.customerVisible, false);
  assert.equal(payload.customerReceiptInvoiceId, 'INV-CLOSE-1');

  // Idempotent: a retry keeps the original close time and reports no change.
  const reloaded = await Order.findById(order._id);
  assert.equal(closeCustomerLiveTracking(reloaded, { now: new Date('2026-09-14T00:00:00Z') }), false);
  assert.equal(reloaded.liveTracking.closedAt.toISOString(), now.toISOString());

  // A later status write can never reopen a closed session.
  assert.equal(resolveCustomerTrackingState({ ...stored, status: 'ready_for_payment', serviceTrackingStage: 'ready_pickup' }), 'completed');
});

test('closeCustomerLiveTracking leaves live orders and released handovers intact', () => {
  const partial = { status: 'ready_for_payment', serviceTrackingStage: 'ready_pickup', paymentStatus: 'partially_paid', invoiceId: 'INV-P' };
  assert.equal(closeCustomerLiveTracking(partial), false);
  assert.equal(partial.liveTracking, undefined);
  assert.equal(buildCustomerStagePayload(partial).liveTracking.active, true);

  const upfront = { status: 'confirmed', serviceTrackingStage: 'confirmed', paymentStatus: 'paid', invoiceId: 'INV-UP' };
  assert.equal(closeCustomerLiveTracking(upfront), false, 'up-front full payment never closes tracking before service');
  assert.equal(upfront.status, 'confirmed');

  const released = { status: 'released', serviceTrackingStage: 'released', paymentStatus: 'paid', invoiceId: 'INV-R' };
  assert.equal(closeCustomerLiveTracking(released, { reason: 'payment_settled' }), true);
  assert.equal(released.status, 'released', 'release never regresses to completed');
  assert.equal(released.liveTracking.closedReason, 'released');

  const cancelled = { status: 'cancelled', liveTracking: { active: false, customerVisible: false } };
  assert.equal(resolveCustomerTrackingState(cancelled), 'cancelled');
});
