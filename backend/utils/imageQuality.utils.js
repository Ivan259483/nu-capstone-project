import sharp from 'sharp';
import cvReadyPromise from '@techstark/opencv-js';

/**
 * OpenCV-based input-quality validation for AutoGloss uploads. This module is
 * advisory only: it never throws and never changes what gets sent to
 * Roboflow. It runs alongside (not before) the existing `optimizeImage`
 * resize/reencode step in roboflowDamage.service.js and attaches warnings the
 * caller can surface to the user.
 */

const DEFAULT_WORKING_EDGE = 640;
const DEFAULT_BLUR_VARIANCE_THRESHOLD = 60;
const DEFAULT_BRIGHTNESS_MIN = 35;
const DEFAULT_BRIGHTNESS_MAX = 225;

const numberFromEnv = (name, fallback, { min, max } = {}) => {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min ?? parsed, Math.min(max ?? parsed, parsed));
};

const booleanFromEnv = (name, fallback) => {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
};

export const getImageQualityConfig = () => ({
  enabled: booleanFromEnv('AUTOGLOSS_IMAGE_QUALITY_ENABLED', true),
  workingEdge: numberFromEnv('AUTOGLOSS_QUALITY_WORKING_EDGE', DEFAULT_WORKING_EDGE, { min: 128, max: 1280 }),
  blurVarianceThreshold: numberFromEnv(
    'AUTOGLOSS_BLUR_VARIANCE_THRESHOLD',
    DEFAULT_BLUR_VARIANCE_THRESHOLD,
    { min: 0, max: 1000 }
  ),
  brightnessMin: numberFromEnv('AUTOGLOSS_BRIGHTNESS_MIN', DEFAULT_BRIGHTNESS_MIN, { min: 0, max: 255 }),
  brightnessMax: numberFromEnv('AUTOGLOSS_BRIGHTNESS_MAX', DEFAULT_BRIGHTNESS_MAX, { min: 0, max: 255 }),
});

// The WASM runtime is loaded once per process and reused for every request.
let cvPromise = null;
const loadOpenCv = () => {
  if (!cvPromise) cvPromise = cvReadyPromise;
  return cvPromise;
};

/**
 * Laplacian-variance sharpness (classic OpenCV blur metric) and mean pixel
 * brightness from a single-channel (grayscale) raw buffer.
 */
export const computeSharpnessAndBrightness = async (grayBuffer, width, height) => {
  const cv = await loadOpenCv();
  const gray = cv.matFromArray(height, width, cv.CV_8UC1, grayBuffer);
  const laplacian = new cv.Mat();
  const lapMean = new cv.Mat();
  const lapStd = new cv.Mat();
  const grayMean = new cv.Mat();
  const grayStd = new cv.Mat();
  try {
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    cv.meanStdDev(laplacian, lapMean, lapStd);
    cv.meanStdDev(gray, grayMean, grayStd);
    return {
      blurScore: lapStd.data64F[0] ** 2,
      brightness: grayMean.data64F[0],
    };
  } finally {
    gray.delete();
    laplacian.delete();
    lapMean.delete();
    lapStd.delete();
    grayMean.delete();
    grayStd.delete();
  }
};

/**
 * Quality-validate an already-decoded image buffer (JPEG/PNG/etc). Never
 * throws and never blocks the caller: a poor-quality photo still reaches
 * Roboflow, with `warnings` describing what a retake could improve.
 */
export const assessImageQuality = async (buffer, config = getImageQualityConfig()) => {
  if (!config.enabled) {
    return { checked: false, blurScore: null, brightness: null, warnings: [] };
  }

  try {
    const { data, info } = await sharp(buffer)
      .greyscale()
      .resize({
        width: config.workingEdge,
        height: config.workingEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { blurScore, brightness } = await computeSharpnessAndBrightness(data, info.width, info.height);

    const warnings = [];
    if (blurScore < config.blurVarianceThreshold) {
      warnings.push({
        code: 'IMAGE_TOO_BLURRY',
        message: 'This photo looks a little blurry. For the most accurate damage detection, hold the camera steady and make sure the area is in focus.',
      });
    }
    if (brightness < config.brightnessMin) {
      warnings.push({
        code: 'IMAGE_TOO_DARK',
        message: 'This photo looks quite dark. Try retaking it in better lighting or with flash on.',
      });
    } else if (brightness > config.brightnessMax) {
      warnings.push({
        code: 'IMAGE_OVEREXPOSED',
        message: 'This photo looks overexposed. Try retaking it out of direct glare or bright light.',
      });
    }

    return {
      checked: true,
      blurScore: Number(blurScore.toFixed(2)),
      brightness: Number(brightness.toFixed(2)),
      warnings,
    };
  } catch (error) {
    return {
      checked: false,
      blurScore: null,
      brightness: null,
      warnings: [],
      error: 'quality_check_failed',
    };
  }
};

/**
 * Optional center-crop to a target aspect ratio (defaults to square). Not
 * called anywhere in the detection pipeline by default: cropping the frame
 * Roboflow sees would change what the model can detect, so this stays an
 * opt-in utility rather than being baked into `optimizeImage`.
 */
export const normalizeCropToAspectRatio = async (buffer, targetAspectRatio = 1) => {
  const { width, height } = await sharp(buffer).metadata();
  if (!width || !height) return buffer;

  const currentRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;
  if (currentRatio > targetAspectRatio) {
    cropWidth = Math.round(height * targetAspectRatio);
  } else if (currentRatio < targetAspectRatio) {
    cropHeight = Math.round(width / targetAspectRatio);
  }

  const left = Math.floor((width - cropWidth) / 2);
  const top = Math.floor((height - cropHeight) / 2);
  return sharp(buffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toBuffer();
};
