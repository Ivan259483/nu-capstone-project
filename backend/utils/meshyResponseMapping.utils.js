/**
 * Meshy Response Mapping — AutoSPF+
 * ════════════════════════════════════════════
 *
 * Pure helpers for interpreting Meshy image-to-3D API payloads: task id
 * extraction, status normalization, and GLB/USDZ/thumbnail URL selection.
 *
 * Meshy's response shape varies across account plans and API versions
 * (model_url vs model_urls.glb vs result.model_urls.glb, etc.), so every
 * extractor walks a prioritized list of candidate paths and validates the
 * file extension before accepting a URL. Kept side-effect free (besides
 * diagnostic console logging) so it can be unit tested without booting the
 * full AI controller (Mongo models, Replicate, Cloudinary, canvas, ...).
 */

export const describeExternalUrl = (value) => {
  try {
    const parsed = new URL(String(value || ''));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
};

export const isGlbUrl = (url) => {
  if (typeof url !== 'string') return false;
  const cleaned = url.split('?')[0].split('#')[0].toLowerCase().trim();
  return cleaned.endsWith('.glb');
};

export const isUsdzUrl = (url) => {
  if (typeof url !== 'string') return false;
  const cleaned = url.split('?')[0].split('#')[0].toLowerCase().trim();
  return cleaned.endsWith('.usdz');
};

export const collectUrlStrings = (value, label, acc = []) => {
  if (!value) return acc;
  if (typeof value === 'string') {
    acc.push({ label, url: value });
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrlStrings(item, `${label}[${index}]`, acc));
    return acc;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectUrlStrings(item, `${label}.${key}`, acc));
  }
  return acc;
};

export const extractTaskId = (payload = {}) => {
  // Walk candidates in priority order rather than `||`-chaining them: `result`
  // is sometimes a plain task-id string and sometimes `{ id, task_id, ... }`,
  // and a naive `||` chain would short-circuit on the latter (a truthy object)
  // before ever reaching `result.id`.
  const candidates = [
    payload?.task_id,
    payload?.id,
    payload?.result,
    payload?.result?.id,
    payload?.result?.task_id,
    payload?.data?.id,
    payload?.data?.task_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
};

export const normalizeMeshyStatus = (status) => {
  const normalized = String(status || '').toLowerCase().replace(/_/g, '');
  // Meshy real API returns uppercase: SUCCEEDED, IN_PROGRESS, FAILED, PENDING
  if (['succeeded', 'success', 'completed', 'done', 'finished', 'arready'].includes(normalized)) {
    return 'ar_ready';
  }
  if (['failed', 'error', 'cancelled'].includes(normalized)) {
    return 'failed';
  }
  return 'processing'; // IN_PROGRESS, PENDING, QUEUED, etc.
};

const logRejectedCandidates = (rejectedCandidates, isValid) => {
  rejectedCandidates.forEach(({ label, url }) => {
    if (typeof url === 'string' && url.trim() && !isValid(url)) {
      console.warn(`[Meshy] Rejected non-matching URL (${label}):`, describeExternalUrl(url));
    }
  });
};

export const extractModelUrl = (payload = {}) => {
  const glbCandidates = [
    { label: 'model_urls.glb', url: payload?.model_urls?.glb },
    { label: 'result.model_urls.glb', url: payload?.result?.model_urls?.glb },
    { label: 'output.model_urls.glb', url: payload?.output?.model_urls?.glb },
    { label: 'data.model_urls.glb', url: payload?.data?.model_urls?.glb },
  ];

  for (const candidate of glbCandidates) {
    if (typeof candidate.url !== 'string' || !candidate.url.trim()) continue;
    if (isGlbUrl(candidate.url)) {
      const selectedUrl = candidate.url.trim();
      console.log('[Meshy] Selected GLB URL:', describeExternalUrl(selectedUrl));
      return selectedUrl;
    }
    console.warn(`[Meshy] Rejected non-GLB model URL candidate (${candidate.label}):`, describeExternalUrl(candidate.url));
  }

  const rejectedCandidates = [
    ...collectUrlStrings(payload?.model_url, 'model_url'),
    ...collectUrlStrings(payload?.glb_url, 'glb_url'),
    ...collectUrlStrings(payload?.thumbnail_url, 'thumbnail_url'),
    ...collectUrlStrings(payload?.model_urls, 'model_urls'),
    ...collectUrlStrings(payload?.texture_urls, 'texture_urls'),
    ...collectUrlStrings(payload?.result?.model_url, 'result.model_url'),
    ...collectUrlStrings(payload?.result?.glb_url, 'result.glb_url'),
    ...collectUrlStrings(payload?.result?.thumbnail_url, 'result.thumbnail_url'),
    ...collectUrlStrings(payload?.result?.model_urls, 'result.model_urls'),
    ...collectUrlStrings(payload?.result?.texture_urls, 'result.texture_urls'),
    ...collectUrlStrings(payload?.output?.model_url, 'output.model_url'),
    ...collectUrlStrings(payload?.output?.glb_url, 'output.glb_url'),
    ...collectUrlStrings(payload?.output?.thumbnail_url, 'output.thumbnail_url'),
    ...collectUrlStrings(payload?.output?.model_urls, 'output.model_urls'),
    ...collectUrlStrings(payload?.output?.texture_urls, 'output.texture_urls'),
    ...collectUrlStrings(payload?.data?.model_url, 'data.model_url'),
    ...collectUrlStrings(payload?.data?.glb_url, 'data.glb_url'),
    ...collectUrlStrings(payload?.data?.thumbnail_url, 'data.thumbnail_url'),
    ...collectUrlStrings(payload?.data?.model_urls, 'data.model_urls'),
    ...collectUrlStrings(payload?.data?.texture_urls, 'data.texture_urls'),
  ];

  logRejectedCandidates(rejectedCandidates, isGlbUrl);

  return null;
};

export const extractUsdzUrl = (payload = {}) => {
  const usdzCandidates = [
    { label: 'model_urls.usdz', url: payload?.model_urls?.usdz },
    { label: 'result.model_urls.usdz', url: payload?.result?.model_urls?.usdz },
    { label: 'output.model_urls.usdz', url: payload?.output?.model_urls?.usdz },
    { label: 'data.model_urls.usdz', url: payload?.data?.model_urls?.usdz },
    { label: 'usdz_url', url: payload?.usdz_url },
    { label: 'result.usdz_url', url: payload?.result?.usdz_url },
    { label: 'output.usdz_url', url: payload?.output?.usdz_url },
    { label: 'data.usdz_url', url: payload?.data?.usdz_url },
  ];

  for (const candidate of usdzCandidates) {
    if (typeof candidate.url !== 'string' || !candidate.url.trim()) continue;
    if (isUsdzUrl(candidate.url)) {
      const selectedUrl = candidate.url.trim();
      console.log('[Meshy] Selected USDZ URL:', describeExternalUrl(selectedUrl));
      return selectedUrl;
    }
    console.warn(`[Meshy] Rejected non-USDZ URL candidate (${candidate.label}):`, describeExternalUrl(candidate.url));
  }

  return null;
};

/**
 * Best-effort preview thumbnail for the "preview URL if available" field.
 * Thumbnails have no fixed extension across Meshy plans, so unlike
 * extractModelUrl/extractUsdzUrl this only checks for a non-empty http(s) URL.
 */
export const extractThumbnailUrl = (payload = {}) => {
  const candidates = [
    payload?.thumbnail_url,
    payload?.result?.thumbnail_url,
    payload?.output?.thumbnail_url,
    payload?.data?.thumbnail_url,
    payload?.preview_url,
    payload?.result?.preview_url,
  ];

  for (const url of candidates) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
      return url.trim();
    }
  }
  return null;
};

const toNullableNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * Meshy queues image-to-3d tasks: while `status` is PENDING and `started_at`
 * is 0/unset, `preceding_tasks` is how many queued tasks are ahead of this
 * one. Real value, never invented — null when Meshy didn't include it.
 */
export const extractPrecedingTasks = (payload = {}) =>
  toNullableNumber(payload?.preceding_tasks ?? payload?.result?.preceding_tasks);

/**
 * Meshy's task lifecycle timestamps (epoch ms, per their API). `started_at`
 * is the field that actually distinguishes "queued" from "generating" —
 * PENDING tasks report started_at as 0/absent until Meshy begins work.
 */
export const extractLifecycleTimestamps = (payload = {}) => ({
  createdAt: toNullableNumber(payload?.created_at ?? payload?.result?.created_at),
  startedAt: toNullableNumber(payload?.started_at ?? payload?.result?.started_at),
  finishedAt: toNullableNumber(payload?.finished_at ?? payload?.result?.finished_at),
});

/**
 * Meshy's task_error is an object ({message, ...}) on some API versions and
 * a plain string on others — normalize to a single human-readable string
 * (or null) rather than passing through a shape the client has to guess at.
 */
export const extractTaskError = (payload = {}) => {
  const candidate = payload?.task_error ?? payload?.result?.task_error;
  if (!candidate) return null;
  if (typeof candidate === 'string') return candidate.trim() || null;
  if (typeof candidate === 'object') {
    const message = candidate.message || candidate.error || candidate.reason;
    if (typeof message === 'string' && message.trim()) return message.trim();
    try {
      return JSON.stringify(candidate);
    } catch {
      return null;
    }
  }
  return String(candidate);
};

export const logMeshyUrlDiagnostics = (payload = {}) => {
  const availableKeys = (value) => {
    if (!value) return [];
    if (typeof value === 'string') return ['direct'];
    return typeof value === 'object' ? Object.keys(value) : [];
  };
  console.log('[Meshy] Available URL fields:', JSON.stringify({
    model_urls: availableKeys(payload?.model_urls),
    result_model_urls: availableKeys(payload?.result?.model_urls),
    output_model_urls: availableKeys(payload?.output?.model_urls),
    data_model_urls: availableKeys(payload?.data?.model_urls),
    texture_urls: availableKeys(payload?.texture_urls),
    result_texture_urls: availableKeys(payload?.result?.texture_urls),
    output_texture_urls: availableKeys(payload?.output?.texture_urls),
    data_texture_urls: availableKeys(payload?.data?.texture_urls),
  }));
};

export default {
  describeExternalUrl,
  isGlbUrl,
  isUsdzUrl,
  collectUrlStrings,
  extractTaskId,
  normalizeMeshyStatus,
  extractModelUrl,
  extractUsdzUrl,
  extractThumbnailUrl,
  extractPrecedingTasks,
  extractLifecycleTimestamps,
  extractTaskError,
  logMeshyUrlDiagnostics,
};
