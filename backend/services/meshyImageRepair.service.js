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
const apiBase = () => String(process.env.MESHY_API_BASE_URL || OFFICIAL_MESHY_API_BASE)
  .trim()
  .replace(/\/+$/, '');
const repairModel = () => String(process.env.MESHY_REPAIR_AI_MODEL || 'nano-banana').trim();

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
} = {}) => {
  const dependency = repairVisualizationDependencyStatus();
  if (!dependency.available) {
    const error = new Error(dependency.message);
    error.code = dependency.reason;
    throw error;
  }

  const normalizedReference = String(referenceImageUrl || '').trim();
  if (!/^https:\/\//i.test(normalizedReference)) {
    const error = new Error('A public HTTPS JPG/PNG reference image is required.');
    error.code = 'MESHY_REPAIR_INVALID_REFERENCE';
    throw error;
  }

  // Image-to-Image is intentionally single-source. Never expand this array
  // from the scan's other guided views: each POST spends a generation credit.
  const payload = {
    ai_model: dependency.aiModel,
    prompt: String(prompt || REPAIR_VISUALIZATION_PROMPT),
    reference_image_urls: [normalizedReference],
    remove_background: false,
    generate_multi_view: false,
  };

  const response = await httpClient.post(`${apiBase()}/image-to-image`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    timeout: 60_000,
  });
  const taskId = taskIdFrom(response.data);
  if (!taskId) {
    const error = new Error('Meshy did not return an Image-to-Image task ID.');
    error.code = 'MESHY_REPAIR_NO_TASK_ID';
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
