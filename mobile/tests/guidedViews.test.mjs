import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAnalyzeGuidedSet,
  clearGuidedViewImage,
  countCompletedGuidedViews,
  countReadyGuidedViews,
  createGuidedCaptureSet,
  createGuidedViewProgress,
  getGuidedSubmissionImages,
  getGuidedViewLabel,
  getGuidedViewStatusLabel,
  getNextEmptyGuidedView,
  getReadyGuidedViews,
  GUIDED_VIEWS,
  GUIDED_VIEW_IDS,
  isGuidedViewId,
  markGuidedViewsAnalyzing,
  markGuidedViewsFailed,
  MAX_GUIDED_VIEWS,
  resolveGuidedViewProgress,
  setGuidedViewImage,
} from '../src/features/ai-scan/guidedViews.ts';
import { createSingleSubmitLatch } from '../src/features/ai-scan/scanWorkflowState.ts';

const image = (name) => ({
  uri: `file:///${name}.jpg`,
  fileName: `${name}.jpg`,
  mimeType: 'image/jpeg',
});

const fullSet = () => GUIDED_VIEW_IDS.reduce(
  (set, viewId) => setGuidedViewImage(set, viewId, image(viewId)),
  createGuidedCaptureSet()
);

test('guided view ids reuse the existing capture angles', () => {
  assert.deepEqual([...GUIDED_VIEW_IDS], ['front', 'rear', 'left', 'right', 'close_up']);
  assert.equal(MAX_GUIDED_VIEWS, 5);
  assert.equal(getGuidedViewLabel('left'), 'Left');
  assert.equal(getGuidedViewLabel('close_up'), 'Close-up');
  assert.equal(isGuidedViewId('front'), true);
  assert.equal(isGuidedViewId('driver_side'), false);
});

test('a fresh capture set has every view pending and cannot be analyzed', () => {
  const set = createGuidedCaptureSet();
  GUIDED_VIEWS.forEach((view) => {
    assert.equal(set[view.id].status, 'pending');
    assert.equal(set[view.id].image, null);
  });
  assert.equal(countReadyGuidedViews(set), 0);
  assert.equal(canAnalyzeGuidedSet(set), false);
});

test('a single captured view is enough to analyze', () => {
  const set = setGuidedViewImage(createGuidedCaptureSet(), 'close_up', image('close-up'));
  assert.equal(canAnalyzeGuidedSet(set), true);
  assert.equal(countReadyGuidedViews(set), 1);
});

test('capturing a view stamps its angle and damage area', () => {
  const set = setGuidedViewImage(createGuidedCaptureSet(), 'rear', image('rear'));
  assert.equal(set.rear.image.angle, 'rear');
  assert.equal(set.rear.image.selectedDamageArea, 'Rear Bumper');
  assert.equal(set.rear.status, 'ready');
});

test('views can be captured out of order without relabelling each other', () => {
  let set = createGuidedCaptureSet();
  set = setGuidedViewImage(set, 'right', image('right'));
  set = setGuidedViewImage(set, 'front', image('front'));

  assert.equal(set.right.image.angle, 'right');
  assert.equal(set.right.image.uri, 'file:///right.jpg');
  assert.equal(set.front.image.angle, 'front');
  assert.equal(set.front.image.uri, 'file:///front.jpg');
  // Submission order is always the canonical guided order, not capture order.
  assert.deepEqual(
    getReadyGuidedViews(set).map((entry) => entry.viewId),
    ['front', 'right']
  );
});

test('retaking one view leaves every other view untouched', () => {
  const before = fullSet();
  const after = setGuidedViewImage(before, 'left', image('left-retake'));

  assert.equal(after.left.image.uri, 'file:///left-retake.jpg');
  assert.equal(countReadyGuidedViews(after), 5);
  ['front', 'rear', 'right', 'close_up'].forEach((viewId) => {
    assert.equal(after[viewId], before[viewId], `${viewId} should be untouched`);
  });
});

test('clearing one view never shifts or relabels the others', () => {
  const before = fullSet();
  const after = clearGuidedViewImage(before, 'front');

  assert.equal(after.front.image, null);
  assert.equal(after.front.status, 'pending');
  assert.equal(after.rear.image.angle, 'rear', 'Rear must not slide into the Front slot');
  assert.equal(countReadyGuidedViews(after), 4);
  assert.deepEqual(
    getReadyGuidedViews(after).map((entry) => entry.viewId),
    ['rear', 'left', 'right', 'close_up']
  );
});

test('the next empty view walks the canonical order and ends at null', () => {
  let set = createGuidedCaptureSet();
  assert.equal(getNextEmptyGuidedView(set), 'front');
  set = setGuidedViewImage(set, 'front', image('front'));
  assert.equal(getNextEmptyGuidedView(set), 'rear');
  assert.equal(getNextEmptyGuidedView(fullSet()), null);
});

test('submission order defines imageIndex and matches the progress rows', () => {
  const images = getGuidedSubmissionImages(fullSet());
  assert.deepEqual(images.map((entry) => entry.angle), [...GUIDED_VIEW_IDS]);

  const progress = createGuidedViewProgress(images);
  assert.deepEqual(progress.map((row) => row.viewId), [...GUIDED_VIEW_IDS]);
  assert.deepEqual(progress.map((row) => row.label), GUIDED_VIEWS.map((view) => view.label));
});

test('an unrecognized angle falls back to close_up rather than inventing a view', () => {
  const progress = createGuidedViewProgress([{ angle: 'full_vehicle' }, { angle: undefined }]);
  assert.deepEqual(progress.map((row) => row.viewId), ['close_up', 'close_up']);
});

/* ── Progress is resolved only from real results ───────────────────────────── */

test('starting an inspection marks every submitted view analyzing, never complete', () => {
  const progress = markGuidedViewsAnalyzing(createGuidedViewProgress(getGuidedSubmissionImages(fullSet())));
  assert.equal(progress.every((row) => row.status === 'analyzing'), true);
  assert.equal(countCompletedGuidedViews(progress), 0);
  assert.equal(getGuidedViewStatusLabel('analyzing'), 'Analyzing');
});

test('a view is only complete once its own result arrives', () => {
  const started = markGuidedViewsAnalyzing(
    createGuidedViewProgress(getGuidedSubmissionImages(fullSet()))
  );

  const resolved = resolveGuidedViewProgress(started, [
    { viewId: 'front', success: true },
    { viewId: 'rear', success: true },
    { viewId: 'left', success: true },
    { viewId: 'right', success: false, message: 'This view could not be analyzed. Please retake or upload it again.' },
    { viewId: 'close_up', success: true },
  ]);

  assert.equal(countCompletedGuidedViews(resolved), 4);
  const right = resolved.find((row) => row.viewId === 'right');
  assert.equal(right.status, 'retake_required');
  assert.equal(getGuidedViewStatusLabel(right.status), 'Retake required');
  assert.match(right.message, /could not be analyzed/);
});

test('a view with no result stays analyzing rather than being assumed finished', () => {
  const started = markGuidedViewsAnalyzing(
    createGuidedViewProgress([{ angle: 'front' }, { angle: 'rear' }])
  );
  const resolved = resolveGuidedViewProgress(started, [{ viewId: 'front', success: true }]);

  assert.equal(resolved.find((row) => row.viewId === 'front').status, 'complete');
  assert.equal(resolved.find((row) => row.viewId === 'rear').status, 'analyzing');
  assert.equal(countCompletedGuidedViews(resolved), 1);
});

test('a whole-request failure never marks a view complete', () => {
  const started = markGuidedViewsAnalyzing(
    createGuidedViewProgress([{ angle: 'front' }, { angle: 'rear' }])
  );
  const failed = markGuidedViewsFailed(started, 'This view could not be analyzed. Please retake or upload it again.');

  assert.equal(failed.every((row) => row.status === 'failed'), true);
  assert.equal(countCompletedGuidedViews(failed), 0);
});

/* ── Double submit ─────────────────────────────────────────────────────────── */

test('the submit latch starts only one inspection per claim', () => {
  const latch = createSingleSubmitLatch();
  assert.equal(latch.claim(), true);
  assert.equal(latch.claim(), false);
  assert.equal(latch.claim(), false);
  assert.equal(latch.isClaimed, true);
});

test('the submit latch can be re-armed for a deliberate new inspection', () => {
  const latch = createSingleSubmitLatch();
  assert.equal(latch.claim(), true);
  latch.release();
  assert.equal(latch.isClaimed, false);
  assert.equal(latch.claim(), true);
  assert.equal(latch.claim(), false);
});
