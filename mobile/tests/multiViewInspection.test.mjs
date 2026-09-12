import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getDamagesForView,
  getMultiViewSummaryCopy,
  groupDamagesByView,
  MULTI_VIEW_PARTIAL_FAILURE_MESSAGE,
  MULTI_VIEW_ZERO_DETECTION_MESSAGE,
  normalizeMultiViewInspection,
  VIEW_ANALYSIS_FAILED_MESSAGE,
  VIEW_ZERO_DETECTION_MESSAGE,
} from '../src/features/ai-scan/multiViewInspection.ts';

const analyzingSource = readFileSync(
  new URL('../src/app/(customer)/scan/analyzing.tsx', import.meta.url),
  'utf8'
);
const resultsSource = readFileSync(
  new URL('../src/app/(customer)/scan/results.tsx', import.meta.url),
  'utf8'
);
const captureSource = readFileSync(
  new URL('../src/app/(customer)/scan/index.tsx', import.meta.url),
  'utf8'
);

const damage = (id, viewId, index) => ({
  id,
  damageSubtype: 'Scratch / Scuff',
  component: 'Unknown Vehicle Panel',
  severity: 'medium',
  confidence: 0.8,
  imageIndex: index,
  sourceView: { id: viewId, label: viewId, index },
});

const view = (viewId, index, overrides = {}) => ({
  viewId,
  label: viewId,
  index,
  success: true,
  errorCode: '',
  message: '',
  noDamageDetected: true,
  damages: [],
  ...overrides,
});

test('a single-image scan produces no inspection view', () => {
  assert.equal(normalizeMultiViewInspection(null), null);
  assert.equal(normalizeMultiViewInspection({}), null);
  assert.equal(normalizeMultiViewInspection({ views: [] }), null);
});

test('five successful views are summarized as regions across views', () => {
  const inspection = normalizeMultiViewInspection({
    inspectionId: 'inspection-1',
    views: [
      view('front', 0, { damages: [damage('d1', 'front', 0)], noDamageDetected: false }),
      view('rear', 1),
      view('left', 2, { damages: [damage('d2', 'left', 2), damage('d3', 'left', 2)], noDamageDetected: false }),
      view('right', 3),
      view('close_up', 4, { damages: [damage('d4', 'close_up', 4)], noDamageDetected: false }),
    ],
  });

  assert.equal(inspection.summary.requestedViews, 5);
  assert.equal(inspection.summary.analyzedViews, 5);
  assert.equal(inspection.summary.failedViews, 0);
  assert.equal(inspection.summary.viewsWithDamage, 3);
  assert.equal(inspection.summary.totalDetectedRegions, 4);
});

test('the summary copy says detected regions, never unique damages', () => {
  const inspection = normalizeMultiViewInspection({
    views: [
      view('front', 0, { damages: [damage('d1', 'front', 0)], noDamageDetected: false }),
      view('left', 1, { damages: [damage('d2', 'left', 1)], noDamageDetected: false }),
    ],
  });
  const copy = getMultiViewSummaryCopy(inspection);

  assert.equal(copy.title, 'Vehicle Inspection Complete');
  assert.equal(copy.viewsLine, '2 views analyzed');
  assert.equal(copy.damageViewsLine, '2 views with confidence-qualified damage');
  assert.equal(copy.regionsLine, '2 detected damage regions');
  assert.match(copy.message, /detected damage regions across 2 analyzed views/);
  assert.equal(/unique/i.test(JSON.stringify(copy)), false);
  assert.equal(copy.partialFailureNote, null);
});

test('the same damage in two views is reported twice and never called unique', () => {
  const inspection = normalizeMultiViewInspection({
    views: [
      view('front', 0, { damages: [damage('scratch-a', 'front', 0)], noDamageDetected: false }),
      view('left', 1, { damages: [damage('scratch-b', 'left', 1)], noDamageDetected: false }),
    ],
    crossViewDeduplication: { applied: false, policy: 'not_supported', note: '' },
  });

  assert.equal(inspection.summary.totalDetectedRegions, 2);
  assert.equal(inspection.deduplicationApplied, false);
  assert.equal(getMultiViewSummaryCopy(inspection).regionsLine, '2 detected damage regions');
});

test('one failed view keeps the other results and warns the customer', () => {
  const inspection = normalizeMultiViewInspection({
    views: [
      view('front', 0, { damages: [damage('d1', 'front', 0)], noDamageDetected: false }),
      view('rear', 1),
      view('left', 2, { damages: [damage('d2', 'left', 2)], noDamageDetected: false }),
      view('right', 3, { success: false, errorCode: 'ROBOFLOW_TIMEOUT', noDamageDetected: false }),
      view('close_up', 4),
    ],
  });
  const copy = getMultiViewSummaryCopy(inspection);

  assert.equal(inspection.summary.analyzedViews, 4);
  assert.equal(inspection.summary.failedViews, 1);
  assert.equal(inspection.summary.totalDetectedRegions, 2);
  assert.equal(copy.viewsLine, '4 views analyzed');
  assert.equal(copy.partialFailureNote, MULTI_VIEW_PARTIAL_FAILURE_MESSAGE);
});

test('a failed view is never presented as clean and leaks no upstream detail', () => {
  const inspection = normalizeMultiViewInspection({
    views: [
      view('front', 0, { damages: [damage('d1', 'front', 0)], noDamageDetected: false }),
      view('right', 1, {
        success: false,
        errorCode: 'ROBOFLOW_REQUEST_FAILED',
        message: 'upstream trace: connection refused at 10.0.0.4',
        noDamageDetected: true,
      }),
    ],
  });

  const failed = inspection.views.find((entry) => entry.viewId === 'right');
  assert.equal(failed.noDamageDetected, false, 'a failed view must not read as clean');
  assert.equal(failed.detectedRegions, 0);
  assert.equal(failed.message, VIEW_ANALYSIS_FAILED_MESSAGE);
  assert.equal(JSON.stringify(inspection).includes('connection refused'), false);
  assert.equal(inspection.summary.viewsWithDamage, 1);
});

test('all views clean uses the cautious message and never an all-clear', () => {
  const inspection = normalizeMultiViewInspection({
    views: [view('front', 0), view('rear', 1), view('left', 2), view('right', 3), view('close_up', 4)],
  });
  const copy = getMultiViewSummaryCopy(inspection);

  assert.equal(copy.message, MULTI_VIEW_ZERO_DETECTION_MESSAGE);
  assert.equal(copy.regionsLine, '0 detected damage regions');
  assert.equal(/the vehicle has no damage/i.test(copy.message), false);
  assert.equal(/no damage found/i.test(copy.message), false);
  assert.equal(copy.partialFailureNote, null);
});

test('zero detections plus a failed view still warns that views were not analyzed', () => {
  const inspection = normalizeMultiViewInspection({
    views: [
      view('front', 0),
      view('rear', 1, { success: false, errorCode: 'INVALID_IMAGE', noDamageDetected: false }),
    ],
  });
  const copy = getMultiViewSummaryCopy(inspection);

  assert.equal(copy.message, MULTI_VIEW_ZERO_DETECTION_MESSAGE);
  assert.equal(copy.partialFailureNote, MULTI_VIEW_PARTIAL_FAILURE_MESSAGE);
  assert.equal(copy.viewsLine, '1 view analyzed');
});

test('a rehydrated scan supplies persisted region counts instead of damages', () => {
  const inspection = normalizeMultiViewInspection({
    inspectionId: 'inspection-persisted',
    views: [
      { viewId: 'front', label: 'Front', index: 0, success: true, detectedRegions: 2 },
      { viewId: 'rear', label: 'Rear', index: 1, success: true, detectedRegions: 0 },
    ],
  });

  assert.equal(inspection.summary.totalDetectedRegions, 2);
  assert.equal(inspection.summary.viewsWithDamage, 1);
  assert.equal(inspection.views[1].noDamageDetected, true);
});

/* ── Grouping keeps overlays tied to their own source image ────────────────── */

test('damages group under the view they were detected in', () => {
  const damages = [
    damage('d1', 'front', 0),
    damage('d2', 'left', 2),
    damage('d3', 'left', 2),
  ];
  const inspection = normalizeMultiViewInspection({
    views: [view('front', 0), view('rear', 1), view('left', 2)],
  });

  const grouped = groupDamagesByView(damages, inspection.views);
  assert.deepEqual(grouped.map((entry) => entry.damages.length), [1, 0, 2]);
  assert.deepEqual(
    getDamagesForView(damages, inspection.views[2]).map((entry) => entry.id),
    ['d2', 'd3']
  );
  assert.deepEqual(getDamagesForView(damages, null).length, 3);
});

test('grouping falls back to imageIndex when sourceView is absent', () => {
  const legacy = [{ id: 'legacy', imageIndex: 1 }];
  const inspection = normalizeMultiViewInspection({ views: [view('front', 0), view('rear', 1)] });

  assert.deepEqual(getDamagesForView(legacy, inspection.views[1]).map((d) => d.id), ['legacy']);
  assert.deepEqual(getDamagesForView(legacy, inspection.views[0]), []);
});

/* ── Screen contracts ──────────────────────────────────────────────────────── */

test('the analyzing screen posts one batch request and renders real view rows', () => {
  assert.match(analyzingSource, /runAiScanBatch/);
  assert.match(analyzingSource, /guidedViewProgress\.map/);
  assert.match(analyzingSource, /getGuidedViewStatusLabel\(view\.status\)/);
  // The completed counter is only shown once the request has actually settled.
  assert.match(analyzingSource, /requestSettled\n\s+\?\s+`\$\{resolvedViewCount\} of \$\{guidedViewProgress\.length\} views analyzed`/);
  // No timer or interval may mark an individual view finished.
  assert.doesNotMatch(analyzingSource, /setTimeout\([^)]*complete/i);
});

test('the analyzing screen keeps the bounded progress controller and session guards', () => {
  assert.match(analyzingSource, /createPendingScanProgressController/);
  assert.match(analyzingSource, /createSessionNavigationGuard/);
  assert.match(analyzingSource, /navigationGuard\.current\.claim\(sessionId, currentSessionId\)/);
  assert.match(analyzingSource, /mounted = false;/);
});

test('the capture screen keys each guided view and guards double submits', () => {
  assert.match(captureSource, /primaryLabel="Analyze Vehicle"/);
  assert.match(captureSource, /createSingleSubmitLatch/);
  assert.match(captureSource, /submitLatch\.current\.claim\(\)/);
  assert.match(captureSource, /createGuidedCaptureSet/);
  assert.match(captureSource, /clearGuidedViewImage/);
  assert.match(captureSource, /getGuidedSubmissionImages\(captureSet\)/);
  // Angles must never be derived from array position again.
  assert.doesNotMatch(captureSource, /angleHintFromIndex/);
});

test('the results screen groups by view without mixing overlays across images', () => {
  assert.match(resultsSource, /getMultiViewSummaryCopy/);
  assert.match(resultsSource, /Source views/);
  assert.match(resultsSource, /getDamagesForView\(allDamages, activeView\)/);
  assert.match(resultsSource, /VIEW_ANALYSIS_FAILED_MESSAGE/);
  assert.match(resultsSource, /VIEW_ZERO_DETECTION_MESSAGE/);
  assert.match(resultsSource, /Source view/);
  // One damage's mask, drawn over that damage's own source image.
  assert.match(resultsSource, /<DamageMaskLayer damage=\{activeDamage\} \/>/);
  assert.match(resultsSource, /activeDamage\?\.imageIndex \?\? activeView\?\.index \?\? 0/);
});

test('the results screen still offers the unchanged 3D and estimate handoffs', () => {
  assert.match(resultsSource, /primaryLabel="Continue to 3D"/);
  assert.match(resultsSource, /secondaryLabel="Skip to Cost Estimate"/);
});

test('the results screen labels counts as regions and never claims uniqueness', () => {
  assert.match(resultsSource, /Detected regions/);
  assert.match(resultsSource, /is not claimed to be unique/);
  assert.doesNotMatch(resultsSource, /unique (vehicle )?damages/i);
});
