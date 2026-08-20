import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoboflowWorkflowResponse } from '../services/roboflowDamage.service.js';
import { buildDamageIssue, buildDamageReport } from '../models/damageReport.model.js';

test('parses nested Roboflow Workflow instance segmentation output', () => {
  const payload = {
    outputs: [
      {
        damage_predictions: {
          image: { width: 1000, height: 500 },
          predictions: [
            {
              detection_id: 'prediction-1',
              class: 'scratch',
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
          ],
        },
      },
    ],
  };

  const predictions = parseRoboflowWorkflowResponse(payload);
  assert.equal(predictions.length, 1);
  assert.equal(predictions[0].class, 'scratch');
  assert.deepEqual(predictions[0].boundingBox, { x: 400, y: 200, width: 200, height: 100 });
  assert.equal(predictions[0].imageWidth, 1000);
  assert.equal(predictions[0].points.length, 4);
});

test('builds normalized AutoGloss damage issue with mask, area, and report fields', () => {
  const issue = buildDamageIssue(
    {
      id: 'scratch-1',
      class: 'scratch',
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

  assert.equal(issue.type, 'Scratch');
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
