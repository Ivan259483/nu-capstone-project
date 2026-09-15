import axios from 'axios';
import { isCloudinaryConfigured } from '../utils/cloudinaryStorage.utils.js';

const OFFICIAL_MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1';
const SUPPORTED_MODELS = new Map([
  ['nano-banana', 3],
  ['nano-banana-2', 6],
  ['nano-banana-pro', 9],
  ['gpt-image-2', 12],
]);

export const REPAIR_VISUALIZATION_PROMPT =
  'Create a photorealistic repaired visual approximation based on the same vehicle shown in the reference image. ' +
  'Preserve the visible vehicle body shape, camera viewpoint, framing, paint color, wheels, windows, trim, badges, headlights, taillights, reflections, lighting, shadows, and background as closely as possible. ' +
  'Visually remove or significantly reduce only the visible exterior damage, including scratches, scuffs, dents, cracks, paint chips, or surface damage. ' +
  'Restore the affected visible panel area to a smooth, clean, repaired-looking finish. ' +
  'Do not redesign, customize, recolor, change the vehicle style, alter unaffected panels, replace wheels, change the environment, or materially modify parts that are not damaged. ' +
  'Return one realistic repaired visualization of this same view. The output is a visual repair approximation, not an exact real-world repair result.';

const apiKey = () => String(process.env.MESHY_API_KEY || '').trim();
// Image-to-3D can use a different Meshy API generation. Keep Repair Preview
// pinned to its documented v1 contract unless it receives an explicit,
// feature-specific override.
const apiBase = () => String(
  process.env.MESHY_IMAGE_REPAIR_API_BASE_URL || OFFICIAL_MESHY_API_BASE
)
  .trim()
  .replace(/\/+$/, '');
const repairModel = () => String(process.env.MESHY_REPAIR_AI_MODEL || 'nano-banana').trim();

const CREATE_ERROR_MESSAGES = Object.freeze({
  invalidReference: 'The selected image could not be processed for repair visualization. Choose another view and try again.',
  unauthorized: 'Repair visualization service is not authorized.',
  insufficientCredits: 'Repair visualization credits are unavailable.',
  rateLimited: 'Repair visualization is busy. Please try again shortly.',
  temporarilyUnavailable: 'Repair visualization is temporarily unavailable.',
});

const safeUrlSummary = (value) => {
  try {
    const parsed = new URL(String(value || ''));
    const basename = (parsed.pathname.split('/').filter(Boolean).at(-1) || '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    return `${parsed.protocol}//${parsed.hostname}${basename ? `/${basename}` : ''}`;
  } catch {
    return '[invalid-url]';
  }
};

const sanitizeLogValue = (value, key = '', depth = 0) => {
  if (depth > 5) return '[truncated]';
  if (/authorization|api.?key|token|secret/i.test(key)) return '[redacted]';
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeLogValue(item, key, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([childKey, childValue]) => [
          childKey,
          sanitizeLogValue(childValue, childKey, depth + 1),
        ])
    );
  }
  if (typeof value !== 'string') return value;
  if (/^data:/i.test(value)) return '[data-uri]';
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => safeUrlSummary(url));
};

export const sanitizeMeshyImageRepairErrorBody = (value) => {
  try {
    return JSON.stringify(sanitizeLogValue(value)).slice(0, 1_500);
  } catch {
    return '"[unserializable]"';
  }
};

const upstreamDiagnosticCode = (error) => {
  const status = Number(error?.response?.status);
  if (Number.isFinite(status)) return `MESHY_IMAGE_REPAIR_UPSTREAM_HTTP_${status}`;
  return `MESHY_IMAGE_REPAIR_${String(error?.code || 'NETWORK_ERROR').replace(/[^A-Z0-9_]/gi, '_').toUpperCase()}`;
};

const createRepairError = (message, code, { cause, upstreamStatus = null } = {}) => {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.userMessage = message;
  error.upstreamStatus = upstreamStatus;
  if (cause?.response) error.response = cause.response;
  return error;
};

export const mapMeshyImageRepairCreateError = (error) => {
  if (error?.userMessage && error?.code) return error;
  const status = Number(error?.response?.status);
  if (status === 400) {
    return createRepairError(
      CREATE_ERROR_MESSAGES.invalidReference,
      'MESHY_IMAGE_REPAIR_INVALID_REFERENCE',
      { cause: error, upstreamStatus: status }
    );
  }
  if (status === 401) {
    return createRepairError(
      CREATE_ERROR_MESSAGES.unauthorized,
      'MESHY_IMAGE_REPAIR_UNAUTHORIZED',
      { cause: error, upstreamStatus: status }
    );
  }
  if (status === 402) {
    return createRepairError(
      CREATE_ERROR_MESSAGES.insufficientCredits,
      'MESHY_IMAGE_REPAIR_INSUFFICIENT_CREDITS',
      { cause: error, upstreamStatus: status }
    );
  }
  if (status === 429) {
    return createRepairError(
      CREATE_ERROR_MESSAGES.rateLimited,
      'MESHY_IMAGE_REPAIR_RATE_LIMITED',
      { cause: error, upstreamStatus: status }
    );
  }
  if (status === 404) {
    return createRepairError(
      CREATE_ERROR_MESSAGES.temporarilyUnavailable,
      'MESHY_IMAGE_REPAIR_UPSTREAM_NOT_FOUND',
      { cause: error, upstreamStatus: status }
    );
  }
  return createRepairError(
    CREATE_ERROR_MESSAGES.temporarilyUnavailable,
    status >= 500
      ? 'MESHY_IMAGE_REPAIR_UPSTREAM_UNAVAILABLE'
      : 'MESHY_IMAGE_REPAIR_NETWORK_ERROR',
    { cause: error, upstreamStatus: Number.isFinite(status) ? status : null }
  );
};

const isPrivateHostname = (hostname) => {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    return true;
  }
  const octets = normalized.split('.').map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168);
  }
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
};

const inspectReferenceImage = async (referenceImageUrl, { httpClient, logger }) => {
  const parsed = new URL(referenceImageUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isPrivateHostname(parsed.hostname)) {
    throw createRepairError(
      CREATE_ERROR_MESSAGES.invalidReference,
      'MESHY_IMAGE_REPAIR_INVALID_REFERENCE'
    );
  }

  let response;
  try {
    response = await httpClient.head(referenceImageUrl, {
      timeout: 15_000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
  } catch (error) {
    throw createRepairError(
      CREATE_ERROR_MESSAGES.temporarilyUnavailable,
      'MESHY_IMAGE_REPAIR_REFERENCE_CHECK_FAILED',
      { cause: error }
    );
  }

  const contentType = String(response?.headers?.['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const reachable = Number(response?.status) >= 200 && Number(response?.status) < 400;
  const supportedType = ['image/jpeg', 'image/jpg', 'image/png'].includes(contentType);
  logger.info?.(`[MeshyImageRepair] sourceContentType=${contentType || 'unknown'}`);
  if (!reachable || !supportedType) {
    throw createRepairError(
      CREATE_ERROR_MESSAGES.invalidReference,
      'MESHY_IMAGE_REPAIR_INVALID_REFERENCE',
      { upstreamStatus: Number(response?.status) || null }
    );
  }
  return { contentType, status: Number(response.status) };
};

export const isRepairVisualizationConfigured = () => (
  Boolean(apiKey())
  && SUPPORTED_MODELS.has(repairModel())
  && isCloudinaryConfigured()
);

export const repairVisualizationDependencyStatus = () => {
  if (!apiKey()) {
    return {
      available: false,
      reason: 'missing_meshy_api_key',
      message: 'Repair visualization is unavailable because MESHY_API_KEY is not configured.',
    };
  }

  if (!SUPPORTED_MODELS.has(repairModel())) {
    return {
      available: false,
      reason: 'unsupported_meshy_repair_model',
      message: 'Repair visualization is unavailable because MESHY_REPAIR_AI_MODEL is unsupported.',
    };
  }

  // The result must be copied away from Meshy's expiring asset URL before it
  // is exposed as ready. Fail closed before credit spend when stable storage
  // is unavailable.
  if (!isCloudinaryConfigured()) {
    return {
      available: false,
      reason: 'missing_cloudinary_configuration',
      message: 'Repair visualization is unavailable because stable image storage is not configured.',
    };
  }

  return {
    available: true,
    reason: '',
    message: '',
    aiModel: repairModel(),
    configuredCreditsPerImage: SUPPORTED_MODELS.get(repairModel()),
  };
};

export const normalizeMeshyImageRepairStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PENDING') return 'queued';
  if (normalized === 'IN_PROGRESS') return 'processing';
  if (normalized === 'SUCCEEDED') return 'ready';
  if (normalized === 'FAILED' || normalized === 'CANCELED' || normalized === 'CANCELLED') {
    return 'failed';
  }
  return 'processing';
};

const taskIdFrom = (payload = {}) => {
  const candidate = payload?.result || payload?.task_id || payload?.id || payload?.data?.id;
  return typeof candidate === 'string' ? candidate.trim() : '';
};

const firstImageUrlFrom = (payload = {}) => {
  const candidates = [
    payload?.image_urls?.[0],
    payload?.result?.image_urls?.[0],
    payload?.data?.image_urls?.[0],
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && /^https:\/\//i.test(candidate));
  return value || null;
};

const taskErrorFrom = (payload = {}) => {
  const error = payload?.task_error || payload?.result?.task_error || payload?.data?.task_error;
  if (typeof error === 'string') return error.trim();
  return typeof error?.message === 'string' ? error.message.trim() : '';
};

const finiteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const startMeshyImageToImage = async ({
  referenceImageUrl,
  prompt = REPAIR_VISUALIZATION_PROMPT,
  httpClient = axios,
  logger = console,
} = {}) => {
  const dependency = repairVisualizationDependencyStatus();
  if (!dependency.available) {
    const error = new Error(dependency.message);
    error.code = dependency.reason;
    throw error;
  }

  const normalizedReference = String(referenceImageUrl || '').trim();
  if (!/^https:\/\//i.test(normalizedReference)) {
    throw createRepairError(
      CREATE_ERROR_MESSAGES.invalidReference,
      'MESHY_IMAGE_REPAIR_INVALID_REFERENCE'
    );
  }

  // Image-to-Image is intentionally single-source. Never expand this array
  // from the scan's other guided views: each POST spends a generation credit.
  const payload = {
    ai_model: dependency.aiModel,
    prompt: String(prompt || REPAIR_VISUALIZATION_PROMPT),
    reference_image_urls: [normalizedReference],
  };

  const endpoint = `${apiBase()}/image-to-image`;
  const source = new URL(normalizedReference);
  const sourceBasename = (source.pathname.split('/').filter(Boolean).at(-1) || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  logger.info?.(`[MeshyImageRepair] POST ${endpoint}`);
  logger.info?.(`[MeshyImageRepair] sourceProtocol=${source.protocol} sourceHost=${source.hostname} sourceBasename=${sourceBasename || '(none)'}`);
  logger.info?.(`[MeshyImageRepair] aiModel=${dependency.aiModel}`);
  logger.info?.(`[MeshyImageRepair] configured=${Boolean(apiKey())}`);

  try {
    await inspectReferenceImage(normalizedReference, { httpClient, logger });
  } catch (error) {
    logger.warn?.(`[MeshyImageRepair] responseStatus=${error?.upstreamStatus || 'source-check'}`);
    logger.warn?.(`[MeshyImageRepair] responseBody=${sanitizeMeshyImageRepairErrorBody({ message: error?.userMessage || error?.message })}`);
    logger.warn?.(`[MeshyImageRepair] errorCode=${error?.code || 'MESHY_IMAGE_REPAIR_REFERENCE_CHECK_FAILED'}`);
    throw error;
  }

  let response;
  try {
    response = await httpClient.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    });
    logger.info?.(`[MeshyImageRepair] responseStatus=${Number(response?.status) || 200}`);
  } catch (error) {
    const mappedError = mapMeshyImageRepairCreateError(error);
    logger.warn?.(`[MeshyImageRepair] responseStatus=${Number(error?.response?.status) || 'network'}`);
    logger.warn?.(`[MeshyImageRepair] responseBody=${sanitizeMeshyImageRepairErrorBody(error?.response?.data ?? { message: error?.message || 'Network error' })}`);
    logger.warn?.(`[MeshyImageRepair] errorCode=${mappedError.code || upstreamDiagnosticCode(error)}`);
    throw mappedError;
  }
  const taskId = taskIdFrom(response.data);
  if (!taskId) {
    const error = createRepairError(
      CREATE_ERROR_MESSAGES.temporarilyUnavailable,
      'MESHY_IMAGE_REPAIR_NO_TASK_ID'
    );
    logger.warn?.(`[MeshyImageRepair] responseBody=${sanitizeMeshyImageRepairErrorBody(response?.data)}`);
    logger.warn?.(`[MeshyImageRepair] errorCode=${error.code}`);
    throw error;
  }

  return {
    taskId,
    status: 'queued',
    aiModel: dependency.aiModel,
    configuredCreditsPerImage: dependency.configuredCreditsPerImage,
    requestPayload: payload,
  };
};

export const getMeshyImageToImageStatus = async (taskId, { httpClient = axios } = {}) => {
  const dependency = repairVisualizationDependencyStatus();
  if (!dependency.available) {
    const error = new Error(dependency.message);
    error.code = dependency.reason;
    throw error;
  }

  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) {
    const error = new Error('Meshy Image-to-Image task ID is required.');
    error.code = 'MESHY_REPAIR_TASK_ID_REQUIRED';
    throw error;
  }

  const response = await httpClient.get(
    `${apiBase()}/image-to-image/${encodeURIComponent(normalizedTaskId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey()}` },
      timeout: 45_000,
    }
  );
  const payload = response.data || {};
  const status = normalizeMeshyImageRepairStatus(payload.status);

  return {
    taskId: normalizedTaskId,
    status,
    progress: Math.max(0, Math.min(100, Number(payload.progress) || 0)),
    afterImageUrl: status === 'ready' ? firstImageUrlFrom(payload) : null,
    aiModel: String(payload.ai_model || dependency.aiModel),
    consumedCredits: finiteNumberOrNull(payload.consumed_credits),
    configuredCreditsPerImage: dependency.configuredCreditsPerImage,
    precedingTasks: finiteNumberOrNull(payload.preceding_tasks),
    createdAt: finiteNumberOrNull(payload.created_at),
    startedAt: finiteNumberOrNull(payload.started_at),
    finishedAt: finiteNumberOrNull(payload.finished_at),
    error: taskErrorFrom(payload),
  };
};

export const MESHY_REPAIR_MODELS = Object.freeze(
  Object.fromEntries(SUPPORTED_MODELS.entries())
);
