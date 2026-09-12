import axios from 'axios';
import sharp from 'sharp';
import { buildDamageIssue, buildDamageReport } from '../models/damageReport.model.js';
import { timeOperation } from '../utils/performance.utils.js';
import { mapWithConcurrency } from '../utils/concurrency.utils.js';
import { getGuidedViewLabel } from '../constants/guidedViews.js';

const DEFAULT_WORKSPACE = 'ivan-tadena';
const DEFAULT_WORKFLOW_ID = 'autogloss-binary-damage-deployment-1787502823460';
const DEFAULT_API_ORIGIN = 'https://serverless.roboflow.com';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_MIN_CONFIDENCE = 0.36;
const DEFAULT_SUBTYPE_API_ORIGIN = DEFAULT_API_ORIGIN;
const DEFAULT_SUBTYPE_MODEL_ID = 'damage-classifier-o1i5b/3';
const DEFAULT_SUBTYPE_TIMEOUT_MS = 10_000;
const DEFAULT_SUBTYPE_MIN_CONFIDENCE = 0.60;
const DEFAULT_SUBTYPE_MIN_MARGIN = 0.15;
const MIN_SUBTYPE_CROP_EDGE = 12;
const MIN_SUBTYPE_CROP_AREA_RATIO = 0.001;
const BINARY_DAMAGE_CLASS = 'damage';

export const UNKNOWN_DAMAGE_SUBTYPE = 'Unknown Damage';
export const UNKNOWN_VEHICLE_PANEL = 'Unknown Vehicle Panel';

// `chipped_paint` is deliberately absent. The 2026-09-12 subtype calibration audit found the
// classifier returns `chipped_paint` for regions a human labelled Scratch / Scuff, including
// high-confidence, high-margin cases that neither acceptance gate can filter. Until that class
// confusion is resolved, it falls through to the unmapped branch and abstains as Unknown Damage.
// Restoring it requires new classifier evidence, not a threshold change.
const APPROVED_DAMAGE_SUBTYPES = Object.freeze({
  car_scratch: 'Scratch / Scuff',
  deep_car_scratch: 'Scratch / Scuff',
  scuffed_paint: 'Scratch / Scuff',
  car_dent: 'Dent',
  cracked_bumper: 'Crack',
});

export const ZERO_DETECTION_MESSAGE = 'No confident damage detected. Try taking a closer photo of the affected area.';

/* ── Multi-view guided inspection ──────────────────────────────────────────── */

/**
 * Guided views analyzed simultaneously. Deliberately a constant rather than an
 * environment knob: it bounds provider rate spikes, peak memory, and timeout
 * risk, and the value is asserted by tests.
 */
export const MULTI_VIEW_MAX_CONCURRENCY = 2;

/** Customer-facing text for a view the pipeline could not analyze. */
export const VIEW_ANALYSIS_FAILED_MESSAGE =
  'This view could not be analyzed. Please retake or upload it again.';

/** Cautious inspection-level wording. Never claims the vehicle has no damage. */
export const MULTI_VIEW_ZERO_DETECTION_MESSAGE =
  'No confident damage was detected across the analyzed vehicle views.';

/** Appended whenever a view failed, so failures are never read as clean. */
export const MULTI_VIEW_PARTIAL_FAILURE_MESSAGE =
  'Some views could not be analyzed and were not confirmed clean.';

/**
 * No cross-view deduplication is attempted. The application holds no
 * deterministic evidence that a region in one image is the same physical damage
 * as a region in another, so counts are reported as detected regions.
 */
export const CROSS_VIEW_DEDUPLICATION_POLICY = Object.freeze({
  applied: false,
  policy: 'not_supported',
  note: 'Regions are counted per view. The same physical damage visible in two views is reported twice and is not claimed to be unique.',
});

const buildInspectionSummaryMessage = (summary) => {
  const parts = [];
  if (summary.totalDetectedRegions === 0) {
    parts.push(MULTI_VIEW_ZERO_DETECTION_MESSAGE);
  } else {
    const regions = `${summary.totalDetectedRegions} damage region${summary.totalDetectedRegions === 1 ? '' : 's'}`;
    const views = `${summary.analyzedViews} analyzed view${summary.analyzedViews === 1 ? '' : 's'}`;
    parts.push(`${regions} detected across ${views} by RF-DETR instance segmentation.`);
  }
  if (summary.failedViews > 0) parts.push(MULTI_VIEW_PARTIAL_FAILURE_MESSAGE);
  return parts.join(' ');
};

export class RoboflowDamageError extends Error {
  constructor(message, code, status = 502, cause) {
    super(message, { cause });
    this.name = 'RoboflowDamageError';
    this.code = code;
    this.status = status;
  }
}

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

const buildModelEndpoint = (origin, modelId) => {
  const [project, version] = String(modelId || '').split('/');
  if (!project || !version) return '';
  return `${origin}/${encodeURIComponent(project)}/${encodeURIComponent(version)}`;
};

export const getRoboflowDamageConfig = () => {
  const workspace = String(process.env.ROBOFLOW_WORKSPACE || DEFAULT_WORKSPACE).trim();
  const workflowId = String(process.env.ROBOFLOW_WORKFLOW_ID || DEFAULT_WORKFLOW_ID).trim();
  const apiOrigin = String(process.env.ROBOFLOW_API_URL || DEFAULT_API_ORIGIN).trim().replace(/\/+$/, '');
  const endpointOverride = String(process.env.ROBOFLOW_WORKFLOW_ENDPOINT || '').trim();
  const subtypeApiOrigin = String(
    process.env.ROBOFLOW_SUBTYPE_API_URL || DEFAULT_SUBTYPE_API_ORIGIN
  ).trim().replace(/\/+$/, '');
  const subtypeModelId = String(
    process.env.ROBOFLOW_SUBTYPE_MODEL_ID || DEFAULT_SUBTYPE_MODEL_ID
  ).trim();
  const subtypeEndpointOverride = String(process.env.ROBOFLOW_SUBTYPE_ENDPOINT || '').trim();

  return {
    apiKey: String(process.env.ROBOFLOW_API_KEY || '').trim(),
    workspace,
    workflowId,
    imageInputName: String(process.env.ROBOFLOW_IMAGE_INPUT || 'image').trim(),
    endpoint: endpointOverride
      || `${apiOrigin}/infer/workflows/${encodeURIComponent(workspace)}/${encodeURIComponent(workflowId)}`,
    timeoutMs: numberFromEnv('ROBOFLOW_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, { min: 3_000, max: 60_000 }),
    maxImageEdge: numberFromEnv('ROBOFLOW_MAX_IMAGE_EDGE', DEFAULT_MAX_EDGE, { min: 640, max: 2400 }),
    minConfidence: numberFromEnv('ROBOFLOW_MIN_CONFIDENCE', DEFAULT_MIN_CONFIDENCE, { min: 0, max: 1 }),
    maxRetries: Math.round(numberFromEnv('ROBOFLOW_MAX_RETRIES', 1, { min: 0, max: 2 })),
    subtype: {
      enabled: booleanFromEnv('ROBOFLOW_SUBTYPE_ENABLED', true),
      modelId: subtypeModelId,
      endpoint: subtypeEndpointOverride || buildModelEndpoint(subtypeApiOrigin, subtypeModelId),
      timeoutMs: numberFromEnv(
        'ROBOFLOW_SUBTYPE_TIMEOUT_MS',
        DEFAULT_SUBTYPE_TIMEOUT_MS,
        { min: 3_000, max: 30_000 }
      ),
      // These are approval gates, not deployment tuning knobs.
      minConfidence: DEFAULT_SUBTYPE_MIN_CONFIDENCE,
      minMargin: DEFAULT_SUBTYPE_MIN_MARGIN,
    },
  };
};

export const isRoboflowDamageConfigured = () => Boolean(getRoboflowDamageConfig().apiKey);

const looksLikePrediction = (value) => value && typeof value === 'object'
  && (value.class != null || value.class_name != null || value.label != null)
  && (value.confidence != null || value.score != null)
  && (
    value.points != null
    || value.x != null
    || value.width != null
    || value.bbox != null
    || value.bounding_box != null
  );

const resolveDimensions = (container = {}, fallback = {}) => ({
  width: Number(container?.image?.width || container?.width || fallback.width) || 1,
  height: Number(container?.image?.height || container?.height || fallback.height) || 1,
});

const toPoint = (point) => {
  if (Array.isArray(point)) return { x: Number(point[0]) || 0, y: Number(point[1]) || 0 };
  return { x: Number(point?.x) || 0, y: Number(point?.y) || 0 };
};

const extractPoints = (prediction) => {
  const candidate = prediction.points
    || prediction.polygon
    || prediction.segmentation?.points
    || prediction.mask?.points
    || [];
  const points = Array.isArray(candidate) && Array.isArray(candidate[0]) && candidate[0]?.length > 2
    ? candidate[0]
    : candidate;
  return Array.isArray(points) ? points.map(toPoint) : [];
};

const toPixelPoints = (points, dimensions) => {
  const likelyNormalized = points.length > 0
    && points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
  if (!likelyNormalized) return points;
  return points.map((point) => ({
    x: point.x * dimensions.width,
    y: point.y * dimensions.height,
  }));
};

const toPixelBoundingBox = (prediction, dimensions) => {
  const raw = prediction.bbox || prediction.bounding_box || {};
  let width = Number(raw.width ?? prediction.width) || 0;
  let height = Number(raw.height ?? prediction.height) || 0;
  let x = Number(raw.x ?? prediction.x) || 0;
  let y = Number(raw.y ?? prediction.y) || 0;

  const likelyNormalized = width <= 1 && height <= 1 && x <= 1 && y <= 1;
  if (likelyNormalized) {
    width *= dimensions.width;
    height *= dimensions.height;
    x *= dimensions.width;
    y *= dimensions.height;
  }

  const isTopLeft = raw.xmin != null || raw.left != null || prediction.xmin != null;
  if (raw.xmin != null || prediction.xmin != null) x = Number(raw.xmin ?? prediction.xmin) || 0;
  if (raw.ymin != null || prediction.ymin != null) y = Number(raw.ymin ?? prediction.ymin) || 0;

  // Roboflow inference predictions use center x/y unless explicit xmin/ymin fields exist.
  if (!isTopLeft) {
    x -= width / 2;
    y -= height / 2;
  }

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.max(0, Math.min(dimensions.width - Math.max(0, x), width)),
    height: Math.max(0, Math.min(dimensions.height - Math.max(0, y), height)),
  };
};

/**
 * Workflows return an `outputs` array whose keys are chosen in the Workflow editor.
 * This parser deliberately walks those named outputs and accepts both the standard
 * `{ predictions: [...] }` and nested inference result representations.
 */
export const parseRoboflowWorkflowResponse = (payload, context = {}) => {
  const found = [];
  const visited = new Set();

  const visit = (value, dimensions = context) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);

    const nextDimensions = resolveDimensions(value, dimensions);
    if (Array.isArray(value)) {
      if (value.length && value.every(looksLikePrediction)) {
        value.forEach((prediction) => found.push({ prediction, dimensions: nextDimensions }));
        return;
      }
      value.forEach((entry) => visit(entry, nextDimensions));
      return;
    }

    Object.values(value).forEach((entry) => visit(entry, nextDimensions));
  };

  visit(payload, context);

  const deduplicated = [];
  const seen = new Set();
  for (const item of found) {
    const prediction = item.prediction;
    const identity = String(prediction.detection_id || prediction.id || [
      prediction.class || prediction.class_name || prediction.label,
      prediction.confidence || prediction.score,
      prediction.x,
      prediction.y,
      prediction.width,
      prediction.height,
    ].join(':'));
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduplicated.push({
      ...prediction,
      points: toPixelPoints(extractPoints(prediction), item.dimensions),
      boundingBox: toPixelBoundingBox(prediction, item.dimensions),
      imageWidth: item.dimensions.width,
      imageHeight: item.dimensions.height,
    });
  }
  return deduplicated;
};

const optimizeImage = async (file, maxImageEdge) => {
  if (!file?.buffer?.length) {
    throw new RoboflowDamageError('The uploaded image is empty.', 'INVALID_IMAGE', 400);
  }

  try {
    const pipeline = sharp(file.buffer, { failOn: 'warning', limitInputPixels: 40_000_000 }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'heif', 'avif'].includes(metadata.format)) {
      throw new Error('Unsupported or undecodable image.');
    }

    const optimized = await pipeline
      .resize({ width: maxImageEdge, height: maxImageEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: optimized.data,
      width: optimized.info.width,
      height: optimized.info.height,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    throw new RoboflowDamageError(
      'The uploaded file is not a valid supported image.',
      'INVALID_IMAGE',
      400,
      error
    );
  }
};

const emptySubtypeAnalysis = (reason, overrides = {}) => ({
  accepted: false,
  rawClass: null,
  top1Confidence: null,
  top2Class: null,
  top2Confidence: null,
  margin: null,
  reason,
  ...overrides,
});

const findClassifierPredictions = (payload) => {
  const visited = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);

    if (Array.isArray(value.predictions)) {
      return value.predictions;
    }

    const entries = Array.isArray(value) ? value : Object.values(value);
    for (const entry of entries) {
      const result = visit(entry);
      if (result) return result;
    }
    return null;
  };
  return visit(payload);
};

export const analyzeDamageSubtype = (payload, thresholds = {}) => {
  const predictions = findClassifierPredictions(payload);
  if (!predictions) return emptySubtypeAnalysis('classifier_output_malformed');

  const ranked = predictions
    .map((prediction) => {
      const rawConfidence = prediction?.confidence ?? prediction?.score;
      return {
        className: prediction?.class ?? prediction?.class_name ?? prediction?.label,
        confidence: typeof rawConfidence === 'string' && !rawConfidence.trim()
          ? Number.NaN
          : Number(rawConfidence),
      };
    })
    .filter((score) => (
      typeof score.className === 'string'
      && score.className.trim()
      && Number.isFinite(score.confidence)
      && score.confidence >= 0
      && score.confidence <= 1
    ))
    .map((score) => ({ ...score, className: score.className.trim() }))
    .sort((left, right) => right.confidence - left.confidence);

  if (ranked.length < 2) {
    return emptySubtypeAnalysis('classifier_output_malformed');
  }

  const [top1, top2] = ranked;
  const margin = top1.confidence - top2.confidence;
  const details = {
    rawClass: top1.className,
    top1Confidence: Number(top1.confidence.toFixed(4)),
    top2Class: top2.className,
    top2Confidence: Number(top2.confidence.toFixed(4)),
    margin: Number(margin.toFixed(4)),
  };
  const minConfidence = Number.isFinite(Number(thresholds.minConfidence))
    ? Number(thresholds.minConfidence)
    : DEFAULT_SUBTYPE_MIN_CONFIDENCE;
  const minMargin = Number.isFinite(Number(thresholds.minMargin))
    ? Number(thresholds.minMargin)
    : DEFAULT_SUBTYPE_MIN_MARGIN;

  if (top1.confidence < minConfidence) {
    return emptySubtypeAnalysis('top1_below_confidence', details);
  }
  if (margin < minMargin) {
    return emptySubtypeAnalysis('margin_below_threshold', details);
  }

  const damageSubtype = APPROVED_DAMAGE_SUBTYPES[top1.className];
  if (!damageSubtype) {
    return emptySubtypeAnalysis('unmapped_classifier_label', details);
  }

  return {
    accepted: true,
    ...details,
    reason: 'accepted',
    damageSubtype,
  };
};

export const assessSubtypeLocalization = (prediction, dimensions, minConfidence = DEFAULT_MIN_CONFIDENCE) => {
  const predictionClass = String(
    prediction?.class || prediction?.class_name || prediction?.label || ''
  ).trim().toLowerCase();
  const confidence = Number(prediction?.confidence ?? prediction?.score);
  if (predictionClass !== BINARY_DAMAGE_CLASS || !Number.isFinite(confidence) || confidence < minConfidence) {
    return { credible: false, reason: 'localization_not_credible' };
  }

  const imageWidth = Number(dimensions?.width);
  const imageHeight = Number(dimensions?.height);
  const box = prediction?.boundingBox || {};
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  const points = Array.isArray(prediction?.points) ? prediction.points : [];
  if (
    ![imageWidth, imageHeight, x, y, width, height].every(Number.isFinite)
    || imageWidth <= 0
    || imageHeight <= 0
    || width <= 0
    || height <= 0
    || x < 0
    || y < 0
    || x + width > imageWidth + 0.5
    || y + height > imageHeight + 0.5
    || points.length < 3
    || points.some((point) => !Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y)))
  ) {
    return { credible: false, reason: 'invalid_localization' };
  }

  const areaRatio = (width * height) / (imageWidth * imageHeight);
  if (width < MIN_SUBTYPE_CROP_EDGE || height < MIN_SUBTYPE_CROP_EDGE || areaRatio < MIN_SUBTYPE_CROP_AREA_RATIO) {
    return { credible: false, reason: 'tiny_localization' };
  }

  const touchesBorder = x <= 0.5
    || y <= 0.5
    || x + width >= imageWidth - 0.5
    || y + height >= imageHeight - 0.5;
  if (touchesBorder) {
    return { credible: false, reason: 'border_clipped_localization' };
  }

  return { credible: true, reason: 'credible_localization' };
};

const cropDamageRegion = async (image, prediction) => {
  const box = prediction.boundingBox;
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(image.width, Math.ceil(box.x + box.width));
  const bottom = Math.min(image.height, Math.ceil(box.y + box.height));
  if (right <= left || bottom <= top) return null;
  return sharp(image.buffer)
    .extract({ left, top, width: right - left, height: bottom - top })
    .jpeg({ quality: 90 })
    .toBuffer();
};

const executeSubtypeClassifier = async (cropBuffer, apiKey, config) => {
  const response = await axios.post(
    config.endpoint,
    cropBuffer.toString('base64'),
    {
      // Hosted classification defaults can filter out low-scoring classes.
      // Request the full score list; the fixed acceptance gates below still decide whether to abstain.
      params: { api_key: apiKey, confidence: 0 },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: config.timeoutMs,
      maxBodyLength: 6 * 1024 * 1024,
      maxContentLength: 2 * 1024 * 1024,
    }
  );
  return response.data;
};

const enrichPredictionSubtype = async (prediction, image, config) => {
  const localization = assessSubtypeLocalization(prediction, image, config.minConfidence);
  if (!localization.credible) {
    return {
      damageSubtype: UNKNOWN_DAMAGE_SUBTYPE,
      component: UNKNOWN_VEHICLE_PANEL,
      subtypeAnalysis: emptySubtypeAnalysis(localization.reason),
    };
  }
  if (!config.subtype.enabled || !config.subtype.endpoint) {
    return {
      damageSubtype: UNKNOWN_DAMAGE_SUBTYPE,
      component: UNKNOWN_VEHICLE_PANEL,
      subtypeAnalysis: emptySubtypeAnalysis('subtype_enrichment_disabled'),
    };
  }

  try {
    const cropBuffer = await cropDamageRegion(image, prediction);
    if (!cropBuffer) {
      return {
        damageSubtype: UNKNOWN_DAMAGE_SUBTYPE,
        component: UNKNOWN_VEHICLE_PANEL,
        subtypeAnalysis: emptySubtypeAnalysis('invalid_localization'),
      };
    }
    const payload = await executeSubtypeClassifier(cropBuffer, config.apiKey, config.subtype);
    const subtypeAnalysis = analyzeDamageSubtype(payload, config.subtype);
    return {
      damageSubtype: subtypeAnalysis.accepted
        ? subtypeAnalysis.damageSubtype
        : UNKNOWN_DAMAGE_SUBTYPE,
      component: UNKNOWN_VEHICLE_PANEL,
      subtypeAnalysis: {
        accepted: subtypeAnalysis.accepted,
        rawClass: subtypeAnalysis.rawClass,
        top1Confidence: subtypeAnalysis.top1Confidence,
        top2Class: subtypeAnalysis.top2Class,
        top2Confidence: subtypeAnalysis.top2Confidence,
        margin: subtypeAnalysis.margin,
        reason: subtypeAnalysis.reason,
      },
    };
  } catch {
    return {
      damageSubtype: UNKNOWN_DAMAGE_SUBTYPE,
      component: UNKNOWN_VEHICLE_PANEL,
      subtypeAnalysis: emptySubtypeAnalysis('classifier_request_failed'),
    };
  }
};

const shouldRetry = (error) => {
  const status = Number(error?.response?.status) || 0;
  return error?.code === 'ECONNRESET'
    || error?.code === 'ECONNABORTED'
    || error?.code === 'ETIMEDOUT'
    || status === 429
    || status >= 500;
};

const executeWorkflow = async (image, config) => {
  let lastError;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(
        config.endpoint,
        {
          inputs: {
            [config.imageInputName]: { type: 'base64', value: image.buffer.toString('base64') },
          },
          // The mobile app renders the returned polygons over its local image.
          // Excluding the Workflow's annotated image avoids returning a duplicate
          // base64 image from Roboflow to this server.
          excluded_fields: ['output_image'],
          enable_profiling: false,
          use_cache: true,
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: config.timeoutMs,
          maxBodyLength: 12 * 1024 * 1024,
          maxContentLength: 8 * 1024 * 1024,
        }
      );
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxRetries || !shouldRetry(error)) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  if (lastError?.code === 'ECONNABORTED' || lastError?.code === 'ETIMEDOUT') {
    throw new RoboflowDamageError('Roboflow damage detection timed out.', 'ROBOFLOW_TIMEOUT', 504, lastError);
  }
  const upstreamStatus = Number(lastError?.response?.status) || 0;
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    throw new RoboflowDamageError('Roboflow rejected the server credentials.', 'ROBOFLOW_AUTH_FAILED', 503, lastError);
  }
  throw new RoboflowDamageError('Roboflow damage detection is temporarily unavailable.', 'ROBOFLOW_REQUEST_FAILED', 502, lastError);
};

/**
 * Analyze ONE image through the production pipeline: optimize -> RF-DETR
 * Workflow -> region parsing -> localization quality gate -> optional subtype
 * classifier -> subtype abstention -> normalized damage issues.
 *
 * This is the single implementation of the detector. Both the existing
 * single-request `detectDamageWithRoboflow` and the multi-view
 * `detectDamageAcrossViews` call it, so the two paths cannot drift apart.
 *
 * `regionConcurrency` bounds the per-region subtype classifier calls within
 * this image. The existing path passes Infinity to preserve its exact
 * behaviour; the multi-view path bounds it.
 */
const analyzeImageForDamage = async (file, config, context = {}) => {
  const {
    imageIndex = 0,
    metricLabel = `image.${imageIndex + 1}`,
    angleHint = 'close_up',
    damageAreaHint = '',
    regionConcurrency = Infinity,
    req,
    res,
  } = context;

  const image = await timeOperation(
    { req, res, kind: 'cpu', name: `roboflow.${metricLabel}.optimize` },
    () => optimizeImage(file, config.maxImageEdge)
  );

  const payload = await timeOperation(
    { req, res, kind: 'external', name: `roboflow.${metricLabel}.workflow` },
    () => executeWorkflow(image, config)
  );

  const predictions = parseRoboflowWorkflowResponse(payload, image)
    .filter((prediction) => {
      const predictionClass = String(
        prediction.class || prediction.class_name || prediction.label || ''
      ).trim().toLowerCase();
      const confidence = Number(prediction.confidence ?? prediction.score);
      return predictionClass === BINARY_DAMAGE_CLASS && confidence >= config.minConfidence;
    });

  const issues = await mapWithConcurrency(
    predictions,
    regionConcurrency,
    async (prediction, index) => {
      const enrichment = await enrichPredictionSubtype(prediction, image, config);
      return buildDamageIssue(prediction, {
        imageIndex,
        index,
        imageWidth: prediction.imageWidth || image.width,
        imageHeight: prediction.imageHeight || image.height,
        angleHint,
        damageAreaHint,
        ...enrichment,
      });
    }
  );

  return {
    issues,
    imageProcessing: {
      imageIndex,
      width: image.width,
      height: image.height,
      bytes: image.buffer.length,
      mimeType: image.mimeType,
    },
  };
};

/** Shared severity-derived headline fields so both paths report identically. */
const summarizeIssues = (issues, damageReport) => {
  const severity = damageReport.highestSeverity;
  return {
    overallCondition: !issues.length
      ? 'Excellent'
      : severity === 'high' ? 'Poor' : severity === 'medium' ? 'Fair' : 'Good',
    recommendedPackage: severity === 'high'
      ? 'SPF 99 Premium'
      : severity === 'medium' ? 'SPF 89 Advanced' : 'SPF 80 Essential',
    urgency: severity === 'high'
      ? 'Immediate'
      : severity === 'medium' ? 'Can Wait' : 'Optional',
  };
};

export const detectDamageWithRoboflow = async (files, options = {}) => {
  const config = getRoboflowDamageConfig();
  if (!config.apiKey) {
    throw new RoboflowDamageError('Roboflow damage detection is not configured.', 'ROBOFLOW_NOT_CONFIGURED', 503);
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new RoboflowDamageError('At least one vehicle image is required.', 'IMAGE_REQUIRED', 400);
  }

  // Unbounded on purpose: this is the long-standing single-request behaviour of
  // POST /api/ai/scan and the web client depends on it. The multi-view path
  // below is where bounded concurrency applies.
  const analyzed = await Promise.all(files.map((file, index) => analyzeImageForDamage(file, config, {
    imageIndex: index,
    metricLabel: `image.${index + 1}`,
    angleHint: options.angles?.[index] || 'close_up',
    damageAreaHint: options.damageAreas?.[index] || '',
    regionConcurrency: Infinity,
    req: options.req,
    res: options.res,
  })));

  const issues = analyzed.flatMap((entry) => entry.issues);
  const requestId = options.requestId || `roboflow_${Date.now()}`;
  const model = `roboflow-workflow:${config.workflowId}`;
  const damageReport = buildDamageReport({ issues, requestId, model });

  return {
    source: 'roboflow',
    model,
    requestId,
    vehicleDetected: true,
    noDamageDetected: issues.length === 0,
    ...summarizeIssues(issues, damageReport),
    summary: issues.length
      ? `${issues.length} damage region${issues.length === 1 ? '' : 's'} detected by RF-DETR instance segmentation.`
      : ZERO_DETECTION_MESSAGE,
    damages: issues,
    damageReport,
    imageProcessing: analyzed.map((entry) => entry.imageProcessing),
  };
};

/**
 * Analyze several guided vehicle views as INDEPENDENT inference inputs.
 *
 * Images are never stitched and never sent as one detector input. Each view
 * goes through `analyzeImageForDamage` exactly as a single scan would, under
 * bounded concurrency, and a failing view degrades to a retake request instead
 * of failing the whole inspection.
 *
 * @param {{ file: object, viewId: string, label?: string, index?: number, damageAreaHint?: string }[]} views
 */
export const detectDamageAcrossViews = async (views, options = {}) => {
  const config = getRoboflowDamageConfig();
  if (!config.apiKey) {
    throw new RoboflowDamageError('Roboflow damage detection is not configured.', 'ROBOFLOW_NOT_CONFIGURED', 503);
  }
  if (!Array.isArray(views) || views.length === 0) {
    throw new RoboflowDamageError('At least one vehicle image is required.', 'IMAGE_REQUIRED', 400);
  }

  const requestId = options.requestId || `roboflow_inspection_${Date.now()}`;
  const model = `roboflow-workflow:${config.workflowId}`;

  const analyzed = await mapWithConcurrency(
    views,
    MULTI_VIEW_MAX_CONCURRENCY,
    async (view, position) => {
      const index = Number.isFinite(view.index) ? Number(view.index) : position;
      const viewId = String(view.viewId || '');
      const label = String(view.label || getGuidedViewLabel(viewId));
      const sourceView = { id: viewId, label, index };

      try {
        const { issues, imageProcessing } = await analyzeImageForDamage(view.file, config, {
          imageIndex: index,
          metricLabel: `view.${viewId || index + 1}`,
          angleHint: viewId || 'close_up',
          damageAreaHint: view.damageAreaHint || '',
          regionConcurrency: MULTI_VIEW_MAX_CONCURRENCY,
          req: options.req,
          res: options.res,
        });

        // Additive only — every existing damage field is preserved.
        const damages = issues.map((issue) => ({ ...issue, sourceView }));

        return {
          viewId,
          label,
          index,
          success: true,
          errorCode: '',
          message: '',
          noDamageDetected: damages.length === 0,
          damages,
          imageProcessing,
        };
      } catch (error) {
        // Customer-facing text never leaks upstream provider detail. The stable
        // `errorCode` is already part of the public single-scan contract.
        return {
          viewId,
          label,
          index,
          success: false,
          errorCode: String(error?.code || 'VIEW_ANALYSIS_FAILED'),
          message: VIEW_ANALYSIS_FAILED_MESSAGE,
          noDamageDetected: false,
          damages: [],
          imageProcessing: null,
          error,
        };
      }
    }
  );

  const successfulViews = analyzed.filter((view) => view.success);

  // Every view failing is not partial success. Rethrow so the HTTP status and
  // stable code match the existing single-scan semantics and the client retries.
  if (successfulViews.length === 0) {
    const firstError = analyzed.find((view) => view.error)?.error;
    if (firstError instanceof RoboflowDamageError) throw firstError;
    throw new RoboflowDamageError(
      'Roboflow damage detection is temporarily unavailable.',
      'ROBOFLOW_REQUEST_FAILED',
      502,
      firstError
    );
  }

  const issues = analyzed.flatMap((view) => view.damages);
  const damageReport = buildDamageReport({ issues, requestId, model });
  const failedViews = analyzed.length - successfulViews.length;
  const viewsWithDamage = successfulViews.filter((view) => view.damages.length > 0).length;

  const inspectionSummary = {
    requestedViews: analyzed.length,
    analyzedViews: successfulViews.length,
    successfulViews: successfulViews.length,
    failedViews,
    viewsWithDamage,
    // A region count across views, NOT a unique-damage count. The same physical
    // scratch photographed from two angles legitimately produces two regions.
    totalDetectedRegions: issues.length,
  };

  return {
    source: 'roboflow',
    model,
    requestId,
    vehicleDetected: true,
    // Only the successfully analyzed views can be described as clean. A failed
    // view is never folded into this flag.
    noDamageDetected: issues.length === 0,
    ...summarizeIssues(issues, damageReport),
    summary: buildInspectionSummaryMessage(inspectionSummary),
    damages: issues,
    damageReport,
    imageProcessing: successfulViews
      .map((view) => view.imageProcessing)
      .filter(Boolean),
    inspectionSummary,
    views: analyzed.map(({ error, imageProcessing, ...view }) => view),
    crossViewDeduplication: CROSS_VIEW_DEDUPLICATION_POLICY,
  };
};

export default {
  detectDamageWithRoboflow,
  detectDamageAcrossViews,
  getRoboflowDamageConfig,
  isRoboflowDamageConfigured,
  parseRoboflowWorkflowResponse,
  analyzeDamageSubtype,
  assessSubtypeLocalization,
};
