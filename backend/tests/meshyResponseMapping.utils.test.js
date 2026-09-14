import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractModelUrl,
  extractUsdzUrl,
  extractThumbnailUrl,
  extractTaskId,
  normalizeMeshyStatus,
  isGlbUrl,
  isUsdzUrl,
  extractPrecedingTasks,
  extractLifecycleTimestamps,
  extractTaskError,
} from '../utils/meshyResponseMapping.utils.js';

test('normalizeMeshyStatus maps Meshy 7 status vocabulary to the app tri-state', () => {
  assert.equal(normalizeMeshyStatus('SUCCEEDED'), 'ar_ready');
  assert.equal(normalizeMeshyStatus('succeeded'), 'ar_ready');
  assert.equal(normalizeMeshyStatus('IN_PROGRESS'), 'processing');
  assert.equal(normalizeMeshyStatus('PENDING'), 'processing');
  assert.equal(normalizeMeshyStatus('FAILED'), 'failed');
  assert.equal(normalizeMeshyStatus('CANCELLED'), 'failed');
  assert.equal(normalizeMeshyStatus(undefined), 'processing');
  assert.equal(normalizeMeshyStatus('some_unknown_state'), 'processing');
});

test('isGlbUrl / isUsdzUrl ignore query strings and fragments but require the right extension', () => {
  assert.equal(isGlbUrl('https://assets.meshy.ai/model.glb?X-Amz-Expires=3600'), true);
  assert.equal(isGlbUrl('https://assets.meshy.ai/model.usdz'), false);
  assert.equal(isGlbUrl('https://assets.meshy.ai/model.glb#frag'), true);
  assert.equal(isGlbUrl(null), false);
  assert.equal(isUsdzUrl('https://assets.meshy.ai/model.usdz?sig=abc'), true);
  assert.equal(isUsdzUrl('https://assets.meshy.ai/model.glb'), false);
});

test('extractModelUrl prefers model_urls.glb and rejects non-.glb candidates', () => {
  assert.equal(
    extractModelUrl({ model_urls: { glb: 'https://assets.meshy.ai/a.glb' } }),
    'https://assets.meshy.ai/a.glb'
  );
  assert.equal(
    extractModelUrl({ result: { model_urls: { glb: 'https://assets.meshy.ai/b.glb' } } }),
    'https://assets.meshy.ai/b.glb'
  );
  assert.equal(
    extractModelUrl({ output: { model_urls: { glb: 'https://assets.meshy.ai/c.glb' } } }),
    'https://assets.meshy.ai/c.glb'
  );
  // A thumbnail URL under model_urls.glb must never be accepted as the model.
  assert.equal(
    extractModelUrl({ model_urls: { glb: 'https://assets.meshy.ai/thumb.png' } }),
    null
  );
  assert.equal(extractModelUrl({}), null);
});

test('extractUsdzUrl walks the same candidate shapes for the USDZ (Quick Look) file', () => {
  assert.equal(
    extractUsdzUrl({ model_urls: { usdz: 'https://assets.meshy.ai/a.usdz' } }),
    'https://assets.meshy.ai/a.usdz'
  );
  assert.equal(
    extractUsdzUrl({ usdz_url: 'https://assets.meshy.ai/legacy.usdz' }),
    'https://assets.meshy.ai/legacy.usdz'
  );
  assert.equal(
    extractUsdzUrl({ data: { model_urls: { usdz: 'https://assets.meshy.ai/d.usdz' } } }),
    'https://assets.meshy.ai/d.usdz'
  );
  // Meshy plans that don't return target_formats: ['usdz'] leave this null —
  // callers must treat USDZ/Quick Look as optional, not fail the whole task.
  assert.equal(extractUsdzUrl({ model_urls: { glb: 'https://assets.meshy.ai/a.glb' } }), null);
});

test('extractThumbnailUrl returns the first http(s) preview candidate, if any', () => {
  assert.equal(
    extractThumbnailUrl({ thumbnail_url: 'https://assets.meshy.ai/preview.png' }),
    'https://assets.meshy.ai/preview.png'
  );
  assert.equal(
    extractThumbnailUrl({ result: { thumbnail_url: 'https://assets.meshy.ai/r.png' } }),
    'https://assets.meshy.ai/r.png'
  );
  assert.equal(extractThumbnailUrl({ thumbnail_url: 'not-a-url' }), null);
  assert.equal(extractThumbnailUrl({}), null);
});

test('extractTaskId reads Meshy 7 task_id and older id/result shapes', () => {
  assert.equal(extractTaskId({ task_id: 'abc123' }), 'abc123');
  assert.equal(extractTaskId({ id: 'def456' }), 'def456');
  assert.equal(extractTaskId({ result: { id: 'ghi789' } }), 'ghi789');
  assert.equal(extractTaskId({}), '');
});

test('extractPrecedingTasks returns the real Meshy queue-depth number, or null when absent', () => {
  // PENDING + preceding_tasks -> queue count displayed
  assert.equal(extractPrecedingTasks({ status: 'PENDING', preceding_tasks: 382 }), 382);
  assert.equal(extractPrecedingTasks({ result: { preceding_tasks: 12 } }), 12);
  assert.equal(extractPrecedingTasks({ preceding_tasks: 0 }), 0);
  assert.equal(extractPrecedingTasks({}), null);
  assert.equal(extractPrecedingTasks({ preceding_tasks: 'not-a-number' }), null);
});

test('extractLifecycleTimestamps passes through created_at/started_at/finished_at as-is', () => {
  // PENDING + progress 0 -> queued/indeterminate state: started_at is 0/absent.
  assert.deepEqual(
    extractLifecycleTimestamps({ status: 'PENDING', started_at: 0, created_at: 1000 }),
    { createdAt: 1000, startedAt: 0, finishedAt: null }
  );
  // IN_PROGRESS: started_at is a real, non-zero timestamp once generation begins.
  assert.deepEqual(
    extractLifecycleTimestamps({ created_at: 1000, started_at: 1500, finished_at: null }),
    { createdAt: 1000, startedAt: 1500, finishedAt: null }
  );
  assert.deepEqual(
    extractLifecycleTimestamps({ result: { started_at: 2000 } }),
    { createdAt: null, startedAt: 2000, finishedAt: null }
  );
  assert.deepEqual(extractLifecycleTimestamps({}), { createdAt: null, startedAt: null, finishedAt: null });
});

test('extractTaskError normalizes a Meshy task_error object or string into one message', () => {
  assert.equal(extractTaskError({ task_error: { message: 'Image rejected: unsupported format' } }), 'Image rejected: unsupported format');
  assert.equal(extractTaskError({ task_error: 'Out of credits' }), 'Out of credits');
  assert.equal(extractTaskError({ result: { task_error: { message: 'nested' } } }), 'nested');
  assert.equal(extractTaskError({}), null);
  assert.equal(extractTaskError({ task_error: null }), null);
});
