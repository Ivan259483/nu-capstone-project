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
    'MESHY_REPAIR_AI_MODEL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_UPLOAD_PRESET',
  ];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    MESHY_API_KEY: 'server-test-key',
    MESHY_API_BASE_URL: 'https://api.meshy.ai/openapi/v1',
    MESHY_REPAIR_AI_MODEL: 'nano-banana',
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_UPLOAD_PRESET: 'test-preset',
  });
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
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
      post: async (url, payload, config) => {
        captured = { url, payload, config };
        return { data: { result: 'repair-task-123' } };
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
    assert.equal(captured.payload.remove_background, false);
    assert.equal(captured.payload.generate_multi_view, false);
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
      /public HTTPS JPG\/PNG reference image is required/
    );
    assert.equal(requestCount, 0);
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
  assert.match(controllerSource, /findOneAndUpdate\([\s\S]*?repairVisualization: \{ \$exists: false \}/);
  assert.match(controllerSource, /A concurrent tap\/request won the atomic claim/);
  assert.doesNotMatch(mobileServiceSource, /MESHY_API_KEY|EXPO_PUBLIC_MESHY/);
});
