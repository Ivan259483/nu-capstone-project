/**
 * Multi-view guided vehicle inspection.
 *
 * The harness mirrors tests/roboflowDamage.service.test.js on purpose: these
 * helpers are duplicated rather than extracted so the existing single-scan
 * suite carries zero risk from this feature.
 */
// The controller pulls in the encrypted-model chain, which requires a key.
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import sharp from 'sharp';
import {
  CROSS_VIEW_DEDUPLICATION_POLICY,
  detectDamageAcrossViews,
  detectDamageWithRoboflow,
  MULTI_VIEW_MAX_CONCURRENCY,
  MULTI_VIEW_PARTIAL_FAILURE_MESSAGE,
  MULTI_VIEW_ZERO_DETECTION_MESSAGE,
  UNKNOWN_DAMAGE_SUBTYPE,
  UNKNOWN_VEHICLE_PANEL,
  VIEW_ANALYSIS_FAILED_MESSAGE,
  getRoboflowDamageConfig,
} from '../services/roboflowDamage.service.js';
import { buildEstimateFromDamages } from '../services/estimator.service.js';
import { GUIDED_VIEW_IDS, getGuidedViewLabel, isGuidedViewId } from '../constants/guidedViews.js';

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
  Object.entries(values).forEach(([key, value]) => { process.env[key] = String(value); });
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
  create: { width: 80, height: 60, channels: 3, background: { r: 90, g: 100, b: 110 } },
}).jpeg().toBuffer();

const binaryWorkflowPayload = (predictions) => ({
  outputs: [{ predictions: { image: { width: 80, height: 60 }, predictions } }],
});

const classifierPredictionsPayload = (predictions) => ({
  predictions: predictions.map(([className, confidence]) => ({ class: className, confidence })),
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

const BASE_ENV = {
  ROBOFLOW_API_KEY: 'test-key',
  ROBOFLOW_SUBTYPE_ENABLED: 'false',
};

const buildViews = async (viewIds) => {
  const buffer = await createValidImage();
  return viewIds.map((viewId, index) => ({
    file: { buffer, mimetype: 'image/jpeg', originalname: `${viewId}.jpg` },
    viewId,
    label: getGuidedViewLabel(viewId),
    index,
  }));
};

const isWorkflowCall = (url) => String(url).includes('/infer/workflows/');

/* ── Guided view identifiers ───────────────────────────────────────────────── */

test('guided view ids reuse the existing capture angles', () => {
  assert.deepEqual([...GUIDED_VIEW_IDS], ['front', 'rear', 'left', 'right', 'close_up']);
  assert.equal(isGuidedViewId('front'), true);
  assert.equal(isGuidedViewId('driver_side'), false);
  assert.equal(getGuidedViewLabel('close_up'), 'Close-up');
});

/* ── Happy path ────────────────────────────────────────────────────────────── */

test('five valid guided views are all analyzed independently', async () => {
  const views = await buildViews(GUIDED_VIEW_IDS);
  let workflowCalls = 0;

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async (url) => {
      assert.equal(isWorkflowCall(url), true);
      workflowCalls += 1;
      return { data: binaryWorkflowPayload([credibleDamagePrediction({
        detection_id: `damage-${workflowCalls}`,
      })]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-1' })
  ));

  // One inference request per view. Nothing is stitched into a single input.
  assert.equal(workflowCalls, 5);
  assert.equal(result.views.length, 5);
  assert.equal(result.views.every((view) => view.success), true);
  assert.deepEqual(
    result.views.map((view) => view.viewId),
    ['front', 'rear', 'left', 'right', 'close_up']
  );
  assert.equal(result.inspectionSummary.requestedViews, 5);
  assert.equal(result.inspectionSummary.analyzedViews, 5);
  assert.equal(result.inspectionSummary.successfulViews, 5);
  assert.equal(result.inspectionSummary.failedViews, 0);
  assert.equal(result.inspectionSummary.viewsWithDamage, 5);
  assert.equal(result.inspectionSummary.totalDetectedRegions, 5);
});

test('every damage keeps its source view and an imageIndex matching that view', async () => {
  const views = await buildViews(['front', 'left', 'close_up']);
  let call = 0;

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => {
      call += 1;
      return { data: binaryWorkflowPayload([credibleDamagePrediction({ detection_id: `d-${call}` })]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-source-view' })
  ));

  assert.equal(result.damages.length, 3);
  result.damages.forEach((damage) => {
    assert.ok(damage.sourceView, 'damage is missing sourceView');
    assert.equal(isGuidedViewId(damage.sourceView.id), true);
    assert.equal(damage.sourceView.label, getGuidedViewLabel(damage.sourceView.id));
    assert.equal(damage.imageIndex, damage.sourceView.index);
    // Additive only: existing fields survive.
    assert.equal(typeof damage.confidence, 'number');
    assert.equal(typeof damage.affectedAreaPercent, 'number');
    assert.equal(damage.component, UNKNOWN_VEHICLE_PANEL);
  });

  assert.deepEqual(
    result.damages.map((damage) => damage.sourceView.id),
    ['front', 'left', 'close_up']
  );
  assert.deepEqual(result.damages.map((damage) => damage.imageIndex), [0, 1, 2]);
});

test('a guided view name never becomes the vehicle component', async () => {
  const views = await buildViews(['front']);

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => ({ data: binaryWorkflowPayload([credibleDamagePrediction()]) }),
    () => detectDamageAcrossViews(views, { requestId: 'inspection-component' })
  ));

  assert.equal(result.damages[0].component, UNKNOWN_VEHICLE_PANEL);
  assert.equal(result.damages[0].affectedArea, UNKNOWN_VEHICLE_PANEL);
  assert.equal(result.damages[0].sourceView.label, 'Front');
});

/* ── Bounded concurrency ───────────────────────────────────────────────────── */

test('never runs more than two guided views concurrently', async () => {
  const views = await buildViews(GUIDED_VIEW_IDS);
  let inFlight = 0;
  let peak = 0;

  await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return { data: binaryWorkflowPayload([credibleDamagePrediction()]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-concurrency' })
  ));

  assert.equal(MULTI_VIEW_MAX_CONCURRENCY, 2);
  assert.equal(peak, 2, `expected at most 2 concurrent view analyses, saw ${peak}`);
});

test('subtype classifier calls within a view are also bounded', async () => {
  const views = await buildViews(['front']);
  const predictions = [1, 2, 3, 4, 5].map((n) => credibleDamagePrediction({
    detection_id: `region-${n}`,
  }));
  let classifierInFlight = 0;
  let classifierPeak = 0;

  await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'test-key',
    ROBOFLOW_SUBTYPE_ENABLED: 'true',
    ROBOFLOW_SUBTYPE_MODEL_ID: 'damage-classifier-o1i5b/3',
  }, () => withAxiosPost(
    async (url) => {
      if (isWorkflowCall(url)) return { data: binaryWorkflowPayload(predictions) };
      classifierInFlight += 1;
      classifierPeak = Math.max(classifierPeak, classifierInFlight);
      await new Promise((resolve) => setTimeout(resolve, 8));
      classifierInFlight -= 1;
      return { data: classifierPredictionsPayload([['car_scratch', 0.9], ['car_dent', 0.02]]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-region-concurrency' })
  ));

  assert.ok(classifierPeak > 0, 'expected the subtype classifier to be called');
  assert.ok(
    classifierPeak <= MULTI_VIEW_MAX_CONCURRENCY,
    `expected at most ${MULTI_VIEW_MAX_CONCURRENCY} concurrent classifier calls, saw ${classifierPeak}`
  );
});

/* ── Partial failure ───────────────────────────────────────────────────────── */

test('one failed view leaves the other four usable', async () => {
  const views = await buildViews(GUIDED_VIEW_IDS);
  let call = 0;

  const result = await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      call += 1;
      // The fourth view attempted upstream fails; every other view succeeds.
      if (call === 4) {
        const error = new Error('upstream exploded');
        error.response = { status: 500 };
        throw error;
      }
      return { data: binaryWorkflowPayload([credibleDamagePrediction({ detection_id: `d-${call}` })]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-partial' })
  ));

  const failed = result.views.filter((view) => !view.success);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].message, VIEW_ANALYSIS_FAILED_MESSAGE);
  assert.equal(failed[0].damages.length, 0);
  assert.equal(result.inspectionSummary.successfulViews, 4);
  assert.equal(result.inspectionSummary.failedViews, 1);
  assert.equal(result.inspectionSummary.totalDetectedRegions, 4);
  assert.equal(result.damages.length, 4);
  assert.match(result.summary, /Some views could not be analyzed/);
});

test('a failed view is never reported as clean', async () => {
  const views = await buildViews(['front', 'rear']);
  let call = 0;

  const result = await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      call += 1;
      if (call === 2) {
        const error = new Error('upstream exploded');
        error.response = { status: 502 };
        throw error;
      }
      return { data: binaryWorkflowPayload([]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-not-clean' })
  ));

  const failed = result.views.find((view) => !view.success);
  assert.equal(failed.noDamageDetected, false, 'a failed view must not be flagged as damage-free');
  assert.equal(result.inspectionSummary.analyzedViews, 1);
  assert.equal(result.inspectionSummary.viewsWithDamage, 0);
  assert.match(result.summary, new RegExp(MULTI_VIEW_PARTIAL_FAILURE_MESSAGE));
});

test('a failed view surfaces a stable code but no upstream provider detail', async () => {
  const views = await buildViews(['front', 'rear']);
  let call = 0;

  const result = await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      call += 1;
      if (call === 2) {
        const error = new Error('secret upstream trace with credentials');
        error.code = 'ECONNABORTED';
        throw error;
      }
      return { data: binaryWorkflowPayload([credibleDamagePrediction()]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-safe-error' })
  ));

  const failed = result.views.find((view) => !view.success);
  assert.equal(failed.errorCode, 'ROBOFLOW_TIMEOUT');
  assert.equal(failed.message, VIEW_ANALYSIS_FAILED_MESSAGE);
  assert.equal(JSON.stringify(result).includes('secret upstream trace'), false);
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('every view failing throws the stable upstream error instead of a false success', async () => {
  const views = await buildViews(['front', 'rear']);

  await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      const error = new Error('upstream exploded');
      error.response = { status: 503 };
      throw error;
    },
    async () => {
      await assert.rejects(
        () => detectDamageAcrossViews(views, { requestId: 'inspection-all-failed' }),
        (error) => {
          assert.equal(error.name, 'RoboflowDamageError');
          assert.equal(error.code, 'ROBOFLOW_REQUEST_FAILED');
          assert.equal(error.status, 502);
          return true;
        }
      );
    }
  ));
});

/* ── Zero detection ────────────────────────────────────────────────────────── */

test('a single view with zero detections is represented without inventing damage', async () => {
  const views = await buildViews(['front', 'rear']);
  let call = 0;

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => {
      call += 1;
      return { data: binaryWorkflowPayload(call === 1 ? [] : [credibleDamagePrediction()]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-one-clean' })
  ));

  const front = result.views.find((view) => view.viewId === 'front');
  const rear = result.views.find((view) => view.viewId === 'rear');
  assert.equal(front.success, true);
  assert.equal(front.noDamageDetected, true);
  assert.equal(front.damages.length, 0);
  assert.equal(rear.noDamageDetected, false);
  assert.equal(result.inspectionSummary.viewsWithDamage, 1);
  assert.equal(result.inspectionSummary.totalDetectedRegions, 1);
  assert.equal(result.noDamageDetected, false);
});

test('all views clean produces the cautious aggregate message', async () => {
  const views = await buildViews(GUIDED_VIEW_IDS);

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => ({ data: binaryWorkflowPayload([]) }),
    () => detectDamageAcrossViews(views, { requestId: 'inspection-all-clean' })
  ));

  assert.equal(result.noDamageDetected, true);
  assert.equal(result.summary, MULTI_VIEW_ZERO_DETECTION_MESSAGE);
  assert.match(result.summary, /No confident damage was detected across the analyzed vehicle views/);
  // Never an all-clear claim about the vehicle itself.
  assert.equal(/the vehicle has no damage/i.test(result.summary), false);
  assert.equal(result.inspectionSummary.totalDetectedRegions, 0);
  assert.equal(result.inspectionSummary.viewsWithDamage, 0);
});

test('zero detections plus a failed view still warns that some views were not analyzed', async () => {
  const views = await buildViews(['front', 'rear', 'left']);
  let call = 0;

  const result = await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      call += 1;
      if (call === 3) {
        const error = new Error('upstream exploded');
        error.response = { status: 500 };
        throw error;
      }
      return { data: binaryWorkflowPayload([]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-clean-partial' })
  ));

  assert.match(result.summary, new RegExp(MULTI_VIEW_ZERO_DETECTION_MESSAGE));
  assert.match(result.summary, new RegExp(MULTI_VIEW_PARTIAL_FAILURE_MESSAGE));
  assert.equal(result.inspectionSummary.failedViews, 1);
});

/* ── Subtype rules are unchanged on the batch path ─────────────────────────── */

test('approved subtype mappings still apply per view', async () => {
  const views = await buildViews(['front']);

  const result = await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'test-key',
    ROBOFLOW_SUBTYPE_ENABLED: 'true',
    ROBOFLOW_SUBTYPE_MODEL_ID: 'damage-classifier-o1i5b/3',
  }, () => withAxiosPost(
    async (url) => (isWorkflowCall(url)
      ? { data: binaryWorkflowPayload([credibleDamagePrediction()]) }
      : { data: classifierPredictionsPayload([['car_scratch', 0.7865], ['car_dent', 0.0427]]) }),
    () => detectDamageAcrossViews(views, { requestId: 'inspection-subtype' })
  ));

  const damage = result.damages[0];
  assert.equal(damage.damageSubtype, 'Scratch / Scuff');
  assert.equal(damage.subtypeAnalysis.accepted, true);
  assert.equal(damage.subtypeAnalysis.rawClass, 'car_scratch');
  assert.equal(damage.component, UNKNOWN_VEHICLE_PANEL);
});

test('chipped_paint still abstains as Unknown Damage on the batch path', async () => {
  const views = await buildViews(['front']);

  const result = await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'test-key',
    ROBOFLOW_SUBTYPE_ENABLED: 'true',
    ROBOFLOW_SUBTYPE_MODEL_ID: 'damage-classifier-o1i5b/3',
  }, () => withAxiosPost(
    async (url) => (isWorkflowCall(url)
      ? { data: binaryWorkflowPayload([credibleDamagePrediction()]) }
      : { data: classifierPredictionsPayload([['chipped_paint', 0.9], ['car_scratch', 0.02]]) }),
    () => detectDamageAcrossViews(views, { requestId: 'inspection-chipped-paint' })
  ));

  const damage = result.damages[0];
  assert.equal(damage.damageSubtype, UNKNOWN_DAMAGE_SUBTYPE);
  assert.equal(damage.subtypeAnalysis.accepted, false);
  assert.equal(damage.subtypeAnalysis.reason, 'unmapped_classifier_label');
  assert.equal(damage.subtypeAnalysis.rawClass, 'chipped_paint');
});

test('subtype acceptance gates remain 0.60 and 0.15', () => {
  const config = getRoboflowDamageConfig();
  assert.equal(config.subtype.minConfidence, 0.60);
  assert.equal(config.subtype.minMargin, 0.15);
});

/* ── Detection threshold ───────────────────────────────────────────────────── */

test('the batch path still gates RF-DETR predictions at 0.36', async () => {
  const views = await buildViews(['front']);
  const config = await withRoboflowEnv(BASE_ENV, async () => getRoboflowDamageConfig());
  assert.equal(config.minConfidence, 0.36);

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => ({
      data: binaryWorkflowPayload([
        credibleDamagePrediction({ detection_id: 'below', confidence: 0.3599 }),
        credibleDamagePrediction({ detection_id: 'at-threshold', confidence: 0.36 }),
        credibleDamagePrediction({ detection_id: 'not-damage', class: 'scratch', confidence: 0.99 }),
      ]),
    }),
    () => detectDamageAcrossViews(views, { requestId: 'inspection-threshold' })
  ));

  assert.equal(result.damages.length, 1);
  assert.equal(result.damages[0].id, 'at-threshold');
});

/* ── Cross-view duplicates ─────────────────────────────────────────────────── */

test('the same damage seen in two views counts as two regions, never as unique', async () => {
  const views = await buildViews(['front', 'left']);
  let call = 0;

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => {
      call += 1;
      // The identical physical scratch, photographed from two angles.
      return { data: binaryWorkflowPayload([credibleDamagePrediction({
        detection_id: `same-scratch-${call}`,
      })]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-duplicate' })
  ));

  assert.equal(result.inspectionSummary.totalDetectedRegions, 2);
  assert.equal(result.damages.length, 2);
  assert.equal(result.crossViewDeduplication.applied, false);
  assert.equal(result.crossViewDeduplication.policy, 'not_supported');

  // No unique-damage claim and no invented duplicate flag anywhere. The policy
  // note may say the count is NOT unique; a positive claim must never appear.
  const serialized = JSON.stringify(result);
  assert.equal(
    /unique (vehicle )?damages?\b/i.test(serialized.replace(/not claimed to be unique/gi, '')),
    false,
    'payload must not claim uniqueness'
  );
  assert.equal(/uniqueDamages|possibleDuplicate/.test(serialized), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.inspectionSummary, 'uniqueDamages'), false);
});

test('totalDetectedRegions counts regions, not views and not unique damages', async () => {
  const views = await buildViews(['front', 'rear']);
  let call = 0;

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => {
      call += 1;
      const count = call === 1 ? 3 : 1;
      return {
        data: binaryWorkflowPayload(
          Array.from({ length: count }, (_, n) => credibleDamagePrediction({
            detection_id: `call-${call}-region-${n}`,
          }))
        ),
      };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-region-count' })
  ));

  assert.equal(result.inspectionSummary.totalDetectedRegions, 4);
  assert.equal(result.inspectionSummary.viewsWithDamage, 2);
  assert.equal(result.inspectionSummary.analyzedViews, 2);
  assert.equal(CROSS_VIEW_DEDUPLICATION_POLICY.applied, false);
});

/* ── Downstream usability ──────────────────────────────────────────────────── */

test('partial results still yield a usable estimate and downstream integration payloads', async () => {
  const views = await buildViews(['front', 'rear', 'left']);
  let call = 0;

  const result = await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      call += 1;
      if (call === 2) {
        const error = new Error('upstream exploded');
        error.response = { status: 500 };
        throw error;
      }
      return { data: binaryWorkflowPayload([credibleDamagePrediction({ detection_id: `d-${call}` })]) };
    },
    () => detectDamageAcrossViews(views, { requestId: 'inspection-downstream' })
  ));

  const estimate = buildEstimateFromDamages(result.damages);
  assert.equal(estimate.lineItems.length, 2);
  assert.ok(estimate.subtotalMax > 0);

  const downstream = result.damageReport.downstream;
  assert.equal(downstream.recommendation.length, 2);
  assert.equal(downstream.costEstimation.length, 2);
  assert.equal(downstream.visualization3d.length, 2);
  assert.equal(downstream.ar.length, 2);
  assert.equal(result.imageProcessing.length, 2);
});

/* ── The single-image endpoint is unchanged ────────────────────────────────── */

test('detectDamageWithRoboflow keeps its existing single-image contract', async () => {
  const buffer = await createValidImage();
  const files = [{ buffer, mimetype: 'image/jpeg', originalname: 'vehicle.jpg' }];

  const result = await withRoboflowEnv(BASE_ENV, () => withAxiosPost(
    async () => ({ data: binaryWorkflowPayload([credibleDamagePrediction()]) }),
    () => detectDamageWithRoboflow(files, { requestId: 'single-scan', angles: ['close_up'] })
  ));

  assert.equal(result.source, 'roboflow');
  assert.equal(result.damages.length, 1);
  assert.equal(result.damages[0].angleHint, 'close_up');
  assert.match(result.summary, /damage region/);
  // Multi-view keys must not leak into the single-scan payload.
  assert.equal(result.views, undefined);
  assert.equal(result.inspectionSummary, undefined);
  assert.equal(result.crossViewDeduplication, undefined);
  assert.equal(result.damages[0].sourceView, undefined);
});

test('the single-image path still fails the whole scan on an upstream error', async () => {
  const buffer = await createValidImage();
  const files = [{ buffer, mimetype: 'image/jpeg', originalname: 'vehicle.jpg' }];

  await withRoboflowEnv({ ...BASE_ENV, ROBOFLOW_MAX_RETRIES: '0' }, () => withAxiosPost(
    async () => {
      const error = new Error('upstream exploded');
      error.response = { status: 500 };
      throw error;
    },
    async () => {
      await assert.rejects(
        () => detectDamageWithRoboflow(files, { requestId: 'single-scan-error' }),
        (error) => error.code === 'ROBOFLOW_REQUEST_FAILED'
      );
    }
  ));
});

/* ── Request validation on POST /api/ai/scan/batch ─────────────────────────── */

const invokeBatch = async (body, files) => {
  const { detectVehicleDamageBatch } = await import('../controllers/damageDetection.controller.js');
  let statusCode = 200;
  let payload = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    getHeader() { return undefined; },
    setHeader() { return this; },
    headersSent: false,
    on() { return this; },
  };
  await detectVehicleDamageBatch({ body, files, get: () => undefined }, res);
  return { statusCode, payload };
};

const fakeFiles = (count) => Array.from({ length: count }, (_, index) => ({
  buffer: Buffer.from('not-really-decoded-in-validation'),
  mimetype: 'image/jpeg',
  originalname: `view-${index}.jpg`,
}));

test('duplicate view ids are rejected before any Roboflow request', async () => {
  let roboflowCalls = 0;
  const { statusCode, payload } = await withAxiosPost(
    async () => { roboflowCalls += 1; return { data: {} }; },
    () => invokeBatch({ viewIds: JSON.stringify(['front', 'front']) }, fakeFiles(2))
  );

  assert.equal(statusCode, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'DUPLICATE_VIEW_ID');
  assert.match(payload.message, /Front/);
  assert.equal(roboflowCalls, 0);
});

test('an unknown view id is rejected', async () => {
  const { statusCode, payload } = await invokeBatch(
    { viewIds: JSON.stringify(['front', 'driver_side']) },
    fakeFiles(2)
  );

  assert.equal(statusCode, 400);
  assert.equal(payload.code, 'UNKNOWN_VIEW_ID');
  assert.match(payload.message, /driver_side/);
});

test('a view id count that does not match the image count is rejected', async () => {
  const { statusCode, payload } = await invokeBatch(
    { viewIds: JSON.stringify(['front']) },
    fakeFiles(3)
  );

  assert.equal(statusCode, 400);
  assert.equal(payload.code, 'VIEW_COUNT_MISMATCH');
});

test('missing view ids are rejected', async () => {
  const { statusCode, payload } = await invokeBatch({}, fakeFiles(2));
  assert.equal(statusCode, 400);
  assert.equal(payload.code, 'VIEW_IDS_REQUIRED');
});

test('an empty upload is rejected', async () => {
  const { statusCode, payload } = await invokeBatch({ viewIds: JSON.stringify([]) }, []);
  assert.equal(statusCode, 400);
  assert.equal(payload.code, 'IMAGE_REQUIRED');
});

test('the upload boundary still rejects unsupported MIME types and caps the image count', async () => {
  const source = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../middleware/damageImageUpload.middleware.js', import.meta.url),
    'utf8'
  ));

  assert.match(source, /const MAX_IMAGE_COUNT = 5;/);
  assert.match(source, /const MAX_IMAGE_BYTES = 10 \* 1024 \* 1024;/);
  assert.match(source, /'image\/jpeg',\n\s+'image\/png',\n\s+'image\/webp'/);
  assert.match(source, /UNSUPPORTED_IMAGE_TYPE/);

  // The batch route reuses this exact boundary rather than defining its own.
  const routes = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../routes/ai.routes.js', import.meta.url),
    'utf8'
  ));
  assert.match(routes, /'\/scan\/batch',\n\s+optionalAuthenticate,\n\s+damageDetectionLimiter,\n\s+handleDamageImageUpload,\n\s+detectVehicleDamageBatch/);
});

test('the batch route is additive and POST /api/ai/scan is untouched', async () => {
  const routes = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../routes/ai.routes.js', import.meta.url),
    'utf8'
  ));

  assert.match(routes, /'\/scan',\n\s+optionalAuthenticate,\n\s+damageDetectionLimiter,\n\s+handleDamageImageUpload,\n\s+detectVehicleDamage\n/);
  assert.match(routes, /'\/scan\/batch'/);
  assert.match(routes, /router\.get\('\/scan\/:id'/);
});

test('the Roboflow API key never appears in a batch response payload', async () => {
  const views = await buildViews(['front', 'rear']);

  const result = await withRoboflowEnv({
    ROBOFLOW_API_KEY: 'super-secret-key-value',
    ROBOFLOW_SUBTYPE_ENABLED: 'false',
  }, () => withAxiosPost(
    async () => ({ data: binaryWorkflowPayload([credibleDamagePrediction()]) }),
    () => detectDamageAcrossViews(views, { requestId: 'inspection-secrets' })
  ));

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('super-secret-key-value'), false);
  assert.equal(/api_key|apiKey|Authorization/i.test(serialized), false);
});
