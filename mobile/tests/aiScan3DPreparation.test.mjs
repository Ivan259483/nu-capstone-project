import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AI_SCAN_ROUTES,
  createVehicle3DSourceImage,
  createVehicle3DSourcePatch,
  getAiResultDestination,
  getThreeDPreparationCopy,
  THREE_D_REQUIREMENTS,
  validateVehicle3DSourceImage,
} from '../src/features/ai-scan/threeDPreparation.ts';

const resultsSource = readFileSync(
  new URL('../src/app/(customer)/scan/results.tsx', import.meta.url),
  'utf8'
);
const preparationSource = readFileSync(
  new URL('../src/app/(customer)/scan/prepare-3d.tsx', import.meta.url),
  'utf8'
);
const arViewSource = readFileSync(
  new URL('../src/app/(customer)/scan/ar-view.tsx', import.meta.url),
  'utf8'
);
const estimateSource = readFileSync(
  new URL('../src/app/(customer)/scan/estimate.tsx', import.meta.url),
  'utf8'
);

const damageImage = {
  uri: 'file:///damage-close-up.jpg',
  fileName: 'damage-close-up.jpg',
  mimeType: 'image/jpeg',
  angle: 'close_up',
};

const fullVehicleImage = createVehicle3DSourceImage({
  uri: 'file:///full-vehicle.jpg',
  fileName: 'full-vehicle.jpg',
  mimeType: 'image/jpeg',
  width: 1600,
  height: 900,
  fileSize: 750_000,
});

test('AI result Skip to Cost Estimate keeps the existing estimate route', () => {
  assert.equal(getAiResultDestination('estimate'), AI_SCAN_ROUTES.estimate);
  assert.match(resultsSource, /secondaryLabel="Skip to Cost Estimate"/);
  assert.match(preparationSource, /secondaryLabel="Skip 3D and Continue to Estimate"/);
  assert.doesNotMatch(preparationSource, /onSecondaryPress=\{startAiScan3D/);
});

test('AI result Continue to 3D opens the preparation route', () => {
  assert.equal(getAiResultDestination('continue_3d'), AI_SCAN_ROUTES.prepare3d);
  assert.match(resultsSource, /primaryLabel="Continue to 3D"/);
});

test('Continue to 3D does not start model generation from the results screen', () => {
  assert.doesNotMatch(resultsSource, /startAiScan3D/);
  assert.match(preparationSource, /primaryLabel=\{copy\.generationLabel\}/);
  assert.match(arViewSource, /preferUploadedImages: true/);
  assert.match(estimateSource, /modelStatus !== 'idle'/);
});

test('3D preparation displays the full-vehicle requirements', () => {
  assert.deepEqual([...THREE_D_REQUIREMENTS], [
    'Full vehicle visible',
    'Good lighting',
    'Vehicle centered',
    'Avoid heavy glare or blur',
    'Do not crop major vehicle sections',
  ]);
  assert.match(preparationSource, /Damage close-up photos alone are not suitable/);
});

test('adding a 3D source patch preserves the original damage image and diagnosis', () => {
  const scan = { scanId: 'scan-123', damages: [{ id: 'damage-1', damageSubtype: 'Dent' }] };
  const before = { capturedImages: [damageImage], scan, modelStatus: 'idle' };
  const after = { ...before, ...createVehicle3DSourcePatch(fullVehicleImage) };

  assert.equal(after.capturedImages[0], damageImage);
  assert.equal(after.scan, scan);
  assert.equal(after.scan.scanId, 'scan-123');
});

test('selected full-vehicle image is stored separately from scan capture images', () => {
  const state = {
    capturedImages: [damageImage],
    ...createVehicle3DSourcePatch(fullVehicleImage),
  };

  assert.notEqual(state.vehicle3DSourceImage, state.capturedImages[0]);
  assert.equal(state.vehicle3DSourceImage.uri, 'file:///full-vehicle.jpg');
  assert.equal(state.capturedImages[0].uri, 'file:///damage-close-up.jpg');
});

test('preparation Back uses navigation history without resetting or rescanning', () => {
  assert.match(preparationSource, /onBack=\{\(\) => router\.back\(\)\}/);
  assert.doesNotMatch(preparationSource, /aiScanStore\.reset/);
  assert.doesNotMatch(preparationSource, /startAiScan|runAiScan|analyzing/);
});

test('zero-detection preparation is explicitly vehicle-only', () => {
  const copy = getThreeDPreparationCopy(true);
  assert.equal(copy.generationLabel, 'Generate Vehicle 3D Model');
  assert.match(copy.contextNote, /No AI-confirmed damage region/);
  assert.match(copy.contextNote, /^No .*damage region will be represented/i);
});

test('existing positive AI scan presentation remains on the results screen', () => {
  assert.match(resultsSource, /AI damage overlay/);
  assert.match(resultsSource, /Damage Detected/);
  assert.match(resultsSource, /activeDamage\.damageSubtype/);
  assert.match(resultsSource, /Affected image area/);
});

test('existing zero-detection presentation remains on the results screen', () => {
  assert.match(resultsSource, /ZERO_DETECTION_MESSAGE/);
  assert.match(resultsSource, /No AI damage overlay/);
  assert.match(resultsSource, /Vehicle-only 3D/);
});

test('readiness validation accepts a usable supported image', () => {
  assert.deepEqual(validateVehicle3DSourceImage(fullVehicleImage), { valid: true });
});

test('readiness validation rejects unreadable, undersized, and unsupported images', () => {
  assert.equal(validateVehicle3DSourceImage(null).valid, false);
  assert.equal(validateVehicle3DSourceImage({
    ...fullVehicleImage,
    width: 320,
    height: 240,
  }).valid, false);
  assert.equal(validateVehicle3DSourceImage({
    ...fullVehicleImage,
    mimeType: 'application/pdf',
  }).valid, false);
});
