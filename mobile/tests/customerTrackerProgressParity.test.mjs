import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getTrackerPipelineProgressPct as getWebProgress } from '../../frontend/src/lib/tracker-pipeline-progress.ts';
import { getTrackerPipelineProgressPct as getMobileProgress } from '../src/utils/tracker-pipeline-progress.ts';
import { isCustomerTrackerMediaStageReleased as isWebEvidenceReleased } from '../../frontend/src/lib/customer-tracker-evidence-release.ts';
import { isCustomerTrackerMediaStageReleased as isMobileEvidenceReleased } from '../src/utils/customer-tracker-evidence-release.ts';

const canonicalCases = [
  { label: 'Appointment Confirmed', input: { serviceTrackingStage: 'confirmed', status: 'confirmed' }, expected: 0 },
  { label: 'Vehicle Arrived', input: { serviceTrackingStage: 'received', status: 'received' }, expected: 25 },
  { label: 'Service In Progress', input: { serviceTrackingStage: 'in_progress', status: 'in_progress' }, expected: 50 },
  { label: 'Quality Check', input: { serviceTrackingStage: 'quality_check', status: 'in_progress' }, expected: 75 },
  { label: 'Ready for Pickup', input: { serviceTrackingStage: 'ready_pickup', status: 'in_progress' }, expected: 100 },
];

for (const { label, input, expected } of canonicalCases) {
  test(`${label} is ${expected}% in Web and Mobile`, () => {
    assert.equal(getWebProgress(input), expected);
    assert.equal(getMobileProgress(input), expected);
  });
}

test('status aliases and terminal states use safe canonical fallbacks', () => {
  const cases = [
    [{ status: 'approved' }, 0],
    [{ status: 'assigned' }, 0],
    [{ status: 'received' }, 25],
    [{ status: 'in-progress' }, 50],
    [{ status: 'ready-for-payment' }, 100],
    [{ status: 'completed' }, 100],
    [{ status: 'released' }, 100],
    [{ status: 'cancelled' }, 0],
    [{ status: 'rejected' }, 0],
    [{ status: 'unknown' }, 0],
    [{}, 0],
  ];

  for (const [input, expected] of cases) {
    assert.equal(getWebProgress(input), expected);
    assert.equal(getMobileProgress(input), expected);
  }
});

test('Mobile tracker does not impose a 20% floor on canonical progress', async () => {
  const trackerSource = await readFile(
    new URL('../src/app/(customer)/track.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(trackerSource, /Math\.max\(pipelinePct,\s*20\)/);
  assert.match(trackerSource, /getTrackerPipelineProgressPct\(\{/);
});

test('Mobile ring has no fixed decorative progress arc and explicitly hides zero-length arcs', async () => {
  const trackerSource = await readFile(
    new URL('../src/app/(customer)/track.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(trackerSource, /CIRCUMFERENCE \* 0\.18/);
  assert.match(trackerSource, /strokeDashoffset: CIRCUMFERENCE \* \(1 - normalizedProgress\)/);
  assert.match(trackerSource, /opacity: normalizedProgress <= 0 \? 0 : 1/);
  assert.equal(trackerSource.match(/animatedProps=\{animatedProps\}/g)?.length, 2);
});

test('Web and Mobile hide uploaded evidence until its official gate is released', () => {
  const uploadedButPending = {
    serviceTrackingStage: 'confirmed',
    status: 'confirmed',
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: 'https://media.example.test/pending-arrival.jpg' },
    ],
  };

  assert.equal(isWebEvidenceReleased(uploadedButPending, 'received'), false);
  assert.equal(isMobileEvidenceReleased(uploadedButPending, 'received'), false);
});

test('Web and Mobile expose released evidence and keep future-stage uploads hidden', () => {
  const currentArrivalGate = {
    serviceTrackingStage: 'received',
    status: 'received',
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: 'https://media.example.test/released-arrival.jpg' },
      { stage: 'in_progress', slot: 'front', photoUrl: 'https://media.example.test/pending-service.jpg' },
    ],
  };

  for (const isReleased of [isWebEvidenceReleased, isMobileEvidenceReleased]) {
    assert.equal(isReleased(currentArrivalGate, 'received'), true);
    assert.equal(isReleased(currentArrivalGate, 'in_progress'), false);
  }
});

test('customer trackers no longer advance stages from photo existence', async () => {
  const [webDashboard, mobileTracker, webStep, webMedia, mobileMedia, mobileHomeRail] = await Promise.all([
    readFile(new URL('../../frontend/src/pages/CustomerDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(customer)/track.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/lib/customer-live-tracker-step.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/lib/customer-tracker-stage-media.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/customer-tracker-stage-media.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/customer-home-rail-step.ts', import.meta.url), 'utf8'),
  ]);

  for (const source of [webDashboard, mobileTracker, webStep, mobileHomeRail]) {
    assert.doesNotMatch(source, /bumpCustomerTrackerIndexFor/);
  }
  for (const source of [webMedia, mobileMedia]) {
    assert.match(source, /!isCustomerTrackerMediaStageReleased\(booking, stage\)/);
  }
});
