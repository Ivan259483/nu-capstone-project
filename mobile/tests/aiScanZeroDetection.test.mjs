import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAiScanResultPresentation,
  normalizeAiScanResult,
  ZERO_DETECTION_MESSAGE,
} from '../src/features/ai-scan/scanResultState.ts';

const damage = {
  id: 'damage-1',
  type: 'Damage',
  damageClass: 'damage',
  damageSubtype: 'Dent',
  component: 'Unknown Vehicle Panel',
  subtypeAnalysis: {
    accepted: true,
    rawClass: 'car_dent',
    top1Confidence: 0.91,
    top2Class: 'car_scratch',
    top2Confidence: 0.12,
    margin: 0.79,
    reason: 'accepted',
  },
  severity: 'high',
  severityLabel: 'Severe',
  description: 'Previous detected dent',
  confidence: 0.92,
  coordinates: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  affectedArea: 'Vehicle Body',
  imageIndex: 0,
  urgency: 'Immediate',
  segmentation: { format: 'polygon', points: [], pointCount: 0 },
  detectedArea: { pixels: 100, percentage: 2.5, imageWidth: 1000, imageHeight: 1000 },
  affectedAreaPercent: 2.5,
  recommendation: 'Inspect the detected dent.',
};

const lineItem = {
  id: 'line-1',
  damageId: damage.id,
  serviceId: 'service-1',
  serviceName: 'Dent repair',
  description: 'Previous severe dent repair',
  affectedArea: damage.affectedArea,
  damageType: damage.damageSubtype,
  severity: damage.severity,
  urgency: damage.urgency,
  confidence: damage.confidence,
  subtotalMin: 1000,
  subtotalMax: 1500,
  formattedSubtotal: 'PHP 1,000 - PHP 1,500',
  color: '#EF4444',
  icon: 'alert-circle',
};

const integrationItem = {
  damageId: damage.id,
  type: damage.type,
  severity: damage.severity,
  confidence: damage.confidence,
  affectedArea: damage.affectedArea,
  detectedArea: damage.detectedArea,
};

const makeScan = (overrides = {}) => ({
  scanId: 'scan-with-damage',
  source: 'roboflow',
  model: 'rfdetr',
  vehicleDetected: true,
  noDamageDetected: false,
  overallCondition: 'Poor',
  recommendedPackage: 'SPF 89 Advanced',
  urgency: 'Immediate',
  summary: 'A severe dent was detected.',
  damages: [damage],
  estimate: {
    currency: 'PHP',
    lineItems: [lineItem],
    subtotal: 1000,
    subtotalMax: 1500,
    totalEstimate: 1500,
    formattedSubtotal: 'PHP 1,000',
    formattedTotal: 'PHP 1,500',
    recommendedPackage: {
      id: 'spf89',
      name: 'SPF 89 Advanced',
      tier: 'advanced',
      durationYears: 5,
      basePrice: 0,
      premiumPrice: 0,
      description: '',
      formattedPrice: '',
      color: '#F59E0B',
      icon: 'shield-outline',
    },
    savingsAmount: 0,
    formattedSavings: '',
    condition: 'Poor',
    urgency: 'Immediate',
    assumptions: [],
  },
  imageUrls: ['file:///scan.jpg'],
  angles: ['close_up'],
  createdAt: '2026-09-09T00:00:00.000Z',
  integration: {
    recommendation: [{ ...integrationItem, damageClass: damage.damageClass, recommendation: damage.recommendation }],
    costEstimation: [integrationItem],
    visualization3d: [{
      ...integrationItem,
      imageIndex: 0,
      coordinates: damage.coordinates,
      segmentation: damage.segmentation,
    }],
    ar: [{
      ...integrationItem,
      imageIndex: 0,
      coordinates: damage.coordinates,
      segmentation: damage.segmentation,
      recommendation: damage.recommendation,
    }],
  },
  ...overrides,
});

test('zero detections always present zero metrics, no severity, and the cautious message', () => {
  const presentation = getAiScanResultPresentation(
    makeScan({ noDamageDetected: false, damages: [] })
  );

  assert.equal(presentation.noDamageDetected, true);
  assert.equal(presentation.detectedIssues, 0);
  assert.equal(presentation.severeFindings, 0);
  assert.equal(presentation.detectionConfidence, 0);
  assert.equal(presentation.overallSeverity, null);
  assert.equal(
    presentation.message,
    'No confident damage detected. Try taking a closer photo of the affected area.'
  );
  assert.equal(presentation.message, ZERO_DETECTION_MESSAGE);
});

test('a damage result followed by zero detection clears stale damage details', () => {
  let currentScan = normalizeAiScanResult(makeScan());
  assert.equal(currentScan.damages[0]?.severityLabel, 'Severe');

  currentScan = normalizeAiScanResult(makeScan({
    scanId: 'scan-zero',
    noDamageDetected: true,
    summary: ZERO_DETECTION_MESSAGE,
  }));

  assert.equal(currentScan.noDamageDetected, true);
  assert.deepEqual(currentScan.damages, []);
  assert.deepEqual(currentScan.estimate.lineItems, []);
  assert.deepEqual(currentScan.integration.recommendation, []);
  assert.deepEqual(currentScan.integration.costEstimation, []);
  assert.deepEqual(currentScan.integration.visualization3d, []);
  assert.deepEqual(currentScan.integration.ar, []);

  const serialized = JSON.stringify(currentScan);
  assert.equal(serialized.includes('Severe'), false);
  assert.equal(serialized.includes('Dent'), false);
  assert.equal(serialized.includes('Unknown Vehicle Panel'), false);
});

test('an empty damages array normalizes the result even if the server flag is false', () => {
  const normalized = normalizeAiScanResult(makeScan({
    noDamageDetected: false,
    damages: [],
  }));

  assert.equal(normalized.noDamageDetected, true);
  assert.deepEqual(normalized.damages, []);
  assert.deepEqual(normalized.estimate.lineItems, []);
  assert.deepEqual(normalized.integration.ar, []);
});
