import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EvidenceUploadError,
  EvidenceUploadQueue,
  evidenceUploadKey,
  type EvidenceUploadTransport,
} from '../src/lib/evidence-upload/upload-queue.ts';
import {
  EVIDENCE_ENCODE_STEPS,
  EVIDENCE_TARGET_MAX_BYTES,
  fitWithinEdge,
  shouldOptimizeEvidence,
} from '../src/lib/evidence-upload/optimize-policy.ts';

const SLOTS = ['front', 'rear', 'left', 'right', 'close_up'];
const ORDER = 'order-1';
const STAGE = 'in_progress';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Hooks = {
  uploadError?: (slot: string, attempt: number) => Error | null;
  commitError?: (slot: string, attempt: number) => Error | null;
  intentsError?: () => Error | null;
  uploadMs?: number;
};

function createFakeTransport(hooks: Hooks = {}) {
  const calls = {
    optimize: [] as string[],
    intents: [] as string[][],
    uploads: [] as string[],
    commits: [] as string[],
    server: [] as string[],
    failures: [] as string[],
  };
  let activeUploads = 0;
  let maxActiveUploads = 0;
  let activeOptimize = 0;
  let maxActiveOptimize = 0;
  const count = (list: string[], slot: string) => list.filter((entry) => entry === slot).length;

  const transport: EvidenceUploadTransport = {
    async optimize(file) {
      activeOptimize += 1;
      maxActiveOptimize = Math.max(maxActiveOptimize, activeOptimize);
      const label = await file.text();
      await delay(5);
      activeOptimize -= 1;
      calls.optimize.push(label);
      return { blob: new Blob(['optimized']), width: 1600, height: 1200, mimeType: 'image/webp', originalBytes: file.size, ms: 1 };
    },
    async createIntents(_orderId, _stage, items) {
      const error = hooks.intentsError?.();
      if (error) throw error;
      calls.intents.push(items.map((item) => item.slot));
      const round = calls.intents.length;
      return items.map((item) => ({
        slot: item.slot,
        evidenceId: `ev-${item.slot}-${round}`,
        attemptId: `att-${item.slot}-${round}`,
        uploadUrl: 'https://api.cloudinary.com/v1_1/test/image/upload',
        fields: {},
        expiresAt: '',
      }));
    },
    async uploadToCloudinary(intent, _image, onProgress) {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      calls.uploads.push(intent.slot);
      onProgress(0.5);
      await delay(hooks.uploadMs ?? 30);
      activeUploads -= 1;
      const error = hooks.uploadError?.(intent.slot, count(calls.uploads, intent.slot));
      if (error) throw error;
      onProgress(1);
      return { public_id: `pid-${intent.slot}`, version: 1, signature: 'sig' };
    },
    async commit(_orderId, intent) {
      calls.commits.push(intent.slot);
      const error = hooks.commitError?.(intent.slot, count(calls.commits, intent.slot));
      if (error) throw error;
      return { photoUrl: `https://res.cloudinary.com/test/${intent.slot}.webp` };
    },
    async reportFailure(_orderId, intent, code) {
      calls.failures.push(`${intent.slot}:${code}`);
    },
  };

  return { transport, calls, stats: () => ({ maxActiveUploads, maxActiveOptimize }) };
}

const quietLogger = { info() {}, warn() {} };
const baseOptions = { intentBatchWindowMs: 50, retryDelaysMs: [0], jitterMs: 0, logger: quietLogger };
const file = (label: string) => new Blob([label]);

test('five photos upload in parallel after one batched intent request', async () => {
  const fake = createFakeTransport({ uploadMs: 60 });
  const queue = new EvidenceUploadQueue(fake.transport, baseOptions);
  const settled: unknown[] = [];
  queue.onBatchSettled((summary) => settled.push(summary));

  const outcomes = await Promise.all(SLOTS.map((slot) => queue.enqueue({ orderId: ORDER, stage: STAGE, slot, file: file(slot) })));

  assert.ok(outcomes.every((outcome) => outcome.success));
  assert.equal(fake.calls.intents.length, 1, 'one signing request for the whole pick');
  assert.deepEqual([...fake.calls.intents[0]].sort(), [...SLOTS].sort());
  assert.equal(fake.stats().maxActiveUploads, 5, 'all five Cloudinary uploads overlap');
  assert.ok(fake.stats().maxActiveOptimize <= 2, 'image decoding is bounded to two at a time');
  for (const slot of SLOTS) {
    const item = queue.get(evidenceUploadKey(ORDER, STAGE, slot))!;
    assert.equal(item.state, 'SUCCESS');
    assert.equal(item.progress, 100);
  }
  assert.equal(settled.length, 1);
  assert.deepEqual(
    (({ total, succeeded, failed, settled: done }) => ({ total, succeeded, failed, done }))(settled[0] as any),
    { total: 5, succeeded: 5, failed: 0, done: true }
  );
});

test('upload concurrency limit is respected', async () => {
  const fake = createFakeTransport({ uploadMs: 40 });
  const queue = new EvidenceUploadQueue(fake.transport, { ...baseOptions, uploadConcurrency: 2 });
  await Promise.all(SLOTS.map((slot) => queue.enqueue({ orderId: ORDER, stage: STAGE, slot, file: file(slot) })));
  assert.equal(fake.stats().maxActiveUploads, 2);
});

test('retry re-sends only the failed photo and reuses its optimized image', async () => {
  const fake = createFakeTransport({
    uploadError: (slot, attempt) => (slot === 'left' && attempt === 1 ? new EvidenceUploadError('NETWORK', 'offline', { status: 0 }) : null),
  });
  const queue = new EvidenceUploadQueue(fake.transport, { ...baseOptions, maxAutoRetries: 0 });

  const outcomes = await Promise.all(SLOTS.map((slot) => queue.enqueue({ orderId: ORDER, stage: STAGE, slot, file: file(slot) })));
  assert.equal(outcomes.filter((outcome) => outcome.success).length, 4);
  const leftKey = evidenceUploadKey(ORDER, STAGE, 'left');
  assert.equal(queue.get(leftKey)!.state, 'FAILED');
  assert.equal(queue.get(leftKey)!.retryable, true);
  assert.deepEqual(fake.calls.failures, ['left:NETWORK']);

  const retried = await queue.retry(leftKey);
  assert.equal(retried.success, true);
  assert.equal(fake.calls.optimize.filter((label) => label === 'left').length, 1, 'image is not re-optimized');
  assert.deepEqual(fake.calls.intents.at(-1), ['left'], 'only the failed slot is re-signed');
  assert.equal(fake.calls.uploads.length, 6, 'five first attempts + one retry');
  assert.equal(queue.get(leftKey)!.attempt, 2);
});

test('when Cloudinary succeeded but the commit failed, retry commits without re-uploading', async () => {
  const fake = createFakeTransport({
    commitError: (slot, attempt) => (slot === 'right' && attempt === 1 ? new EvidenceUploadError('TIMEOUT', 'api timeout') : null),
  });
  const queue = new EvidenceUploadQueue(fake.transport, { ...baseOptions, maxAutoRetries: 0 });
  const key = evidenceUploadKey(ORDER, STAGE, 'right');

  const first = await queue.enqueue({ orderId: ORDER, stage: STAGE, slot: 'right', file: file('right') });
  assert.equal(first.success, false);
  const second = await queue.retry(key);
  assert.equal(second.success, true);
  assert.equal(fake.calls.uploads.filter((slot) => slot === 'right').length, 1);
  assert.equal(fake.calls.commits.filter((slot) => slot === 'right').length, 2);
});

test('transient failures auto-retry and pass through the RETRY state', async () => {
  const fake = createFakeTransport({
    uploadError: (slot, attempt) => (slot === 'rear' && attempt === 1 ? new EvidenceUploadError('STALLED', 'stalled') : null),
  });
  const queue = new EvidenceUploadQueue(fake.transport, { ...baseOptions, maxAutoRetries: 2 });
  const key = evidenceUploadKey(ORDER, STAGE, 'rear');
  const states = new Set<string>();
  queue.subscribe(() => {
    const item = queue.get(key);
    if (item) states.add(item.state);
  });

  const outcome = await queue.enqueue({ orderId: ORDER, stage: STAGE, slot: 'rear', file: file('rear') });
  assert.equal(outcome.success, true);
  assert.ok(states.has('RETRY'));
  assert.equal(queue.get(key)!.autoRetries, 1);
});

test('authorization failures are not auto-retried', async () => {
  const fake = createFakeTransport({
    uploadError: (slot) => (slot === 'left' ? new EvidenceUploadError('CLOUDINARY_403', 'forbidden', { status: 403 }) : null),
  });
  const queue = new EvidenceUploadQueue(fake.transport, { ...baseOptions, maxAutoRetries: 2 });
  const outcome = await queue.enqueue({ orderId: ORDER, stage: STAGE, slot: 'left', file: file('left') });
  assert.equal(outcome.success, false);
  assert.equal(outcome.error?.code, 'CLOUDINARY_403');
  assert.equal(fake.calls.uploads.length, 1);
});

test('falls back to server upload when direct upload is unavailable', async () => {
  const fake = createFakeTransport({
    intentsError: () => new EvidenceUploadError('DIRECT_UPLOAD_UNAVAILABLE', 'not configured', { status: 503 }),
  });
  fake.transport.uploadViaServer = async (_orderId, _stage, slot, _image, onProgress) => {
    fake.calls.server.push(slot);
    onProgress(1);
    return { photoUrl: `https://res.cloudinary.com/test/${slot}.jpg` };
  };
  const queue = new EvidenceUploadQueue(fake.transport, baseOptions);

  const outcomes = await Promise.all(SLOTS.slice(0, 3).map((slot) => queue.enqueue({ orderId: ORDER, stage: STAGE, slot, file: file(slot) })));
  assert.ok(outcomes.every((outcome) => outcome.success));
  assert.deepEqual([...fake.calls.server].sort(), ['front', 'left', 'rear']);
  assert.equal(queue.get(evidenceUploadKey(ORDER, STAGE, 'front'))!.via, 'server');
});

test('picking a new photo for a slot cancels the in-flight one', async () => {
  const fake = createFakeTransport();
  const queue = new EvidenceUploadQueue(fake.transport, baseOptions);
  const first = queue.enqueue({ orderId: ORDER, stage: STAGE, slot: 'front', file: file('first') });
  const second = queue.enqueue({ orderId: ORDER, stage: STAGE, slot: 'front', file: file('second') });

  assert.deepEqual(await first, { success: false, cancelled: true });
  assert.equal((await second).success, true);
  assert.equal(fake.calls.commits.filter((slot) => slot === 'front').length, 1);
});

test('optimization policy fits the long edge and targets 500 KB', () => {
  assert.deepEqual(fitWithinEdge(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithinEdge(3024, 4032, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithinEdge(800, 600, 1600), { width: 800, height: 600 }, 'never upscales');
  assert.equal(EVIDENCE_TARGET_MAX_BYTES, 500 * 1024);
  assert.equal(EVIDENCE_ENCODE_STEPS[0].maxEdge, 1600);
  assert.ok(EVIDENCE_ENCODE_STEPS.every((step, index, steps) => index === 0 || step.quality <= steps[index - 1].quality || step.maxEdge < steps[index - 1].maxEdge));
  assert.equal(shouldOptimizeEvidence({ size: 4_000_000, type: 'image/jpeg' }), true);
  assert.equal(shouldOptimizeEvidence({ size: 120_000, type: 'image/jpeg' }), false);
  assert.equal(shouldOptimizeEvidence({ size: 4_000_000, type: 'image/gif' }), false);
});
