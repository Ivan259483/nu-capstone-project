// Scoped, repeatable repair for the three reviewed September 2026 demo orders.
// Preview: node scripts/reseed-customer-mobile-demo.js
// Apply:   node scripts/reseed-customer-mobile-demo.js --apply
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { serialize } from 'node:v8';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
const plans = [
  { id: '6aa2ca181cfc1e5c31474bd9', date: '2026-09-09', prefix: 'acura_' },
  { id: '6aa2e71c9321d1825664bffd', date: '2026-09-10', prefix: 'acura_' },
  { id: '6aa5308c639a02248e4d01ac', date: '2026-09-12', prefix: '' },
];
const stageTimes = { received: '08:30', in_progress: '09:00', quality_check: '14:30', ready_pickup: '15:15' };
const at = (date, time) => new Date(`${date}T${time}:00+08:00`);
const asset = async (slot, prefix) => {
  const isForm = slot.endsWith('_form');
  const ext = isForm ? 'png' : 'jpg';
  const bytes = await readFile(new URL(`../fixtures/customer-mobile-demo/${isForm ? '' : prefix}${slot}.${ext}`, import.meta.url));
  return `data:image/${isForm ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
};

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const state = await db.collection('systemstates').findOne({});
  assert.ok(['development', 'demo'].includes(state?.mode), 'Demo repair requires development/demo mode');
  const patches = [];
  for (const plan of plans) {
    const order = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(plan.id), dataEnvironment: 'demo' });
    assert.ok(order, `Reviewed demo order missing: ${plan.id}`);
    assert.ok(['released', 'completed', 'ready_for_payment'].includes(order.status));
    const media = await Promise.all(order.trackerStageMedia.map(async (entry, index) => {
      return {
        ...entry,
        photoUrl: await asset(entry.slot, plan.prefix),
        description: `Demo sample: ${entry.slot.replaceAll('_', ' ')}. Not an actual inspection record.`,
        uploadedAt: new Date(at(plan.date, stageTimes[entry.stage]).getTime() - (20 - index) * 60000),
      };
    }));
    const set = {
      bookingDate: plan.date,
      bookingTime: '08:30',
      createdAt: at(plan.date, '07:45'),
      approvedAt: at(plan.date, '08:00'),
      'jobOrder.ingressDateTime': at(plan.date, '08:30'),
      'jobOrder.targetReleaseDate': at(plan.date, '15:30'),
      qcCompletedAt: at(plan.date, '14:30'),
      readyForPaymentAt: at(plan.date, '15:15'),
      trackerStageMedia: media,
    };
    // Keep financial timestamps and explicit release state intact.
    if (order.status === 'ready_for_payment') set.serviceTrackingUpdatedAt = at(plan.date, '15:15');
    patches.push({ order, set });
  }
  if (process.argv.includes('--apply')) {
    const backupDir = path.join(os.homedir(), '.codex', 'backups', 'customer-mobile-demo');
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backupPath = path.join(backupDir, `${Date.now()}.bson-backup`);
    await writeFile(backupPath, serialize(patches.map(({ order, set }) => ({ id: String(order._id), before: order, changedFields: Object.keys(set) }))), { mode: 0o600 });
    for (const { order, set } of patches) {
      const result = await db.collection('orders').updateOne({ _id: order._id, dataEnvironment: 'demo', updatedAt: order.updatedAt }, { $set: set });
      assert.equal(result.matchedCount, 1, 'Order changed during repair; rerun preview');
    }
    console.log(`Applied ${patches.length} demo repairs. Local rollback snapshot: ${backupPath}`);
  }
  for (const { order, set } of patches) console.log(JSON.stringify({ id: String(order._id), status: order.status, date: set.bookingDate, timeline: ['08:00', '08:30', '08:46', '14:30', '15:15'], slots: set.trackerStageMedia.length, distinctImages: new Set(set.trackerStageMedia.map(x => x.photoUrl)).size }));
} finally {
  await mongoose.disconnect();
}
