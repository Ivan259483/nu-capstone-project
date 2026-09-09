import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import sharp from 'sharp';
import {
  analyzeDamageSubtype,
  assessSubtypeLocalization,
  detectDamageWithRoboflow,
  getRoboflowDamageConfig,
  parseRoboflowWorkflowResponse,
  UNKNOWN_DAMAGE_SUBTYPE,
  UNKNOWN_VEHICLE_PANEL,
  ZERO_DETECTION_MESSAGE,
} from '../services/roboflowDamage.service.js';
import { buildDamageIssue, buildDamageReport } from '../models/damageReport.model.js';

const ROBOFLOW_ENV_KEYS = [
  'ROBOFLOW_API_KEY',
  'ROBOFLOW_API_URL',
  'ROBOFLOW_WORKSPACE',
  'ROBOFLOW_WORKFLOW_ID',
  'ROBOFLOW_WORKFLOW_ENDPOINT',
  'ROBOFLOW_IMAGE_INPUT',
  'ROBOFLOW_TIMEOUT_MS',
  'ROBOFLOW_MAX_RETRIES',
  'ROBOFLOW_MIN_CONFIDENCE',
  'ROBOFLOW_MAX_IMAGE_EDGE',
  'ROBOFLOW_SUBTYPE_ENABLED',
  'ROBOFLOW_SUBTYPE_API_URL',
  'ROBOFLOW_SUBTYPE_MODEL_ID',
  'ROBOFLOW_SUBTYPE_ENDPOINT',
  'ROBOFLOW_SUBTYPE_TIMEOUT_MS',
  'ROBOFLOW_SUBTYPE_MIN_CONFIDENCE',
  'ROBOFLOW_SUBTYPE_MIN_MARGIN',
];

const withRoboflowEnv = async (values, operation) => {
  const previous = Object.fromEntries(ROBOFLOW_ENV_KEYS.map((key) => [key, process.env[key]]));
  ROBOFLOW_ENV_KEYS.forEach((key) => delete process.env[key]);
  Object.entries(values).forEach(([key, value]) => {
    process.env[key] = String(value);
  });
  try {
    return await operation();
  } finally {
    ROBOFLOW_ENV_KEYS.forEach((key) => {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
};

const withAxiosPost = async (implementation, operation) => {
  const originalPost = axios.post;
  axios.post = implementation;
  try {
    return await operation();
  } finally {
    axios.post = originalPost;
  }
};

const createValidImage = () => sharp({
  create: {
    width: 80,
    height: 60,
    channels: 3,
    background: { r: 90, g: 100, b: 110 },
  },
}).jpeg().toBuffer();

const binaryWorkflowPayload = (predictions) => ({
  outputs: [{
    predictions: {
      image: { width: 80, height: 60 },
      predictions,
    },
  }],
});

const classifierPredictionsPayload = (predictions) => ({
  predictions: predictions.map(([className, confidence]) => ({
    class: className,
    confidence,
  })),
});

const credibleDamagePrediction = (overrides = {}) => ({
  detection_id: 'credible-damage',
  class: 'damage',
  confidence: 0.88,
  x: 40,
  y: 30,
  width: 30,
  height: 20,
  points: [{ x: 25, y: 20 }, { x: 55, y: 20 }, { x: 55, y: 40 }, { x: 25, y: 40 }],
  ...overrides,
});

test('uses the published RF-DETR binary Workflow defaults', async () => {
  await withRoboflowEnv({}, async () => {
    const config = getRoboflowDamageConfig();
    assert.equal(config.workspace, 'ivan-tadena');
    assert.equal(config.workflowId, 'autogloss-binary-damage-deployment-1787502823460');
    assert.equal(
      config.endpoint,
      'https://serverless.roboflow.com/infer/workflows/ivan-tadena/autogloss-binary-damage-deployment-1787502823460'
    );
    assert.equal(config.imageInputName, 'image');
    assert.equal(config.minConfidence, 0.36);
    assert.equal(config.subtype.modelId, 'damage-classifier-o1i5b/3');
    assert.equal(config.subtype.endpoint, 'https://serverless.roboflow.com/damage-classifier-o1i5b/3');
    assert.equal(config.subtype.minConfidence, 0.60);
    assert.equal(config.subtype.minMargin, 0.15);
  });
});

test('accepts car_scratch 0.7865 vs 0.0427 as Scratch / Scuff', () => {
  const result = analyzeDamageSubtype(classifierPredictionsPayload([
    ['scuffed_paint', 0.0427],
    ['car_scratch', 0.7865],
  ]));
  assert.equal(result.accepted, true);
  assert.equal(result.damageSubtype, 'Scratch / Scuff');
  assert.equal(result.rawClass, 'car_scratch');
  assert.equal(result.top1Confidence, 0.7865);
  assert.equal(result.top2Class, 'scuffed_paint');
  assert.equal(result.top2Confidence, 0.0427);
  assert.equal(result.margin, 0.7438);
});

test('accepts car_dent 0.6827 vs 0.1161 as Dent', () => {
  const result = analyzeDamageSubtype(classifierPredictionsPayload([
    ['car_dent', 0.6827],
    ['minor_car_damage', 0.1161],
  ]));
  assert.equal(result.accepted, true);
  assert.equal(result.damageSubtype, 'Dent');
  assert.equal(result.rawClass, 'car_dent');
  assert.equal(result.top2Class, 'minor_car_damage');
  assert.equal(result.margin, 0.5666);
});

test('abstains when car_scratch top confidence is 0.5155', () => {
  const result = analyzeDamageSubtype(classifierPredictionsPayload([
    ['car_scratch', 0.5155],
    ['deep_car_scratch', 0.2011],
  ]));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'top1_below_confidence');
  assert.equal(result.top1Confidence, 0.5155);
});

test('abstains when the classifier top-two margin is below 0.15', () => {
  const result = analyzeDamageSubtype(classifierPredictionsPayload([
    ['car_dent', 0.70],
    ['car_scratch', 0.60],
  ]));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'margin_below_threshold');
  assert.equal(result.margin, 0.1);
});

test('abstains for an unmapped classifier class such as video_1', () => {
  const result = analyzeDamageSubtype(classifierPredictionsPayload([
    ['video_1', 0.90],
    ['car_scratch', 0.05],
  ]));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'unmapped_classifier_label');
  assert.equal(result.rawClass, 'video_1');
});

test('abstains safely when the direct classifier returns only one prediction', () => {
  const result = analyzeDamageSubtype(classifierPredictionsPayload([
    ['car_dent', 0.91],
  ]));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'classifier_output_malformed');
});

test('abstains safely when the direct classifier returns no predictions', () => {
  const result = analyzeDamageSubtype({ predictions: [] });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'classifier_output_malformed');
});

test('rejects malformed direct classifier entries and requires two valid scores', () => {
  const result = analyzeDamageSubtype({
    predictions: [
      { class: 'car_dent', confidence: 0.91 },
      { class: 'car_scratch', confidence: 'not-a-score' },
    ],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'classifier_output_malformed');
});

test('rejects tiny and border-clipped regions from subtype classification', () => {
  const tiny = assessSubtypeLocalization({
    class: 'damage', confidence: 0.9, boundingBox: { x: 20, y: 20, width: 8, height: 8 },
    points: [{ x: 20, y: 20 }, { x: 28, y: 20 }, { x: 28, y: 28 }, { x: 20, y: 28 }],
  }, { width: 80, height: 60 });
  const border = assessSubtypeLocalization({
    class: 'damage', confidence: 0.9, boundingBox: { x: 0, y: 10, width: 30, height: 20 },
    points: [{ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 0, y: 30 }],
  }, { width: 80, height: 60 });
  assert.deepEqual(tiny, { credible: false, reason: 'tiny_localization' });
  assert.deepEqual(border, { credible: false, reason: 'border_clipped_localization' });
});

test('parses the published Workflow instance segmentation response and multiple predictions', () => {
  const payload = {
    outputs: [
      {
        output_image: { type: 'base64', value: 'omitted-in-production' },
        predictions: {
          image: { width: 1000, height: 500 },
          predictions: [
            {
              detection_id: 'prediction-1',
              class: 'damage',
              confidence: 0.88,
              x: 500,
              y: 250,
              width: 200,
              height: 100,
              points: [
                { x: 400, y: 200 },
                { x: 600, y: 200 },
                { x: 600, y: 300 },
                { x: 400, y: 300 },
              ],
            },
            {
              detection_id: 'prediction-2',
              class: 'damage',
              confidence: 0.64,
              x: 150,
              y: 100,
              width: 100,
              height: 80,
              points: [
                { x: 100, y: 60 },
                { x: 200, y: 60 },
                { x: 200, y: 140 },
                { x: 100, y: 140 },
              ],
            },
          ],
        },
      },
    ],
  };

  const predictions = parseRoboflowWorkflowResponse(payload);
  assert.equal(predictions.length, 2);
  assert.equal(predictions[0].class, 'damage');
  assert.deepEqual(predictions[0].boundingBox, { x: 400, y: 200, width: 200, height: 100 });
  assert.equal(predictions[0].imageWidth, 1000);
  assert.equal(predictions[0].points.length, 4);
  assert.equal(predictions[1].class, 'damage');
  assert.equal(predictions[1].confidence, 0.64);
});

test('builds normalized AutoGloss damage issue with mask, area, and report fields', () => {
  const issue = buildDamageIssue(
    {
      id: 'damage-1',
      class: 'damage',
      confidence: 0.88,
      boundingBox: { x: 400, y: 200, width: 200, height: 100 },
      points: [
        { x: 400, y: 200 },
        { x: 600, y: 200 },
        { x: 600, y: 300 },
        { x: 400, y: 300 },
      ],
    },
    {
      imageWidth: 1000,
      imageHeight: 500,
      imageIndex: 0,
      angleHint: 'front',
      damageAreaHint: 'Front Bumper',
    }
  );

  assert.equal(issue.type, 'Vehicle Damage');
  assert.equal(issue.damageClass, 'damage');
  assert.equal(issue.confidence, 0.88);
  assert.equal(issue.affectedArea, 'Front Bumper');
  assert.equal(issue.severityLabel, 'Moderate');
  assert.equal(issue.detectedArea.pixels, 20_000);
  assert.equal(issue.detectedArea.percentage, 4);
  assert.deepEqual(issue.coordinates, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 });
  assert.deepEqual(issue.segmentation.points[0], { x: 0.4, y: 0.4 });

  const report = buildDamageReport({ issues: [issue], requestId: 'request-1', model: 'workflow:model' });
  assert.equal(report.status, 'damage_detected');
  assert.equal(report.issueCount, 1);
  assert.equal(report.downstream.visualization3d[0].damageId, issue.id);
  assert.equal(report.downstream.costEstimation[0].detectedArea.percentage, 4);
});

test('handles empty Workflow predictions as a valid no-damage report', () => {
  assert.deepEqual(parseRoboflowWorkflowResponse({ outputs: [{ predictions: [] }] }), []);
  const report = buildDamageReport({ issues: [], requestId: 'request-empty' });
  assert.equal(report.status, 'no_damage_detected');
  assert.equal(report.issueCount, 0);
  assert.equal(report.highestSeverity, null);
  assert.deepEqual(report.downstream.ar, []);
});

test('normalizes only confidence-qualified binary damage predictions', async () => {
  const imageBuffer = await createValidImage();
  let request;

  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
    ROBOFLOW_SUBTYPE_ENABLED: 'false',
  }, async () => withAxiosPost(async (...args) => {
    request = args;
    return {
      data: binaryWorkflowPayload([
        {
          detection_id: 'obvious-damage',
          class: 'damage',
          confidence: 0.92,
          x: 40,
          y: 30,
          width: 30,
          height: 20,
          points: [{ x: 25, y: 20 }, { x: 55, y: 20 }, { x: 55, y: 40 }, { x: 25, y: 40 }],
        },
        {
          detection_id: 'second-damage',
          class: 'damage',
          confidence: 0.61,
          x: 15,
          y: 15,
          width: 10,
          height: 10,
          points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
        },
        {
          detection_id: 'wrong-class',
          class: 'scratch',
          confidence: 0.99,
          x: 10,
          y: 10,
          width: 8,
          height: 8,
          points: [{ x: 6, y: 6 }, { x: 14, y: 6 }, { x: 14, y: 14 }, { x: 6, y: 14 }],
        },
        {
          detection_id: 'below-threshold',
          class: 'damage',
          confidence: 0.35,
          x: 10,
          y: 10,
          width: 8,
          height: 8,
          points: [{ x: 6, y: 6 }, { x: 14, y: 6 }, { x: 14, y: 14 }, { x: 6, y: 14 }],
        },
      ]),
    };
  }, async () => {
    const result = await detectDamageWithRoboflow([{ buffer: imageBuffer }], {
      requestId: 'binary-test',
      angles: ['close_up'],
      damageAreas: ['Panel'],
    });

    assert.equal(result.noDamageDetected, false);
    assert.equal(result.damages.length, 2);
    assert.ok(result.damages.every((damage) => damage.damageClass === 'damage'));
    assert.match(result.summary, /2 damage regions detected by RF-DETR/);
    assert.ok(result.damages.every((damage) => damage.segmentation.points.length === 4));
  }));

  assert.equal(
    request[0],
    'https://serverless.roboflow.com/infer/workflows/ivan-tadena/autogloss-binary-damage-deployment-1787502823460'
  );
  assert.equal(request[1].api_key, undefined);
  assert.deepEqual(request[1].excluded_fields, ['output_image']);
  assert.deepEqual(Object.keys(request[1].inputs), ['image']);
  assert.match(request[1].inputs.image.value, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(request[2].headers.Authorization, 'Bearer server-only-test-key');
});

test('adds an accepted subtype without replacing RF-DETR confidence or fabricating a component', async () => {
  const imageBuffer = await createValidImage();
  const requests = [];
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
  }, async () => withAxiosPost(async (...args) => {
    requests.push(args);
    if (String(args[0]).includes('/infer/workflows/')) {
      return { data: binaryWorkflowPayload([credibleDamagePrediction({ confidence: 0.91 })]) };
    }
    return { data: classifierPredictionsPayload([
      ['car_scratch', 0.7865],
      ['scuffed_paint', 0.0427],
    ]) };
  }, async () => {
    const result = await detectDamageWithRoboflow([{ buffer: imageBuffer }]);
    const [damage] = result.damages;
    assert.equal(damage.type, 'Vehicle Damage');
    assert.equal(damage.damageClass, 'damage');
    assert.equal(damage.damageSubtype, 'Scratch / Scuff');
    assert.equal(damage.component, UNKNOWN_VEHICLE_PANEL);
    assert.equal(damage.affectedArea, UNKNOWN_VEHICLE_PANEL);
    assert.equal(damage.confidence, 0.91);
    assert.equal(damage.subtypeAnalysis.top1Confidence, 0.7865);
    assert.equal(damage.subtypeAnalysis.accepted, true);
    assert.equal(damage.affectedAreaPercent, damage.detectedArea.percentage);
  }));

  assert.equal(requests.length, 2);
  assert.equal(requests[1][0], 'https://serverless.roboflow.com/damage-classifier-o1i5b/3');
  assert.equal(requests[1][2].params.api_key, 'server-only-test-key');
  assert.equal(requests[1][2].params.confidence, 0);
  assert.match(requests[1][1], /^[A-Za-z0-9+/]+=*$/);
});

test('does not fabricate or request a subtype when RF-DETR returns no localization', async () => {
  const imageBuffer = await createValidImage();
  let requests = 0;
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
  }, async () => withAxiosPost(async () => {
    requests += 1;
    return { data: binaryWorkflowPayload([]) };
  }, async () => {
    const result = await detectDamageWithRoboflow([{ buffer: imageBuffer }]);
    assert.deepEqual(result.damages, []);
  }));
  assert.equal(requests, 1);
});

test('degrades a subtype classifier failure to Unknown Damage while preserving localization', async () => {
  const imageBuffer = await createValidImage();
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
  }, async () => withAxiosPost(async (url) => {
    if (String(url).includes('/infer/workflows/')) {
      return { data: binaryWorkflowPayload([credibleDamagePrediction()]) };
    }
    throw new Error('optional classifier unavailable');
  }, async () => {
    const result = await detectDamageWithRoboflow([{ buffer: imageBuffer }]);
    assert.equal(result.noDamageDetected, false);
    assert.equal(result.damages.length, 1);
    assert.equal(result.damages[0].damageSubtype, UNKNOWN_DAMAGE_SUBTYPE);
    assert.equal(result.damages[0].component, UNKNOWN_VEHICLE_PANEL);
    assert.equal(result.damages[0].subtypeAnalysis.reason, 'classifier_request_failed');
  }));
});

test('returns the cautious message for a valid zero-prediction response', async () => {
  const imageBuffer = await createValidImage();
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
  }, async () => withAxiosPost(
    async () => ({ data: binaryWorkflowPayload([]) }),
    async () => {
      const result = await detectDamageWithRoboflow([{ buffer: imageBuffer }]);
      assert.equal(result.noDamageDetected, true);
      assert.equal(result.summary, ZERO_DETECTION_MESSAGE);
      assert.deepEqual(result.damages, []);
    }
  ));
});

test('rejects a malformed image before calling Roboflow', async () => {
  let requested = false;
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
  }, async () => withAxiosPost(async () => {
    requested = true;
    return { data: binaryWorkflowPayload([]) };
  }, async () => {
    await assert.rejects(
      detectDamageWithRoboflow([{ buffer: Buffer.from('not-an-image') }]),
      (error) => error.code === 'INVALID_IMAGE' && error.status === 400
    );
  }));
  assert.equal(requested, false);
});

test('maps a Roboflow API failure to the stable upstream error', async () => {
  const imageBuffer = await createValidImage();
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '0',
  }, async () => withAxiosPost(async () => {
    const error = new Error('upstream unavailable');
    error.response = { status: 500 };
    throw error;
  }, async () => {
    await assert.rejects(
      detectDamageWithRoboflow([{ buffer: imageBuffer }]),
      (error) => error.code === 'ROBOFLOW_REQUEST_FAILED' && error.status === 502
    );
  }));
});

test('maps a Roboflow timeout to the stable timeout error', async () => {
  const imageBuffer = await createValidImage();
  let attempts = 0;
  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'server-only-test-key',
    ROBOFLOW_MAX_RETRIES: '1',
  }, async () => withAxiosPost(async () => {
    attempts += 1;
    const error = new Error('timeout');
    error.code = 'ECONNABORTED';
    throw error;
  }, async () => {
    await assert.rejects(
      detectDamageWithRoboflow([{ buffer: imageBuffer }]),
      (error) => error.code === 'ROBOFLOW_TIMEOUT' && error.status === 504
    );
  }));
  assert.equal(attempts, 2);
});

test('keeps Roboflow credentials and subtype endpoint out of mobile source and production export', () => {
  const backendTestsDir = path.dirname(fileURLToPath(import.meta.url));
  const mobileRoot = path.resolve(backendTestsDir, '../../mobile');
  const excludedDirectories = new Set(['node_modules', '.expo', '.git']);
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else files.push(entryPath);
    }
  };
  visit(mobileRoot);
  const forbidden = ['ROBOFLOW_API_KEY', 'damage-classifier-o1i5b/3', 'classify.roboflow.com'];
  for (const file of files) {
    const contents = fs.readFileSync(file);
    if (contents.includes(0)) continue;
    const text = contents.toString('utf8');
    forbidden.forEach((value) => assert.equal(text.includes(value), false, `${value} leaked into ${file}`));
  }
});
