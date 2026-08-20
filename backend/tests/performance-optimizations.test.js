import assert from 'node:assert/strict';
import test from 'node:test';
import '../config/environment.js';
import AIScan from '../models/aiScan.model.js';
import User from '../models/user.model.js';
import { touchMyActivity } from '../controllers/user.controller.js';
import { runInBackground } from '../utils/performance.utils.js';

test('background work starts after the response path and remains awaitable in tests', async () => {
  const events = [];
  const completion = runInBackground(
    { name: 'test.detached' },
    async () => events.push('background')
  );
  events.push('response');

  assert.deepEqual(events, ['response']);
  assert.equal((await completion).ok, true);
  assert.deepEqual(events, ['response', 'background']);
});

test('activity heartbeat acknowledges before its best-effort database write completes', async () => {
  const originalUpdateOne = User.updateOne;
  let releaseWrite;
  let writeStarted = false;
  const blockedWrite = new Promise((resolve) => { releaseWrite = resolve; });
  User.updateOne = async () => {
    writeStarted = true;
    await blockedWrite;
    return { acknowledged: true, modifiedCount: 1 };
  };

  try {
    let responseBody;
    touchMyActivity(
      { user: { id: '64b000000000000000000001' } },
      { json(body) { responseBody = body; return this; } },
      () => {}
    );

    assert.deepEqual(responseBody, { success: true });
    assert.equal(writeStarted, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(writeStarted, true);
    releaseWrite();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    User.updateOne = originalUpdateOne;
  }
});

test('AI scans accept a pending archive while Cloudinary runs out of band', () => {
  const scan = new AIScan({
    imageCount: 1,
    imageArchive: {
      provider: 'cloudinary',
      status: 'pending',
      uploadMode: 'signed',
      requestedCount: 1,
    },
  });

  assert.equal(scan.validateSync(), undefined);
  assert.equal(scan.imageArchive.status, 'pending');
});
