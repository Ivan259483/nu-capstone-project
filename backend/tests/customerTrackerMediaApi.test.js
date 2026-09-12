import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { default: Order } = await import('../models/order.model.js');
const { getOrderTrackerMedia } = await import('../controllers/order.controller.js');

let mongo;

function invokeTrackerMedia({ orderId, userId, role }) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET',
      originalUrl: `/api/orders/${orderId}/tracker-media`,
      params: { id: orderId.toString() },
      user: { id: userId.toString(), role },
    };
    const res = {
      locals: {},
      headersSent: false,
      statusCode: 200,
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
      },
    };
    const next = (error) => (error ? reject(error) : resolve({ statusCode: 200, body: null }));
    Promise.resolve(getOrderTrackerMedia(req, res, next)).catch(reject);
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('customer tracker API omits pending evidence while QC API access retains it', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    orderNumber: 'ORD-STRICT-GATE-API',
    bookingReference: 'ASPF-STRICT-GATE-API',
    customer: customerId,
    customerName: 'Strict Gate Customer',
    serviceType: 'SPF Service',
    status: 'confirmed',
    serviceTrackingStage: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    trackerStageMedia: [
      {
        stage: 'received',
        slot: 'front',
        photoUrl: 'https://media.example.test/unreleased-arrival.jpg',
        description: 'Internal arrival note',
        uploadedBy: 'QC Internal',
      },
    ],
  });

  const customerResponse = await invokeTrackerMedia({
    orderId: order._id,
    userId: customerId,
    role: 'customer',
  });
  assert.equal(customerResponse.statusCode, 200);
  assert.deepEqual(customerResponse.body.data.trackerStageMedia, []);
  assert.equal(JSON.stringify(customerResponse.body).includes('unreleased-arrival.jpg'), false);
  assert.equal(JSON.stringify(customerResponse.body).includes('Internal arrival note'), false);

  const qcResponse = await invokeTrackerMedia({
    orderId: order._id,
    userId: new mongoose.Types.ObjectId(),
    role: 'staff_quality_checker',
  });
  assert.equal(qcResponse.statusCode, 200);
  assert.equal(qcResponse.body.data.trackerStageMedia.length, 1);
  assert.equal(qcResponse.body.data.trackerStageMedia[0].photoUrl, 'https://media.example.test/unreleased-arrival.jpg');
});

test('customer tracker API releases the completed gate but keeps the next gate private', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const order = await Order.create({
    orderNumber: 'ORD-STRICT-GATE-FUTURE',
    bookingReference: 'ASPF-STRICT-GATE-FUTURE',
    customer: customerId,
    customerName: 'Future Gate Customer',
    serviceType: 'SPF Service',
    status: 'received',
    serviceTrackingStage: 'received',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: 'https://media.example.test/released-arrival.jpg' },
      { stage: 'in_progress', slot: 'front', photoUrl: 'https://media.example.test/unreleased-service.jpg' },
    ],
  });

  const response = await invokeTrackerMedia({ orderId: order._id, userId: customerId, role: 'customer' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data.trackerStageMedia.map((entry) => entry.stage), ['received']);
  assert.equal(JSON.stringify(response.body).includes('unreleased-service.jpg'), false);
});

test('tracker API replaces inline media with metadata-only placeholders', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const inlinePhoto = `data:image/jpeg;base64,${'A'.repeat(256 * 1024)}`;
  const order = await Order.create({
    orderNumber: 'ORD-INLINE-PLACEHOLDER',
    bookingReference: 'ASPF-INLINE-PLACEHOLDER',
    customer: customerId,
    customerName: 'Inline Media Customer',
    serviceType: 'SPF Service',
    status: 'received',
    serviceTrackingStage: 'received',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: inlinePhoto },
    ],
  });

  const response = await invokeTrackerMedia({ orderId: order._id, userId: customerId, role: 'customer' });
  const [media] = response.body.data.trackerStageMedia;

  assert.equal(response.statusCode, 200);
  assert.equal(media.id, order.trackerStageMedia[0]._id.toString());
  assert.equal(media.photoUrl, '');
  assert.equal(media.hasPhoto, true);
  assert.equal(media.photoPending, true);
  assert.equal(JSON.stringify(response.body).includes('data:image'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(response.body)) < 10 * 1024);
});
