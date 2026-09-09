import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateAiScanWorkflowStage,
  beginAiScanWorkflow,
  completeAiScanWorkflow,
  createPendingScanProgressController,
  createSessionNavigationGuard,
  failAiScanWorkflow,
  PENDING_SCAN_PROGRESS_CEILING,
  updatePendingAiScanProgress,
} from '../src/features/ai-scan/scanWorkflowState.ts';

const downstreamStates = (workflow) => ({
  '3d': workflow.stepStates['3d'],
  ar: workflow.stepStates.ar,
  price: workflow.stepStates.price,
  approve: workflow.stepStates.approve,
});

test('pending /api/ai/scan never activates 3D', () => {
  const workflow = beginAiScanWorkflow(1);
  assert.equal(workflow.stepStates['3d'], 'inactive');
});

test('pending /api/ai/scan never activates AR', () => {
  const workflow = beginAiScanWorkflow(1);
  assert.equal(workflow.stepStates.ar, 'inactive');
});

test('pending /api/ai/scan never activates PRICE', () => {
  const workflow = beginAiScanWorkflow(1);
  assert.equal(workflow.stepStates.price, 'inactive');
});

test('a slow Roboflow response only advances bounded visual progress', () => {
  let workflow = beginAiScanWorkflow(4);
  for (let progress = 10; progress <= 180; progress += 10) {
    workflow = updatePendingAiScanProgress(workflow, 4, progress);
  }

  assert.equal(workflow.activeStage, 'detect');
  assert.equal(workflow.progress, PENDING_SCAN_PROGRESS_CEILING);
  assert.deepEqual(downstreamStates(workflow), {
    '3d': 'inactive', ar: 'inactive', price: 'inactive', approve: 'inactive',
  });
});

test('successful detection completes DETECT and permits one navigation', () => {
  const workflow = completeAiScanWorkflow(beginAiScanWorkflow(7), 7);
  const navigation = createSessionNavigationGuard();

  assert.equal(workflow.stepStates.detect, 'complete');
  assert.equal(workflow.progress, 100);
  assert.equal(navigation.claim(7, workflow.sessionId), true);
  assert.equal(navigation.claim(7, workflow.sessionId), false);
});

test('failed detection does not activate downstream stages', () => {
  const workflow = failAiScanWorkflow(beginAiScanWorkflow(8), 8);
  assert.equal(workflow.requestStatus, 'failed');
  assert.deepEqual(downstreamStates(workflow), {
    '3d': 'inactive', ar: 'inactive', price: 'inactive', approve: 'inactive',
  });
});

test('a stale previous request cannot overwrite the current session', () => {
  const current = beginAiScanWorkflow(10);
  assert.equal(completeAiScanWorkflow(current, 9), current);
  assert.equal(failAiScanWorkflow(current, 9), current);
  assert.equal(updatePendingAiScanProgress(current, 9, 90), current);
  assert.equal(createSessionNavigationGuard().claim(9, current.sessionId), false);
});

test('pending progress intervals are cleaned up and stop emitting', () => {
  let tick = () => {};
  let clearCount = 0;
  const updates = [];
  const controller = createPendingScanProgressController(
    (progress) => updates.push(progress),
    {
      setIntervalFn: (callback) => {
        tick = callback;
        return 123;
      },
      clearIntervalFn: () => {
        clearCount += 1;
      },
    }
  );

  tick();
  controller.stop();
  tick();
  controller.stop();
  assert.equal(updates.length, 1);
  assert.equal(clearCount, 1);
});

test('Continue to 3D activates 3D only after explicit action', () => {
  const detected = completeAiScanWorkflow(beginAiScanWorkflow(11), 11);
  assert.equal(detected.stepStates['3d'], 'inactive');

  const continued = activateAiScanWorkflowStage(detected, '3d');
  assert.equal(continued.stepStates['3d'], 'active');
  assert.equal(continued.stepStates.ar, 'inactive');
  assert.equal(continued.stepStates.price, 'inactive');
});

test('Skip to Cost Estimate activates PRICE without completing 3D or AR', () => {
  const detected = completeAiScanWorkflow(beginAiScanWorkflow(12), 12);
  const skippedToPrice = activateAiScanWorkflowStage(detected, 'price');

  assert.equal(skippedToPrice.stepStates.price, 'active');
  assert.equal(skippedToPrice.stepStates['3d'], 'inactive');
  assert.equal(skippedToPrice.stepStates.ar, 'inactive');
});

test('zero-detection completion uses the same truthful detection workflow', () => {
  const zeroDetectionWorkflow = completeAiScanWorkflow(beginAiScanWorkflow(13), 13);
  assert.equal(zeroDetectionWorkflow.stepStates.detect, 'complete');
  assert.deepEqual(downstreamStates(zeroDetectionWorkflow), {
    '3d': 'inactive', ar: 'inactive', price: 'inactive', approve: 'inactive',
  });
});

test('back-to-back scans reset progress and do not leak prior stages', () => {
  let first = completeAiScanWorkflow(beginAiScanWorkflow(14), 14);
  first = activateAiScanWorkflowStage(first, 'ar');
  assert.equal(first.stepStates.ar, 'active');

  const second = beginAiScanWorkflow(15);
  assert.equal(second.progress, 6);
  assert.equal(second.stepStates.scan, 'complete');
  assert.equal(second.stepStates.detect, 'active');
  assert.deepEqual(downstreamStates(second), {
    '3d': 'inactive', ar: 'inactive', price: 'inactive', approve: 'inactive',
  });
});
