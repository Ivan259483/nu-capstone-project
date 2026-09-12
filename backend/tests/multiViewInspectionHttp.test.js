/**
 * End-to-end HTTP coverage for POST /api/ai/scan/batch through the real
 * Express app: multer boundary, view-id validation, bounded concurrency, the
 * aggregate response shape, and the untouched POST /api/ai/scan.
 *
 * MongoDB is not started; scan persistence is non-fatal by design, so the
 * handler still responds with `scanId: null`.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import axios from 'axios';
import sharp from 'sharp';

process.env.NODE_ENV = 'production';
process.env.SKIP_SERVER_START = 'true';
process.env.CORS_ORIGIN = '';
process.env.JWT_SECRET ||= 'multi-view-http-test-jwt-secret-not-used';
process.env.ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef';
process.env.ROBOFLOW_API_KEY = 'http-test-roboflow-key';
process.env.ROBOFLOW_SUBTYPE_ENABLED = 'false';
process.env.ROBOFLOW_MAX_RETRIES = '0';

const { default: app } = await import('../server.js');
const { initSocket } = await import('../utils/socket.utils.js');

let server;
let io;
let origin;
let jpeg;

before(async () => {
  jpeg = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 90, g: 100, b: 110 } },
  }).jpeg().toBuffer();

  server = http.createServer(app);
  io = initSocket(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

const withAxiosPost = async (implementation, operation) => {
  const originalPost = axios.post;
  axios.post = implementation;
  try {
    return await operation();
  } finally {
    axios.post = originalPost;
  }
};

const workflowPayload = (detectionId) => ({
  outputs: [{
    predictions: {
      image: { width: 80, height: 60 },
      predictions: [{
        detection_id: detectionId,
        class: 'damage',
        confidence: 0.88,
        x: 40,
        y: 30,
        width: 30,
        height: 20,
        points: [{ x: 25, y: 20 }, { x: 55, y: 20 }, { x: 55, y: 40 }, { x: 25, y: 40 }],
      }],
    },
  }],
});

const postBatch = (viewIds, { fileType = 'image/jpeg', fileNames } = {}) => {
  const form = new FormData();
  viewIds.forEach((viewId, index) => {
    const name = fileNames?.[index] || `${viewId}.jpg`;
    form.append('images', new Blob([jpeg], { type: fileType }), name);
  });
  form.append('viewIds', JSON.stringify(viewIds));
  return fetch(`${origin}/api/ai/scan/batch`, { method: 'POST', body: form });
};

test('five guided views return one aggregate inspection report', async () => {
  let inFlight = 0;
  let peak = 0;
  let calls = 0;

  const response = await withAxiosPost(
    async () => {
      calls += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return { data: workflowPayload(`http-damage-${calls}`) };
    },
    () => postBatch(['front', 'rear', 'left', 'right', 'close_up'])
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);

  const { data } = body;
  assert.equal(data.inspectionMode, 'multi_view');
  assert.ok(data.inspectionId, 'inspectionId is missing');
  assert.deepEqual(data.angles, ['front', 'rear', 'left', 'right', 'close_up']);

  // Independent inference input per view, two at a time.
  assert.equal(calls, 5);
  assert.equal(peak, 2, `expected at most 2 concurrent upstream calls, saw ${peak}`);

  assert.deepEqual(data.inspectionSummary, {
    requestedViews: 5,
    analyzedViews: 5,
    successfulViews: 5,
    failedViews: 0,
    viewsWithDamage: 5,
    totalDetectedRegions: 5,
  });
  assert.equal(data.views.length, 5);
  assert.equal(data.damages.length, 5);
  assert.deepEqual(
    data.damages.map((damage) => damage.sourceView.id),
    ['front', 'rear', 'left', 'right', 'close_up']
  );
  assert.deepEqual(data.damages.map((damage) => damage.imageIndex), [0, 1, 2, 3, 4]);

  // Superset of the single-scan contract, so downstream screens keep working.
  ['scanId', 'source', 'model', 'noDamageDetected', 'overallCondition', 'summary',
    'damages', 'damageReport', 'estimate', 'imageUrls', 'angles', 'integration',
    'imageProcessing', 'createdAt', 'elapsedMs'].forEach((key) => {
    assert.ok(key in data, `missing existing key ${key}`);
  });
  assert.equal(data.integration.costEstimation.length, 5);
  assert.equal(data.crossViewDeduplication.applied, false);

  // Cost stays provisional rather than silently doubling a cross-view repeat.
  assert.equal(data.estimate.lineItems.length, 5);
  assert.match(
    data.estimate.assumptions.join(' '),
    /same physical damage may be detected in more than one view/
  );

  // No credential or upstream detail in the customer payload.
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes('http-test-roboflow-key'), false);
  assert.equal(/api_key|Authorization/i.test(serialized), false);
});

test('one failing view returns partial results with a retake request', async () => {
  let calls = 0;

  const response = await withAxiosPost(
    async () => {
      calls += 1;
      if (calls === 3) {
        const error = new Error('upstream exploded');
        error.response = { status: 500 };
        throw error;
      }
      return { data: workflowPayload(`http-partial-${calls}`) };
    },
    () => postBatch(['front', 'rear', 'left', 'right', 'close_up'])
  );

  assert.equal(response.status, 200, 'a single bad view must not fail the inspection');
  const { data } = await response.json();

  assert.equal(data.inspectionSummary.successfulViews, 4);
  assert.equal(data.inspectionSummary.failedViews, 1);
  assert.equal(data.damages.length, 4);

  const failed = data.views.find((view) => !view.success);
  assert.equal(failed.message, 'This view could not be analyzed. Please retake or upload it again.');
  assert.equal(failed.noDamageDetected, false, 'a failed view must not read as clean');
  assert.match(data.summary, /Some views could not be analyzed/);
});

test('all views clean returns the cautious inspection message', async () => {
  const response = await withAxiosPost(
    async () => ({ data: { outputs: [{ predictions: { image: { width: 80, height: 60 }, predictions: [] } }] } }),
    () => postBatch(['front', 'rear'])
  );

  const { data } = await response.json();
  assert.equal(data.noDamageDetected, true);
  assert.equal(data.summary, 'No confident damage was detected across the analyzed vehicle views.');
  assert.equal(data.damages.length, 0);
  assert.equal(/the vehicle has no damage/i.test(data.summary), false);
});

test('every view failing returns the stable upstream error, not a false success', async () => {
  const response = await withAxiosPost(
    async () => {
      const error = new Error('upstream exploded');
      error.response = { status: 503 };
      throw error;
    },
    () => postBatch(['front', 'rear'])
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.code, 'ROBOFLOW_REQUEST_FAILED');
});

test('a duplicate view id is rejected with 400 before any upstream call', async () => {
  let calls = 0;
  const response = await withAxiosPost(
    async () => { calls += 1; return { data: workflowPayload('never') }; },
    () => postBatch(['front', 'front'])
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'DUPLICATE_VIEW_ID');
  assert.equal(calls, 0);
});

test('an unsupported MIME type is rejected by the shared upload boundary', async () => {
  const form = new FormData();
  form.append('images', new Blob([Buffer.from('%PDF-1.4 not an image')], { type: 'application/pdf' }), 'view.pdf');
  form.append('viewIds', JSON.stringify(['front']));

  const response = await fetch(`${origin}/api/ai/scan/batch`, { method: 'POST', body: form });
  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.code, 'UNSUPPORTED_IMAGE_TYPE');
});

test('more than five guided images are rejected', async () => {
  const form = new FormData();
  ['front', 'rear', 'left', 'right', 'close_up', 'front'].forEach((viewId, index) => {
    form.append('images', new Blob([jpeg], { type: 'image/jpeg' }), `${viewId}-${index}.jpg`);
  });
  form.append('viewIds', JSON.stringify(['front', 'rear', 'left', 'right', 'close_up', 'front']));

  const response = await fetch(`${origin}/api/ai/scan/batch`, { method: 'POST', body: form });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'LIMIT_FILE_COUNT');
});

test('POST /api/ai/scan still returns the unchanged single-image contract', async () => {
  const form = new FormData();
  form.append('images', new Blob([jpeg], { type: 'image/jpeg' }), 'vehicle.jpg');
  form.append('angles', JSON.stringify(['close_up']));

  const response = await withAxiosPost(
    async () => ({ data: workflowPayload('single-scan-damage') }),
    () => fetch(`${origin}/api/ai/scan`, { method: 'POST', body: form })
  );

  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.damages.length, 1);
  assert.equal(data.damages[0].angleHint, 'close_up');
  assert.deepEqual(data.angles, ['close_up']);

  // The batch-only keys must not appear on the single-scan response.
  assert.equal('inspectionId' in data, false);
  assert.equal('inspectionSummary' in data, false);
  assert.equal('views' in data, false);
  assert.equal(data.damages[0].sourceView, undefined);
});
