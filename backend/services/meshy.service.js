/**
 * Meshy AI 3D Generation Service — AutoSPF+
 * ════════════════════════════════════════════
 *
 * Wraps the Meshy AI image-to-3D pipeline:
 *   1. Upload source image to Cloudinary (Meshy needs a public URL).
 *   2. Start an async image-to-3d task on Meshy.
 *   3. Poll task status and return the .glb model URL when ready.
 *
 * Meshy is asynchronous — we expose helpers for both single-shot polling
 * (with progress callback) and individual status reads, so the controller
 * can stream progress events back to the mobile client.
 *
 * Environment:
 *   MESHY_API_KEY       — required
 *   MESHY_API_BASE_URL  — defaults to https://api.meshy.ai/openapi/v1
 */

import axios from 'axios';
import {
  uploadVehicleScanImages,
} from '../utils/cloudinaryStorage.utils.js';

const MESHY_API_KEY = (process.env.MESHY_API_KEY || '').trim();
const OFFICIAL_MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1';
const MESHY_API_BASE = (process.env.MESHY_API_BASE_URL || OFFICIAL_MESHY_API_BASE)
  .replace(/\/+$/, '');
// Polling uses the same API base that accepted task creation.
const MESHY_FOLDER = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'vehicle-scans').trim();

// Startup diagnostic so we can confirm key + URL on server boot
console.log(`[Meshy] Config — base: ${MESHY_API_BASE} | key set: ${Boolean(MESHY_API_KEY)} | key prefix: ${MESHY_API_KEY.slice(0, 8)}***`);
const MESHY_ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png']);
const MESHY_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MESHY_DEFAULT_POLL_ATTEMPTS = 30;
const MESHY_DEFAULT_POLL_INTERVAL_MS = 5_000;

export const isMeshyConfigured = () => Boolean(MESHY_API_KEY);

export const meshyDependencyStatus = () => {
  if (!isMeshyConfigured()) {
    return {
      available: false,
      reason: 'missing_meshy_api_key',
      message: '3D generation is unavailable because MESHY_API_KEY is not configured.',
    };
  }
  return { available: true, reason: '', message: '' };
};

const meshyHeaders = (extra = {}) => ({
  Authorization: `Bearer ${MESHY_API_KEY}`,
  ...extra,
});

const normalizeMeshyStatus = (status) => {
  const v = String(status || '').toLowerCase().replace(/_/g, '');
  if (['succeeded', 'success', 'completed', 'done', 'finished', 'arready'].includes(v)) {
    return 'ar_ready';
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(v)) {
    return 'failed';
  }
  return 'processing';
};

const extractTaskId = (payload = {}) => {
  const candidates = [
    payload?.task_id,
    payload?.id,
    payload?.result,
    payload?.result?.id,
    payload?.result?.task_id,
    payload?.data?.id,
    payload?.data?.task_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
};

const extractGlbUrl = (payload = {}) => {
  const candidates = [
    payload?.model_url,
    payload?.glb_url,
    payload?.output?.model_url,
    payload?.output?.glb_url,
    payload?.result?.model_url,
    payload?.result?.glb_url,
    payload?.result?.model_urls?.glb,
    payload?.model_urls?.glb,
    payload?.data?.model_url,
    payload?.data?.model_urls?.glb,
  ];
  for (const url of candidates) {
    if (typeof url !== 'string' || !url.trim()) continue;
    const cleaned = url.split('?')[0].split('#')[0].toLowerCase().trim();
    if (cleaned.endsWith('.glb')) return url;
  }
  return null;
};

const extractProgress = (payload = {}) =>
  Math.max(
    0,
    Math.min(
      100,
      Number(payload?.progress || payload?.result?.progress || payload?.data?.progress || 0)
    )
  );

const normalizeExt = (value = '') => String(value || '').toLowerCase().replace(/^\./, '');

const looksLikePublicHttpUrl = (value = '') => /^https?:\/\//i.test(String(value || '').trim());
const looksLikeImageDataUri = (value = '') => /^data:image\/(jpe?g|png);base64,/i.test(String(value || '').trim());

const buildImageDataUri = (file) => {
  const mimeType = String(file?.mimetype || 'image/jpeg').toLowerCase();
  if (!/image\/(jpeg|jpg|png)/.test(mimeType)) {
    const error = new Error(`Meshy only accepts JPG/PNG source images. Got ${mimeType || 'unknown'}.`);
    error.code = 'MESHY_INVALID_IMAGE_FORMAT';
    throw error;
  }
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    const error = new Error('Image buffer is missing.');
    error.code = 'MESHY_MISSING_IMAGE_BUFFER';
    throw error;
  }
  if (file.buffer.length > MESHY_MAX_FILE_SIZE_BYTES) {
    const error = new Error('Meshy source image exceeds 10MB.');
    error.code = 'MESHY_IMAGE_TOO_LARGE';
    throw error;
  }
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  return `data:${normalizedMime};base64,${file.buffer.toString('base64')}`;
};

const inferImageFormat = (url = '', payload = {}) => {
  const fallback =
    payload?.format ||
    payload?.result?.format ||
    payload?.data?.format ||
    payload?.resource_type ||
    '';
  try {
    const parsed = new URL(String(url || ''));
    const fromPath = normalizeExt(parsed.pathname.split('.').pop());
    if (MESHY_ALLOWED_FORMATS.has(fromPath)) return fromPath;

    const params = parsed.searchParams;
    const fromParam = normalizeExt(params.get('format') || params.get('fm') || '');
    if (MESHY_ALLOWED_FORMATS.has(fromParam)) return fromParam;
  } catch {
    // ignore URL parse errors; caller throws if URL is invalid
  }
  const normalizedFallback = normalizeExt(fallback);
  if (MESHY_ALLOWED_FORMATS.has(normalizedFallback)) return normalizedFallback;
  return '';
};

const validateMeshyImageUrl = async (publicUrl) => {
  if (looksLikeImageDataUri(publicUrl)) {
    return publicUrl;
  }

  if (!looksLikePublicHttpUrl(publicUrl)) {
    const error = new Error(
      'Meshy requires a public HTTP(S) image URL or a JPG/PNG data URI.'
    );
    error.code = 'MESHY_INVALID_IMAGE_URL';
    throw error;
  }

  // Fast metadata check via Cloudinary-like URL / extension.
  const inferred = inferImageFormat(publicUrl);
  if (!inferred) {
    const error = new Error('Meshy only accepts JPG/PNG source images.');
    error.code = 'MESHY_INVALID_IMAGE_FORMAT';
    throw error;
  }

  // Optional HEAD probe for best-effort guardrails.
  try {
    const head = await axios.head(publicUrl, { timeout: 20_000 });
    const contentType = String(head.headers?.['content-type'] || '').toLowerCase();
    const contentLength = Number(head.headers?.['content-length'] || 0);

    if (contentType && !/image\/(jpeg|jpg|png)/.test(contentType)) {
      const error = new Error(`Meshy source content-type is unsupported: ${contentType}`);
      error.code = 'MESHY_INVALID_CONTENT_TYPE';
      throw error;
    }
    if (contentLength > MESHY_MAX_FILE_SIZE_BYTES) {
      const error = new Error('Meshy source image exceeds 10MB.');
      error.code = 'MESHY_IMAGE_TOO_LARGE';
      throw error;
    }
  } catch (error) {
    // Fail only when we got a real validation error; ignore transient HEAD failures.
    if (error?.code?.startsWith?.('MESHY_')) throw error;
    console.warn('[Meshy] Skipping strict HEAD validation for source image URL:', String(error?.message || error));
  }

  return publicUrl;
};

/**
 * Upload images to Cloudinary and return the public URLs.
 * Meshy requires a publicly accessible image URL — local file paths won't work.
 */
export const uploadImagesForMeshy = async (files) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('At least one image is required.');
  }
  return uploadVehicleScanImages(files, { folder: MESHY_FOLDER });
};

/**
 * Start an image-to-3D task on Meshy.
 * Returns: { taskId, sourceImageUrls, raw }
 */
export const startMeshyImageTo3D = async (files, options = {}) => {
  const dep = meshyDependencyStatus();
  if (!dep.available) {
    const error = new Error(dep.message);
    error.code = dep.reason;
    throw error;
  }

  let sourceImageUrls = [];
  let meshyImageUrl = '';

  // Skip Cloudinary entirely — use base64 data URI directly.
  // Meshy's image-to-3d endpoint accepts `data:image/jpeg;base64,...` URLs,
  // so we can avoid Cloudinary upload failures (wrong preset, wrong keys, etc.).
  // If Cloudinary IS correctly configured and the caller wants hosted URLs,
  // they can call uploadImagesForMeshy separately before invoking this function.
  try {
    let fileObj = files[0];
    const originalMime = String(fileObj?.mimetype || 'image/jpeg').toLowerCase();
    
    // Convert WebP / HEIC to JPG via Sharp before sending to Meshy
    if (originalMime.includes('webp') || originalMime.includes('heic') || originalMime.includes('heif')) {
      try {
        console.log(`[Meshy] Found ${originalMime} format. Converting to JPEG...`);
        const sharp = (await import('sharp')).default;
        const jpgBuffer = await sharp(fileObj.buffer).jpeg({ quality: 90 }).toBuffer();
        fileObj = { ...fileObj, buffer: jpgBuffer, mimetype: 'image/jpeg' };
      } catch (sharpError) {
        console.warn('[Meshy] Sharp conversion failed (maybe not installed locally). Proceeding with original buffer. Error:', sharpError?.message);
      }
    }

    meshyImageUrl = buildImageDataUri(fileObj);
    console.log(`[Meshy] Using base64 data URI (${Math.round(fileObj.buffer.length / 1024)}KB) — skipping Cloudinary`);
  } catch (dataUriError) {
    // Last resort: try Cloudinary upload
    console.warn('[Meshy] Base64 data URI failed, trying Cloudinary:', dataUriError?.message);
    try {
      sourceImageUrls = await uploadImagesForMeshy(files);
      const rawUrl = sourceImageUrls[0];
      meshyImageUrl = (() => {
        if (!rawUrl.includes('/res.cloudinary.com/')) return rawUrl;
        if (!rawUrl.includes('/image/upload/')) return rawUrl;
        let url = rawUrl;
        if (!/\/f_jpg/.test(url)) url = url.replace('/image/upload/', '/image/upload/f_jpg,q_auto/');
        url = url.replace(/\.(webp|avif|heic|heif|gif|bmp|tiff?)(\?|#|$)/i, '.jpg$2');
        return url;
      })();
    } catch (cloudinaryError) {
      const error = new Error(`Cannot prepare image for Meshy: ${dataUriError?.message || cloudinaryError?.message}`);
      error.code = 'MESHY_IMAGE_PREP_FAILED';
      throw error;
    }
  }

  await validateMeshyImageUrl(meshyImageUrl);
  const payload = {
    image_url: meshyImageUrl,
    enable_pbr: options.enablePbr !== false,
    should_remesh: options.shouldRemesh !== false,
    should_texture: options.shouldTexture !== false,
    target_polycount: Number(options.targetPolycount || 50000),
    target_formats: ['glb'],
  };

  // Probe all known Meshy endpoint variants — different plans expose different prefixes
  const probeList = [...new Set([
    `${OFFICIAL_MESHY_API_BASE}/image-to-3d`,
    `${MESHY_API_BASE}/image-to-3d`,
    'https://api.meshy.ai/openapi/v2/image-to-3d',
    'https://api.meshy.ai/v2/image-to-3d',
    'https://api.meshy.ai/v1/image-to-3d',
    'https://api.meshy.ai/v2/image-to-3d-beta',
  ])];

  console.log(`[Meshy] Starting image-to-3d | image: ${meshyImageUrl}`);
  console.log(`[Meshy] Probing ${probeList.length} endpoint candidates...`);

  let response;
  let usedEndpoint = '';
  for (const endpointUrl of probeList) {
    console.log(`[Meshy] Trying: ${endpointUrl}`);
    try {
      response = await axios.post(endpointUrl, payload, {
        headers: meshyHeaders({ 'Content-Type': 'application/json' }),
        timeout: 60_000,
      });
      usedEndpoint = endpointUrl;
      console.log(`[Meshy] ✅ Accepted by: ${endpointUrl}`);
      break;
    } catch (error) {
      const httpStatus = error?.response?.status ?? 'no-response';
      const responseBody = error?.response?.data ?? null;
      console.warn(`[Meshy] ❌ ${httpStatus}: ${endpointUrl} → ${JSON.stringify(responseBody)}`);
      if (httpStatus !== 404 && httpStatus !== 405 && httpStatus !== 'no-response') {
        console.error('[Meshy] Fatal error — not a routing issue, not trying more candidates');
        console.error(`  ↳ HTTP status  : ${httpStatus}`);
        console.error(`  ↳ Response body: ${JSON.stringify(responseBody, null, 2)}`);
        console.error(`  ↳ Error message: ${error?.message ?? 'unknown'}`);
        throw error;
      }
    }
  }

  if (!response) {
    const error = new Error(`All Meshy endpoint candidates returned 404/405. Tried: ${probeList.join(', ')}`);
    error.code = 'MESHY_NO_VALID_ENDPOINT';
    throw error;
  }

  console.log(`[Meshy] image-to-3d response (via ${usedEndpoint}):`, JSON.stringify(response.data, null, 2));

  const taskId = extractTaskId(response.data);
  if (!taskId) {
    const error = new Error('Meshy did not return a task ID.');
    error.code = 'MESHY_NO_TASK_ID';
    error.detail = response.data;
    throw error;
  }

  // Derive the working base from the endpoint URL so callers can reuse it for polling.
  // e.g. "https://api.meshy.ai/v1/image-to-3d" → "https://api.meshy.ai/v1"
  const pollBase = usedEndpoint.replace(/\/image-to-3d(-beta)?$/, '');
  console.log(`[Meshy] Task started successfully: ${taskId} | pollBase: ${pollBase}`);

  return {
    taskId,
    workingBase: pollBase,
    sourceImageUrls,
    raw: response.data,
  };
};

/**
 * Read the current state of a Meshy task.
 * @param {string} taskId - The Meshy task ID.
 * @param {string} [pollBase] - The base URL that worked for start (e.g. "https://api.meshy.ai/v1").
 *                              Falls back to MESHY_API_BASE then probes all candidates on 404.
 * Returns: { status, progress, modelUrl, taskId, raw }
 */
export const getMeshyTaskStatus = async (taskId, pollBase) => {
  if (!isMeshyConfigured()) {
    const error = new Error('MESHY_API_KEY is not configured.');
    error.code = 'MESHY_NOT_CONFIGURED';
    throw error;
  }

  // Build probe list: prioritise the known working base, then fall through to all candidates
  const probeList = [...new Set([
    ...(pollBase ? [pollBase] : []),
    OFFICIAL_MESHY_API_BASE,
    MESHY_API_BASE,
    'https://api.meshy.ai/openapi/v2',
    'https://api.meshy.ai/v2',
    'https://api.meshy.ai/v1',
  ])];

  let response;
  for (const base of probeList) {
    const pollUrl = `${base}/image-to-3d/${taskId}`;
    console.log(`[Meshy] GET ${pollUrl}`);
    try {
      response = await axios.get(pollUrl, {
        headers: meshyHeaders(),
        timeout: 45_000,
      });
      break; // success
    } catch (error) {
      const httpStatus = error?.response?.status ?? 'no-response';
      const responseBody = error?.response?.data ?? null;
      console.warn(`[Meshy] ❌ poll ${httpStatus}: ${pollUrl} → ${JSON.stringify(responseBody)}`);
      if (httpStatus !== 404 && httpStatus !== 405 && httpStatus !== 'no-response') {
        console.error(`  ↳ Fatal poll error — not retrying further candidates`);
        throw error;
      }
    }
  }

  if (!response) {
    const error = new Error(`All Meshy poll candidates returned 404/405 for task ${taskId}`);
    error.code = 'MESHY_POLL_NO_VALID_ENDPOINT';
    throw error;
  }

  console.log(`[Meshy] Poll response for ${taskId}:`, JSON.stringify(response.data, null, 2));

  const status = normalizeMeshyStatus(response.data?.status || response.data?.result?.status);
  const modelUrl = extractGlbUrl(response.data);
  const progress = extractProgress(response.data);

  return {
    status,
    progress: status === 'ar_ready' ? 100 : progress,
    modelUrl,
    taskId,
    raw: response.data,
  };
};

/**
 * Poll a Meshy task until completion (or timeout).
 * @param {string} taskId
 * @param {{ pollBase?, intervalMs?, timeoutMs?, maxAttempts?, onProgress? }} [options]
 *   pollBase — the base URL that worked for start; polling will prefer it over fallbacks
 */
export const pollMeshyTaskUntilReady = async (
  taskId,
  {
    pollBase,
    intervalMs = MESHY_DEFAULT_POLL_INTERVAL_MS,
    timeoutMs,
    maxAttempts = MESHY_DEFAULT_POLL_ATTEMPTS,
    onProgress,
  } = {}
) => {
  let lastProgress = -1;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const state = await getMeshyTaskStatus(taskId, pollBase);

    if (typeof onProgress === 'function' && state.progress !== lastProgress) {
      lastProgress = state.progress;
      onProgress(state);
    }

    if (state.status === 'ar_ready' && state.modelUrl) {
      return state;
    }

    if (state.status === 'failed') {
      const error = new Error(state.raw?.message || 'Meshy 3D generation failed.');
      error.code = 'MESHY_TASK_FAILED';
      error.detail = state.raw;
      throw error;
    }

    if (typeof timeoutMs === 'number' && attempts * intervalMs >= timeoutMs) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const waitedSeconds = Math.round((maxAttempts * intervalMs) / 1000);
  const error = new Error(`Meshy 3D generation timed out after ${waitedSeconds}s.`);
  error.code = 'MESHY_TIMEOUT';
  throw error;
};

export default {
  isMeshyConfigured,
  meshyDependencyStatus,
  uploadImagesForMeshy,
  startMeshyImageTo3D,
  getMeshyTaskStatus,
  pollMeshyTaskUntilReady,
};
