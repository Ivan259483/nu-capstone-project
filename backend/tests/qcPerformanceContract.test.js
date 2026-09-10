import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import '../config/environment.js';
import Order from '../models/order.model.js';
import { buildResponsiveTrackerMedia } from '../controllers/tracker.controller.js';
import { getQCJobDetail, getQCJobs } from '../controllers/qc.controller.js';

test('QC responses retain evidence truth without serializing inline image bytes', () => {
  const media = buildResponsiveTrackerMedia([
    {
      stage: 'quality_check',
      slot: 'qc_form',
      photoUrl: 'data:image/jpeg;base64,very-large-payload',
      uploadedAt: new Date('2026-09-10T00:00:00.000Z'),
    },
    {
      stage: 'ready_pickup',
      slot: 'front',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/photo.jpg',
    },
  ]);

  assert.equal(media[0].hasPhoto, true);
  assert.equal(media[0].photoPending, true);
  assert.equal(media[0].photoUrl, undefined);
  assert.equal(media[1].photoUrl, 'https://res.cloudinary.com/demo/image/upload/photo.jpg');
});

test('order schema exposes compound indexes for scoped QC queue and stage outcomes', () => {
  const indexes = Order.schema.indexes().map(([fields]) => JSON.stringify(fields));
  assert.ok(indexes.includes(JSON.stringify({ assignedDetailer: 1, archived: 1, status: 1, createdAt: -1 })));
  assert.ok(indexes.includes(JSON.stringify({ archived: 1, serviceTrackingStage: 1, qcCompletedAt: -1, updatedAt: -1 })));
});

test('QC bootstrap combines summary data and strips heavy media until detail hydration', async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    const order = await Order.create({
      orderNumber: 'QC-PERF-001',
      customer: new mongoose.Types.ObjectId(),
      customerName: 'QC Performance Test',
      status: 'in_progress',
      archived: false,
      serviceTrackingStage: 'quality_check',
      trackerStageMedia: [
        { stage: 'quality_check', slot: 'qc_form', photoUrl: 'data:image/jpeg;base64,inline-heavy' },
        { stage: 'in_progress', slot: 'front', photoUrl: 'https://res.cloudinary.com/demo/image/upload/hosted.jpg' },
      ],
      photos: {
        before: ['data:image/jpeg;base64,legacy-heavy'],
        after: ['https://res.cloudinary.com/demo/image/upload/after.jpg'],
      },
    });

    const invoke = (handler, req) => new Promise((resolve, reject) => {
      const res = {
        json(body) { resolve(body); return this; },
        status(code) { this.statusCode = code; return this; },
        setHeader() {},
      };
      handler(req, res, reject);
    });

    const bootstrap = await invoke(getQCJobs, {
      query: { page: '1', limit: '20', scope: 'all', includeSummary: 'true', rangeDays: '7' },
      user: { id: new mongoose.Types.ObjectId().toString() },
    });
    assert.equal(bootstrap.jobs.length, 1);
    assert.ok(bootstrap.summary?.stats);
    assert.ok(Array.isArray(bootstrap.summary?.activity));
    assert.deepEqual(bootstrap.jobs[0].photos, { before: [], after: [] });
    assert.equal(JSON.stringify(bootstrap).includes('inline-heavy'), false);

    const detail = await invoke(getQCJobDetail, {
      params: { id: order._id.toString() },
      query: {},
      user: { id: new mongoose.Types.ObjectId().toString() },
    });
    assert.deepEqual(detail.data.photos.before, []);
    assert.deepEqual(detail.data.photos.after, ['https://res.cloudinary.com/demo/image/upload/after.jpg']);
    assert.equal(JSON.stringify(detail).includes('legacy-heavy'), false);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
