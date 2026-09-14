import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  assessImageQuality,
  computeSharpnessAndBrightness,
  getImageQualityConfig,
  normalizeCropToAspectRatio,
} from '../utils/imageQuality.utils.js';

const QUALITY_ENV_KEYS = [
  'AUTOGLOSS_IMAGE_QUALITY_ENABLED',
  'AUTOGLOSS_QUALITY_WORKING_EDGE',
  'AUTOGLOSS_BLUR_VARIANCE_THRESHOLD',
  'AUTOGLOSS_BRIGHTNESS_MIN',
  'AUTOGLOSS_BRIGHTNESS_MAX',
];

const withQualityEnv = async (values, operation) => {
  const previous = Object.fromEntries(QUALITY_ENV_KEYS.map((key) => [key, process.env[key]]));
  QUALITY_ENV_KEYS.forEach((key) => delete process.env[key]);
  Object.entries(values).forEach(([key, value]) => {
    process.env[key] = String(value);
  });
  try {
    return await operation();
  } finally {
    QUALITY_ENV_KEYS.forEach((key) => {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
};

const createFlatImage = (size, r, g, b) => sharp({
  create: { width: size, height: size, channels: 3, background: { r, g, b } },
}).jpeg().toBuffer();

const createCheckerboardImage = (size = 64, blockSize = 4) => {
  const channels = 3;
  const buffer = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const isEven = (Math.floor(x / blockSize) + Math.floor(y / blockSize)) % 2 === 0;
      const value = isEven ? 10 : 245;
      const idx = (y * size + x) * channels;
      buffer[idx] = value;
      buffer[idx + 1] = value;
      buffer[idx + 2] = value;
    }
  }
  return sharp(buffer, { raw: { width: size, height: size, channels } }).jpeg().toBuffer();
};

test('getImageQualityConfig() defaults and env overrides', async () => {
  const defaults = await withQualityEnv({}, async () => getImageQualityConfig());
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.blurVarianceThreshold, 60);
  assert.equal(defaults.brightnessMin, 35);
  assert.equal(defaults.brightnessMax, 225);

  const overridden = await withQualityEnv({
    AUTOGLOSS_IMAGE_QUALITY_ENABLED: 'false',
    AUTOGLOSS_BLUR_VARIANCE_THRESHOLD: '100',
    AUTOGLOSS_BRIGHTNESS_MIN: '50',
    AUTOGLOSS_BRIGHTNESS_MAX: '200',
  }, async () => getImageQualityConfig());
  assert.equal(overridden.enabled, false);
  assert.equal(overridden.blurVarianceThreshold, 100);
  assert.equal(overridden.brightnessMin, 50);
  assert.equal(overridden.brightnessMax, 200);
});

test('computeSharpnessAndBrightness: flat buffer has zero variance', async () => {
  const size = 32;
  const gray = Buffer.alloc(size * size, 128);
  const { blurScore, brightness } = await computeSharpnessAndBrightness(gray, size, size);
  assert.equal(blurScore, 0);
  assert.equal(brightness, 128);
});

test('computeSharpnessAndBrightness: high-frequency buffer has large variance', async () => {
  const size = 32;
  const gray = Buffer.alloc(size * size);
  for (let i = 0; i < gray.length; i += 1) gray[i] = i % 2 === 0 ? 10 : 245;
  const { blurScore } = await computeSharpnessAndBrightness(gray, size, size);
  assert.ok(blurScore > 1000, `expected high variance for checkerboard buffer, got ${blurScore}`);
});

test('assessImageQuality: sharp, well-lit image produces no warnings', async () => {
  const buffer = await createCheckerboardImage(64, 4);
  const result = await assessImageQuality(buffer);
  assert.equal(result.checked, true);
  assert.equal(typeof result.blurScore, 'number');
  assert.equal(typeof result.brightness, 'number');
  assert.equal(result.warnings.some((warning) => warning.code === 'IMAGE_TOO_BLURRY'), false);
});

test('assessImageQuality: flat/blurry image is flagged', async () => {
  const buffer = await createFlatImage(64, 120, 120, 120);
  const result = await assessImageQuality(buffer);
  assert.equal(result.checked, true);
  assert.equal(result.blurScore, 0);
  assert.ok(result.warnings.some((warning) => warning.code === 'IMAGE_TOO_BLURRY'));
});

test('assessImageQuality: dark image is flagged, does not throw or block', async () => {
  const buffer = await createFlatImage(64, 8, 8, 8);
  const result = await assessImageQuality(buffer);
  assert.equal(result.checked, true);
  assert.ok(result.brightness < 35);
  assert.ok(result.warnings.some((warning) => warning.code === 'IMAGE_TOO_DARK'));
});

test('assessImageQuality: overexposed image is flagged', async () => {
  const buffer = await createFlatImage(64, 250, 250, 250);
  const result = await assessImageQuality(buffer);
  assert.equal(result.checked, true);
  assert.ok(result.brightness > 225);
  assert.ok(result.warnings.some((warning) => warning.code === 'IMAGE_OVEREXPOSED'));
});

test('assessImageQuality: disabled config short-circuits with no warnings', async () => {
  const buffer = await createFlatImage(64, 5, 5, 5);
  const result = await assessImageQuality(buffer, { ...getImageQualityConfig(), enabled: false });
  assert.deepEqual(result, { checked: false, blurScore: null, brightness: null, warnings: [] });
});

test('assessImageQuality: never throws on an invalid buffer', async () => {
  const result = await assessImageQuality(Buffer.from('not an image'));
  assert.equal(result.checked, false);
  assert.equal(result.error, 'quality_check_failed');
  assert.deepEqual(result.warnings, []);
});

test('normalizeCropToAspectRatio: center-crops a landscape image to square', async () => {
  const buffer = await sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 50, g: 60, b: 70 } },
  }).jpeg().toBuffer();

  const cropped = await normalizeCropToAspectRatio(buffer, 1);
  const metadata = await sharp(cropped).metadata();
  assert.equal(metadata.width, metadata.height);
  assert.equal(metadata.width, 100);
});
