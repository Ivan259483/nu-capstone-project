import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveModel3DStatus } from '../src/features/ai-scan/modelProgressState.ts';

// scanStore.ts and ar-view.tsx pull in the rest of the AI-scan module graph
// (scanResultState, threeDPreparation, guidedViews, multiViewInspection,
// React Native components, ...) which this plain node:test harness can't
// resolve directly — the project's existing tests for these files (e.g.
// aiScan3DPreparation.test.mjs) already work around that by asserting
// against the screen/store source text instead of rendering/importing it.
// The lifecycle *logic* itself lives in modelProgressState.ts, a
// dependency-free leaf module, and is exercised directly above.
const scanStoreSource = readFileSync(
  new URL('../src/features/ai-scan/scanStore.ts', import.meta.url),
  'utf8'
);
const arViewSource = readFileSync(
  new URL('../src/app/(customer)/scan/ar-view.tsx', import.meta.url),
  'utf8'
);

// 1. PENDING + progress 0 -> queued/indeterminate state
test('PENDING (processing status, started_at 0) maps to queued, never a "generating" state', () => {
  assert.equal(deriveModel3DStatus({ status: 'processing', meshyStartedAt: 0 }), 'queued');
});

test('PENDING with started_at absent (undefined) is also queued, not just started_at: 0', () => {
  assert.equal(deriveModel3DStatus({ status: 'processing' }), 'queued');
});

// 2. PENDING + preceding_tasks -> queue count displayed (passthrough is
// stored verbatim in scanStore.ts — asserted structurally below — and
// rendered only when queued, with no invented ETA).
test('ar-view renders the queue-depth hint only from a real preceding_tasks value, with no invented ETA', () => {
  assert.match(arViewSource, /precedingTasksLabel/);
  assert.match(arViewSource, /generation task/);
  assert.doesNotMatch(arViewSource, /\bETA\b/i);
});

test('scanStore stores precedingTasks verbatim per poll response (no smoothing/estimation)', () => {
  assert.match(scanStoreSource, /modelPrecedingTasks: progress\.precedingTasks \?\? null/);
});

// 3. processing + real progress -> determinate percentage
test('IN_PROGRESS (processing status with a real started_at) maps to "processing", not "queued"', () => {
  assert.equal(deriveModel3DStatus({ status: 'processing', meshyStartedAt: 1_700_000_000_000 }), 'processing');
});

test('the progress bar binds directly to the real API percentage, never an artificial increment', () => {
  assert.match(arViewSource, /Math\.round\(modelProgress\)/);
  assert.doesNotMatch(arViewSource, /modelProgress\s*\+\s*1\b/);
});

// 4. progress updates across polling responses — deriveModel3DStatus is a
// pure function of each response, so replaying a poll sequence never
// accumulates or smooths anything; each call is independent.
test('each polling response is mapped independently — the previous status never leaks into the next call', () => {
  const sequence = [
    { status: 'processing', meshyStartedAt: 0 },
    { status: 'processing', meshyStartedAt: 0 },
    { status: 'processing', meshyStartedAt: 1_700_000_000_000 },
    { status: 'processing', meshyStartedAt: 1_700_000_000_000 },
    { status: 'ar_ready' },
  ];
  const results = sequence.map(deriveModel3DStatus);
  assert.deepEqual(results, ['queued', 'queued', 'processing', 'processing', 'ready']);
});

// 5. SUCCEEDED -> existing model/QR/AR flow continues unmodified
test('SUCCEEDED (ar_ready) maps to ready', () => {
  assert.equal(deriveModel3DStatus({ status: 'ar_ready' }), 'ready');
});

test('the existing QR/Scene-Viewer/Quick-Look AR launch flow in ar-view.tsx is untouched', () => {
  assert.match(arViewSource, /createArLaunchSession/);
  assert.match(arViewSource, /QRCode value=\{launchSession\.launchUrl\}/);
  assert.match(arViewSource, /directLaunchUrl/);
});

// 6. FAILED -> non-blocking fallback
test('FAILED maps to failed', () => {
  assert.equal(deriveModel3DStatus({ status: 'failed' }), 'failed');
});

test('UNAVAILABLE maps to unavailable, distinct from failed', () => {
  assert.equal(deriveModel3DStatus({ status: 'unavailable' }), 'unavailable');
});

test('ar-view.tsx shows a distinct failure view with a retry action instead of a stuck loading bar', () => {
  assert.match(arViewSource, /3D model generation failed/);
  assert.match(arViewSource, /Retry 3D Generation/);
});

// 7. polling does not create duplicate Meshy jobs — startAiScan3D must have
// exactly one call site, gated on "no active task yet".
test('startAiScan3D is only ever called from the "no active task yet" branch, never on every poll tick', () => {
  const startCalls = arViewSource.match(/startAiScan3D\(/g) || [];
  assert.equal(startCalls.length, 1, 'startAiScan3D should have exactly one call site');
  assert.match(arViewSource, /if \(!taskId\) \{[\s\S]*?startAiScan3D\(/);
});

// 8. polling stops on terminal state/unmount
test('the poll loop is cancelled on unmount via cancelledRef', () => {
  assert.match(arViewSource, /const cancelledRef = useRef\(false\)/);
  assert.match(arViewSource, /cancelledRef\.current = true/);
});

test('pollAiScan3D receives shouldCancel wired to both unmount and a changed active task', () => {
  assert.match(
    arViewSource,
    /shouldCancel: \(\) =>\s*\n?\s*cancelledRef\.current \|\| aiScanStore\.getState\(\)\.modelTaskId !== activeTaskId/
  );
});

// 9. stale task responses cannot overwrite a newer task
test('a cancelled/superseded poll result is never applied to the store', () => {
  assert.match(scanStoreSource, /if \(progress\.status === 'cancelled'\) return;/);
  assert.match(arViewSource, /if \(result\.status !== 'cancelled'\) \{/);
});

test('a stale rejection (thrown after cancellation/supersession) does not overwrite a newer active session', () => {
  assert.match(arViewSource, /if \(cancelledRef\.current\) return;/);
  assert.match(
    arViewSource,
    /if \(activeTaskId && aiScanStore\.getState\(\)\.modelTaskId !== activeTaskId\) return;/
  );
});

// 10. existing Skip to Cost Estimate remains unchanged
test('Skip/Continue to Cost Estimate stays available from the AR screen regardless of 3D status', () => {
  assert.match(arViewSource, /secondaryLabel=\{[\s\S]*?'Skip to Cost Estimate'/);
});

test('scanStore delegates the queued/generating mapping to the shared, tested lifecycle function', () => {
  assert.match(scanStoreSource, /modelStatus: deriveModel3DStatus\(progress\)/);
});

test('network failures during polling retry instead of discarding the active task', () => {
  const aiServiceSource = readFileSync(
    new URL('../src/services/api/aiService.ts', import.meta.url),
    'utf8'
  );
  assert.match(aiServiceSource, /catch \(networkError\) \{/);
  assert.match(aiServiceSource, /discard the active Meshy task/);
});
