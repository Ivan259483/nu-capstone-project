import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getMeshyImageToImageStatus,
  normalizeMeshyImageRepairStatus,
  REPAIR_VISUALIZATION_PROMPT,
  startMeshyImageToImage,
} from '../services/meshyImageRepair.service.js';
import { resolveRepairVisualizationSource } from '../utils/repairVisualization.utils.js';

const withConfiguredEnvironment = async (run) => {
  const names = [
    'MESHY_API_KEY',
    'MESHY_API_BASE_URL',
    'MESHY_IMAGE_REPAIR_API_BASE_URL',
    'MESHY_REPAIR_AI_MODEL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_UPLOAD_PRESET',
  ];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    MESHY_API_KEY: 'server-test-key',
    // The legacy/shared base may remain on v2 for Image-to-3D. Repair Preview
    // must independently use its documented v1 Image-to-Image contract.
    MESHY_API_BASE_URL: 'https://api.meshy.ai/openapi/v2',
    MESHY_REPAIR_AI_MODEL: 'nano-banana',
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_UPLOAD_PRESET: 'test-preset',
  });
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  delete process.env.MESHY_IMAGE_REPAIR_API_BASE_URL;
  try {
    return await run();
  } finally {
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
};

test('Meshy Image-to-Image creation sends one reference image and keeps the key in the Authorization header', async () => {
  await withConfiguredEnvironment(async () => {
    let captured;
    const httpClient = {
      head: async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' } }),
      post: async (url, payload, config) => {
        captured = { url, payload, config };
        return { status: 201, data: { result: 'repair-task-123' } };
      },
    };
    const result = await startMeshyImageToImage({
      referenceImageUrl: 'https://res.cloudinary.com/test/image/upload/before.jpg',
      httpClient,
    });

    assert.equal(result.taskId, 'repair-task-123');
    assert.equal(result.status, 'queued');
    assert.equal(captured.url, 'https://api.meshy.ai/openapi/v1/image-to-image');
    assert.deepEqual(captured.payload.reference_image_urls, [
      'https://res.cloudinary.com/test/image/upload/before.jpg',
    ]);
    assert.equal(captured.payload.ai_model, 'nano-banana');
    assert.deepEqual(Object.keys(captured.payload).sort(), [
      'ai_model',
      'prompt',
      'reference_image_urls',
    ]);
    assert.equal('aspect_ratio' in captured.payload, false);
    assert.equal('remove_background' in captured.payload, false);
    assert.equal('generate_multi_view' in captured.payload, false);
    assert.equal(captured.payload.reference_image_urls.length, 1);
    assert.equal(captured.config.headers.Authorization, 'Bearer server-test-key');
    assert.doesNotMatch(JSON.stringify(captured.payload), /server-test-key|MESHY_API_KEY/);
    assert.doesNotMatch(REPAIR_VISUALIZATION_PROMPT, /this exact vehicle/i);
    assert.match(REPAIR_VISUALIZATION_PROMPT, /Visually remove or significantly reduce only the visible exterior damage/i);
    assert.match(REPAIR_VISUALIZATION_PROMPT, /smooth, clean, repaired-looking finish/i);
    assert.match(REPAIR_VISUALIZATION_PROMPT, /not an exact real-world repair result/i);
  });
});

test('Meshy creation rejects local or inline images before any credit-spending request', async () => {
  await withConfiguredEnvironment(async () => {
    let requestCount = 0;
    const httpClient = {
      head: async () => {
        throw new Error('head should not run');
      },
      post: async () => {
        requestCount += 1;
        return { data: { result: 'should-not-run' } };
      },
    };
    await assert.rejects(
      startMeshyImageToImage({
        referenceImageUrl: 'data:image/png;base64,AAAA',
        httpClient,
      }),
      (error) => error.code === 'MESHY_IMAGE_REPAIR_INVALID_REFERENCE'
    );
    assert.equal(requestCount, 0);

    await assert.rejects(
      startMeshyImageToImage({
        referenceImageUrl: 'https://192.168.18.164/private.jpg',
        httpClient,
      }),
      (error) => error.code === 'MESHY_IMAGE_REPAIR_INVALID_REFERENCE'
    );
    assert.equal(requestCount, 0);
  });
});

const upstreamCases = [
  [400, 'MESHY_IMAGE_REPAIR_INVALID_REFERENCE', 'The selected image could not be processed for repair visualization. Choose another view and try again.'],
  [401, 'MESHY_IMAGE_REPAIR_UNAUTHORIZED', 'Repair visualization service is not authorized.'],
  [402, 'MESHY_IMAGE_REPAIR_INSUFFICIENT_CREDITS', 'Repair visualization credits are unavailable.'],
  [404, 'MESHY_IMAGE_REPAIR_UPSTREAM_NOT_FOUND', 'Repair visualization is temporarily unavailable.'],
  [429, 'MESHY_IMAGE_REPAIR_RATE_LIMITED', 'Repair visualization is busy. Please try again shortly.'],
  [503, 'MESHY_IMAGE_REPAIR_UPSTREAM_UNAVAILABLE', 'Repair visualization is temporarily unavailable.'],
];

for (const [status, expectedCode, expectedMessage] of upstreamCases) {
  test(`Meshy create HTTP ${status} maps to ${expectedCode}`, async () => {
    await withConfiguredEnvironment(async () => {
      const error = new Error(`upstream ${status}`);
      error.response = { status, data: { message: `upstream ${status}` } };
      await assert.rejects(
        startMeshyImageToImage({
          referenceImageUrl: 'https://res.cloudinary.com/test/image/upload/before.jpg',
          httpClient: {
            head: async () => ({ status: 200, headers: { 'content-type': 'image/png' } }),
            post: async () => { throw error; },
          },
          logger: { info() {}, warn() {} },
        }),
        (mapped) => mapped.code === expectedCode && mapped.message === expectedMessage
      );
    });
  });
}

test('Meshy create network errors map to temporary unavailable without a duplicate attempt', async () => {
  await withConfiguredEnvironment(async () => {
    let postCount = 0;
    await assert.rejects(
      startMeshyImageToImage({
        referenceImageUrl: 'https://res.cloudinary.com/test/image/upload/before.jpg',
        httpClient: {
          head: async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' } }),
          post: async () => {
            postCount += 1;
            const error = new Error('socket reset');
            error.code = 'ECONNRESET';
            throw error;
          },
        },
        logger: { info() {}, warn() {} },
      }),
      (error) => error.code === 'MESHY_IMAGE_REPAIR_NETWORK_ERROR'
        && error.message === 'Repair visualization is temporarily unavailable.'
    );
    assert.equal(postCount, 1);
  });
});

test('Meshy diagnostics never log API keys, authorization, or reference URL query strings', async () => {
  await withConfiguredEnvironment(async () => {
    const entries = [];
    const logger = {
      info: (value) => entries.push(String(value)),
      warn: (value) => entries.push(String(value)),
    };
    const error = new Error('request rejected');
    error.response = {
      status: 400,
      data: {
        message: 'Could not fetch https://res.cloudinary.com/test/image/upload/private.jpg?token=url-secret',
        api_key: 'body-key-secret',
      },
    };
    await assert.rejects(
      startMeshyImageToImage({
        referenceImageUrl: 'https://res.cloudinary.com/test/image/upload/before.jpg?signature=query-secret',
        httpClient: {
          head: async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' } }),
          post: async () => { throw error; },
        },
        logger,
      })
    );
    const output = entries.join('\n');
    assert.doesNotMatch(output, /server-test-key|body-key-secret|url-secret|query-secret/i);
    assert.doesNotMatch(output, /authorization|signature=|token=/i);
    assert.match(output, /configured=true/);
    assert.match(output, /sourceHost=res\.cloudinary\.com/);
    assert.match(output, /sourceContentType=image\/jpeg/);
  });
});

test('Meshy task states and successful after image are normalized without inventing credits', async () => {
  assert.equal(normalizeMeshyImageRepairStatus('PENDING'), 'queued');
  assert.equal(normalizeMeshyImageRepairStatus('IN_PROGRESS'), 'processing');
  assert.equal(normalizeMeshyImageRepairStatus('SUCCEEDED'), 'ready');
  assert.equal(normalizeMeshyImageRepairStatus('FAILED'), 'failed');
  assert.equal(normalizeMeshyImageRepairStatus('CANCELED'), 'failed');

  await withConfiguredEnvironment(async () => {
    const result = await getMeshyImageToImageStatus('repair-task-123', {
      httpClient: {
        get: async () => ({
          data: {
            id: 'repair-task-123',
            status: 'SUCCEEDED',
            progress: 100,
            ai_model: 'nano-banana',
            image_urls: ['https://assets.meshy.ai/tasks/repair-task-123/output/image.png?Expires=1'],
            consumed_credits: 3,
          },
        }),
      },
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.afterImageUrl, 'https://assets.meshy.ai/tasks/repair-task-123/output/image.png?Expires=1');
    assert.equal(result.consumedCredits, 3);
  });
});

test('selected source is scan-owned, preserves the before image, and validates view/damage ownership', () => {
  const scan = {
    imageUrls: ['https://cdn/front.jpg', 'https://cdn/right.jpg'],
    angles: ['front', 'right'],
    views: [
      { viewId: 'front', label: 'Front', index: 0 },
      { viewId: 'right', label: 'Right', index: 1 },
    ],
    damages: [
      { id: 'dent-right', imageIndex: 1 },
    ],
  };
  assert.deepEqual(resolveRepairVisualizationSource(scan, {
    selectedImageIndex: 1,
    sourceView: 'Right',
    sourceDamageId: 'dent-right',
  }), {
    beforeImageUrl: 'https://cdn/right.jpg',
    sourceView: 'right',
    sourceImageIndex: 1,
    sourceDamageId: 'dent-right',
  });
  assert.throws(
    () => resolveRepairVisualizationSource(scan, { selectedImageIndex: 1, sourceView: 'front' }),
    /does not match/
  );
  assert.throws(
    () => resolveRepairVisualizationSource({
      imageUrls: ['https://cdn/other.jpg'],
      angles: ['driver_side'],
    }, {
      selectedImageIndex: 0,
      sourceView: 'driver_side',
    }),
    /not one of the supported inspection views/
  );
});

test('controller uses an atomic pre-credit claim and never exposes the backend API key to mobile source', () => {
  const controllerSource = readFileSync(
    new URL('../controllers/repairVisualization.controller.js', import.meta.url),
    'utf8'
  );
  const mobileServiceSource = readFileSync(
    new URL('../../mobile/src/services/api/aiService.ts', import.meta.url),
    'utf8'
  );
  const routeSource = readFileSync(
    new URL('../routes/ai.routes.js', import.meta.url),
    'utf8'
  );
  const serverSource = readFileSync(
    new URL('../server.js', import.meta.url),
    'utf8'
  );
  const repairServiceSource = readFileSync(
    new URL('../services/meshyImageRepair.service.js', import.meta.url),
    'utf8'
  );
  const threeDServiceSource = readFileSync(
    new URL('../services/meshy.service.js', import.meta.url),
    'utf8'
  );
  assert.match(controllerSource, /findOneAndUpdate\([\s\S]*?repairVisualization: \{ \$exists: false \}/);
  assert.match(controllerSource, /A concurrent tap\/request won the atomic claim/);
  assert.match(controllerSource, /\[RepairVisualization\] request received method=POST scanId=/);
  assert.match(routeSource, /router\.post\([\s\S]*?'\/repair-visualization'/);
  assert.match(routeSource, /router\.get\('\/repair-visualization\/:scanId'/);
  assert.match(serverSource, /app\.use\('\/api\/ai', aiRoutes\)/);
  assert.doesNotMatch(mobileServiceSource, /MESHY_API_KEY|EXPO_PUBLIC_MESHY/);
  assert.doesNotMatch(repairServiceSource, /\/image-to-3d|generate-ar\(/i);
  assert.match(threeDServiceSource, /image-to-3d/);
});
