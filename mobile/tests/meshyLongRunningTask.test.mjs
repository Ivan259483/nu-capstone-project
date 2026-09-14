import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveModel3DStatus } from '../src/features/ai-scan/modelProgressState.ts';

// See tests/meshyQueueProgress.test.mjs for why ar-view.tsx / aiService.ts /
// scanStore.ts are asserted against as source text rather than imported:
// they pull in React Native + the rest of the AI-scan module graph, which
// this plain node:test harness (matching the project's existing convention)
// can't resolve directly.
const aiServiceSource = readFileSync(
  new URL('../src/services/api/aiService.ts', import.meta.url),
  'utf8'
);
const arViewSource = readFileSync(
  new URL('../src/app/(customer)/scan/ar-view.tsx', import.meta.url),
  'utf8'
);
const scanStoreSource = readFileSync(
  new URL('../src/features/ai-scan/scanStore.ts', import.meta.url),
  'utf8'
);

// 1 & 2. A local polling timeout is a distinct, non-terminal outcome — never
// a Meshy failure — regardless of how long the client happened to wait.
test('deriveModel3DStatus maps still_processing to its own lifecycle state, distinct from failed/unavailable', () => {
  assert.equal(deriveModel3DStatus({ status: 'still_processing' }), 'still_processing');
  assert.notEqual(deriveModel3DStatus({ status: 'still_processing' }), 'failed');
  assert.notEqual(deriveModel3DStatus({ status: 'still_processing' }), 'unavailable');
});

test('an in-progress task well under the polling window still maps to "processing"', () => {
  // e.g. 239s into a 600s window: nothing has changed about IN_PROGRESS handling.
  assert.equal(deriveModel3DStatus({ status: 'processing', meshyStartedAt: 1_700_000_000_000 }), 'processing');
});

test('exceeding the local polling window never resolves as a thrown/terminal failure', () => {
  // The old behavior: throw buildError('MESHY_3D_TIMEOUT', ...) on loop-exit.
  // That code path must be gone entirely.
  assert.doesNotMatch(aiServiceSource, /MESHY_3D_TIMEOUT/);
  assert.doesNotMatch(aiServiceSource, /is taking longer than expected\. You can retry from the scan results\./);
});

test('the polling window elapsing resolves as a still_processing object, not a throw', () => {
  assert.match(aiServiceSource, /status: 'still_processing',\s*\n\s*taskId,/);
  assert.match(aiServiceSource, /a client-side polling timeout is NOT a Meshy failure/i);
});

test('a genuine Meshy FAILED status is still the only path that throws MESHY_3D_FAILED', () => {
  const failedThrows = aiServiceSource.match(/MESHY_3D_FAILED/g) || [];
  assert.equal(failedThrows.length, 1, 'MESHY_3D_FAILED should have exactly one occurrence (the real-failure throw)');
  assert.match(aiServiceSource, /if \(status === 'failed'\) \{\s*\n\s*throw buildError\(\s*\n\s*'MESHY_3D_FAILED'/);
});

test('the foreground polling window was widened from the old 240s default, not left arbitrary-and-terminal', () => {
  assert.doesNotMatch(aiServiceSource, /timeoutMs \?\? 240_000/);
  assert.match(aiServiceSource, /timeoutMs \?\? 600_000/);
});

// 3. long-running task preserves task ID
test('the still_processing result and every non-terminal poll response carry the same task id', () => {
  assert.match(aiServiceSource, /status: 'still_processing',\s*\n\s*taskId,/);
  // scanStore only ever adopts a new taskId when one is explicitly given —
  // it never clears modelTaskId on a non-terminal status.
  assert.match(scanStoreSource, /modelTaskId: progress\.taskId \?\? state\.modelTaskId,/);
});

// 4. "Continue Waiting" resumes the same task
test('Continue Waiting resumes polling with force=false (same task id), never force=true', () => {
  assert.match(arViewSource, /if \(stillProcessing\) \{[\s\S]*?startOrPoll\(false\);/);
  assert.match(arViewSource, /Resumes polling the SAME task id \(force=false\)/);
});

test('the still_processing card renders a Continue Waiting action, not a failure/retry-with-new-task action', () => {
  assert.match(arViewSource, /Continue Waiting/);
  assert.match(arViewSource, /3D model is still processing/);
  assert.match(arViewSource, /Meshy is taking longer than expected\. You can keep waiting or return later\./);
  // The still_processing branch must not reuse the "generation failed" copy.
  const stillProcessingBlock = arViewSource.slice(
    arViewSource.indexOf('{stillProcessing ? ('),
    arViewSource.indexOf(') : !ready && !unavailable ? (')
  );
  assert.doesNotMatch(stillProcessingBlock, /3D model generation failed/);
});

// 5. remount/reopen resumes the same active task
test('mounting always attempts startOrPoll, and its guard excludes only ready/failed/unavailable — not still_processing', () => {
  assert.match(arViewSource, /useEffect\(\(\) => \{\s*\n\s*startOrPoll\(\);\s*\n\s*\}, \[startOrPoll\]\);/);
  assert.match(arViewSource, /if \(!force && modelStatus === 'ready'\) return;/);
  assert.match(arViewSource, /if \(!force && \(modelStatus === 'failed' \|\| modelStatus === 'unavailable'\)\) return;/);
  // No separate guard bails out of startOrPoll for 'still_processing' — it
  // is deliberately allowed to resume, unlike the terminal statuses above.
  assert.doesNotMatch(arViewSource, /modelStatus === 'still_processing'\) return;/);
});

test('resuming reuses the existing modelTaskId instead of clearing it', () => {
  assert.match(arViewSource, /let taskId = force \? null : modelTaskId;/);
});

// 6. no duplicate Meshy generation is created
test('startAiScan3D has exactly one call site, reached only when there is no taskId yet', () => {
  const startCalls = arViewSource.match(/startAiScan3D\(/g) || [];
  assert.equal(startCalls.length, 1);
  assert.match(arViewSource, /if \(!taskId\) \{[\s\S]*?startAiScan3D\(/);
});

test('force=true (which starts a new task) is reserved for the real-failure retry and USDZ regeneration, never still_processing', () => {
  assert.match(arViewSource, /Only an explicit user retry after a REAL terminal failure may\s*\n\s*\/\/ start a new Meshy task — never a local timeout\./);
});

// 7. actual Meshy FAILED -> failed UI
test('FAILED still maps to the failed lifecycle state', () => {
  assert.equal(deriveModel3DStatus({ status: 'failed' }), 'failed');
});

// 8. eventual SUCCEEDED after a long wait -> existing AR flow continues
test('ar_ready still maps to ready regardless of how it was reached', () => {
  assert.equal(deriveModel3DStatus({ status: 'ar_ready' }), 'ready');
});

test('the existing QR/Scene-Viewer/Quick-Look AR flow is untouched by the timeout fix', () => {
  assert.match(arViewSource, /createArLaunchSession/);
  assert.match(arViewSource, /QRCode value=\{launchSession\.launchUrl\}/);
});

// 9. temporary polling/network failure -> non-terminal (still true after this change)
test('a network error during polling still retries instead of ending the task', () => {
  assert.match(aiServiceSource, /catch \(networkError\) \{/);
  assert.match(aiServiceSource, /discard the active Meshy task/);
});

// 10. Skip/Continue to Cost Estimate remains usable, including while still_processing
test('Continue to Cost Estimate is offered (not blocked) while still_processing, and Skip remains for queued/generating', () => {
  assert.match(arViewSource, /ready \|\| unavailable \|\| stillProcessing\s*\n\s*\? 'Continue to Cost Estimate'\s*\n\s*: 'Skip to Cost Estimate'/);
});

test('the secondary action always routes to the estimate screen regardless of 3D status', () => {
  assert.match(arViewSource, /onSecondaryPress=\{\(\) => \{\s*\n\s*aiScanStore\.activateWorkflowStage\('price'\);\s*\n\s*router\.push\('\/\(customer\)\/scan\/estimate' as never\);/);
});
