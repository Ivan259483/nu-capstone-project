import axios from 'axios';
import sharp from 'sharp';
import { buildDamageIssue, buildDamageReport } from '../models/damageReport.model.js';
import { timeOperation } from '../utils/performance.utils.js';

const DEFAULT_WORKSPACE = 'ivan-tadena';
const DEFAULT_WORKFLOW_ID = 'vehicle-damage-dataset-vvehicle-damage-dataset-le164-1-yolo11s-seg-t1-logic';
const DEFAULT_API_ORIGIN = 'https://serverless.roboflow.com';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_MIN_CONFIDENCE = 0.2;

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

export const getRoboflowDamageConfig = () => {
  const workspace = String(process.env.ROBOFLOW_WORKSPACE || DEFAULT_WORKSPACE).trim();
  const workflowId = String(process.env.ROBOFLOW_WORKFLOW_ID || DEFAULT_WORKFLOW_ID).trim();
  const apiOrigin = String(process.env.ROBOFLOW_API_URL || DEFAULT_API_ORIGIN).trim().replace(/\/+$/, '');
  const endpointOverride = String(process.env.ROBOFLOW_WORKFLOW_ENDPOINT || '').trim();

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

const shouldRetry = (error) => {
  const status = Number(error?.response?.status) || 0;
  return error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || status === 429 || status >= 500;
};

const executeWorkflow = async (image, config) => {
  let lastError;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(
        config.endpoint,
        {
          api_key: config.apiKey,
          inputs: {
            [config.imageInputName]: { type: 'base64', value: image.buffer.toString('base64') },
          },
          use_cache: true,
        },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

export const detectDamageWithRoboflow = async (files, options = {}) => {
  const config = getRoboflowDamageConfig();
  if (!config.apiKey) {
    throw new RoboflowDamageError('Roboflow damage detection is not configured.', 'ROBOFLOW_NOT_CONFIGURED', 503);
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new RoboflowDamageError('At least one vehicle image is required.', 'IMAGE_REQUIRED', 400);
  }

  const optimizedImages = await Promise.all(files.map((file, index) => timeOperation(
    { req: options.req, res: options.res, kind: 'cpu', name: `roboflow.image.${index + 1}.optimize` },
    () => optimizeImage(file, config.maxImageEdge)
  )));
  const workflowResults = await Promise.all(optimizedImages.map((image, index) => timeOperation(
    { req: options.req, res: options.res, kind: 'external', name: `roboflow.image.${index + 1}.workflow` },
    () => executeWorkflow(image, config)
  )));
  const issues = [];

  workflowResults.forEach((payload, imageIndex) => {
    const image = optimizedImages[imageIndex];
    const predictions = parseRoboflowWorkflowResponse(payload, image)
      .filter((prediction) => Number(prediction.confidence ?? prediction.score) >= config.minConfidence);

    predictions.forEach((prediction, index) => {
      issues.push(buildDamageIssue(prediction, {
        imageIndex,
        index,
        imageWidth: prediction.imageWidth || image.width,
        imageHeight: prediction.imageHeight || image.height,
        angleHint: options.angles?.[imageIndex] || 'close_up',
        damageAreaHint: options.damageAreas?.[imageIndex] || '',
      }));
    });
  });

  const requestId = options.requestId || `roboflow_${Date.now()}`;
  const model = `roboflow-workflow:${config.workflowId}`;
  const damageReport = buildDamageReport({ issues, requestId, model });
  const severity = damageReport.highestSeverity;

  return {
    source: 'roboflow',
    model,
    requestId,
    vehicleDetected: true,
    noDamageDetected: issues.length === 0,
    overallCondition: !issues.length ? 'Excellent' : severity === 'high' ? 'Poor' : severity === 'medium' ? 'Fair' : 'Good',
    recommendedPackage: severity === 'high' ? 'SPF 99 Premium' : severity === 'medium' ? 'SPF 89 Advanced' : 'SPF 80 Essential',
    urgency: severity === 'high' ? 'Immediate' : severity === 'medium' ? 'Can Wait' : 'Optional',
    summary: issues.length
      ? `${issues.length} vehicle damage area${issues.length === 1 ? '' : 's'} detected by YOLO11 instance segmentation.`
      : 'No damage predictions met the configured confidence threshold.',
    damages: issues,
    damageReport,
    imageProcessing: optimizedImages.map((image, index) => ({
      imageIndex: index,
      width: image.width,
      height: image.height,
      bytes: image.buffer.length,
      mimeType: image.mimeType,
    })),
  };
};

export default {
  detectDamageWithRoboflow,
  getRoboflowDamageConfig,
  isRoboflowDamageConfigured,
  parseRoboflowWorkflowResponse,
};
