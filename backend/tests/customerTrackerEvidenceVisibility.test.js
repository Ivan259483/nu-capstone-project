import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCustomerVisibleTrackerStageMedia,
  isTrackerEvidenceStageReleased,
} from '../utils/customerTrackerEvidence.utils.js';

const evidence = (stage, suffix = stage) => ({
  _id: `private-${suffix}`,
  stage,
  slot: 'front',
  photoUrl: `https://media.example.test/${suffix}.jpg`,
  description: `private ${suffix} note`,
  uploadedAt: '2026-09-10T01:00:00.000Z',
  uploadedBy: 'QC Internal',
});

test('uploading arrival evidence does not release it while the official stage is confirmed', () => {
  const visible = getCustomerVisibleTrackerStageMedia({
    serviceTrackingStage: 'confirmed',
    trackerStageMedia: [evidence('received', 'arrival')],
  });

  assert.deepEqual(visible, []);
  assert.equal(JSON.stringify(visible).includes('arrival.jpg'), false);
  assert.equal(JSON.stringify(visible).includes('private arrival note'), false);
});

test('advancing to received releases arrival evidence and no future-stage evidence', () => {
  const arrival = evidence('received', 'arrival');
  const future = evidence('in_progress', 'service');
  const visible = getCustomerVisibleTrackerStageMedia({
    serviceTrackingStage: 'received',
    trackerStageMedia: [arrival, future],
  });

  assert.deepEqual(visible, [arrival]);
  assert.equal(JSON.stringify(visible).includes('service.jpg'), false);
});

test('each official stage cumulatively releases only that gate and earlier gates', () => {
  const rows = [
    evidence('received'),
    evidence('in_progress'),
    evidence('quality_check'),
    evidence('ready_pickup'),
  ];

  assert.deepEqual(
    getCustomerVisibleTrackerStageMedia({ serviceTrackingStage: 'in_progress', trackerStageMedia: rows })
      .map((entry) => entry.stage),
    ['received', 'in_progress'],
  );
  assert.deepEqual(
    getCustomerVisibleTrackerStageMedia({ serviceTrackingStage: 'quality_check', trackerStageMedia: rows })
      .map((entry) => entry.stage),
    ['received', 'in_progress', 'quality_check'],
  );
  assert.deepEqual(
    getCustomerVisibleTrackerStageMedia({ serviceTrackingStage: 'ready_pickup', trackerStageMedia: rows })
      .map((entry) => entry.stage),
    ['received', 'in_progress', 'quality_check', 'ready_pickup'],
  );
});

test('missing or unknown workflow state fails closed and confirmed media is never evidence', () => {
  assert.equal(isTrackerEvidenceStageReleased(null, 'received'), false);
  assert.equal(isTrackerEvidenceStageReleased('unknown', 'received'), false);
  assert.equal(isTrackerEvidenceStageReleased('confirmed', 'confirmed'), false);
  assert.deepEqual(
    getCustomerVisibleTrackerStageMedia({
      serviceTrackingStage: null,
      status: 'received',
      trackerStageMedia: [evidence('received')],
    }),
    [],
  );
});

test('terminal tracker stages retain all released gate evidence', () => {
  for (const serviceTrackingStage of ['completed', 'released']) {
    assert.equal(isTrackerEvidenceStageReleased(serviceTrackingStage, 'ready_pickup'), true);
  }
});
