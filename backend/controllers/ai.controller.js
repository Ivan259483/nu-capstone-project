import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { createHash } from 'crypto';
import { createCanvas } from 'canvas';
import Replicate from 'replicate';
import AIServiceRequest from '../models/aIServiceRequest.model.js';
import {
  getCloudinaryMissingConfigMessage,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
  uploadVehicleScanImages,
} from '../utils/cloudinaryStorage.utils.js';
import {
  normalizeDamageCategory,
  detectVehiclePart,
  normalizeSelectedDamageArea,
  validatePartMatch,
} from '../utils/vehiclePartMapper.utils.js';
import {
  buildOfflineImageContexts,
  generateOfflineDamages,
} from '../utils/offlineDamageEngine.utils.js';

const MESHY_API_KEY = process.env.MESHY_API_KEY || '';
const MESHY_API_BASE = (process.env.MESHY_API_BASE_URL || 'https://api.meshy.ai/openapi/v2').replace(/\/+$/, '');
const MESHY_CLOUDINARY_FOLDER = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'vehicle-scans').trim();

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

const INPAINTING_PROMPT =
  'professional car body repair, remove all scratches dents cracks paint damage, ' +
  'perfect factory paint restoration, seamless blend, photorealistic, 8k, showroom quality, ' +
  'smooth panel surface, correct bumper alignment, preserve realistic lighting and reflections';

// FLUX Fill Pro model — primary inpainting model
// Version updated 2026-04-04 — check https://replicate.com/black-forest-labs/flux-fill-pro for latest
const FLUX_FILL_PRO_MODEL = 'black-forest-labs/flux-fill-pro';
const FLUX_FILL_PRO_VERSION = '2d4197724d8ed13cc78191e794ebbe6aeedcfe4c5b36f464794732d5ccb9735f';

// Fallback: flux-kontext restore-image
const FLUX_RESTORE_MODEL = 'flux-kontext-apps/restore-image';
const FLUX_RESTORE_VERSION = 'da7613a13aac59a1a3231023f0f30cf27991695ee0fe7ef52959ec1e02311c25';

const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ANALYZE_RESULT_CACHE_TTL_MS = 20 * 1000;
const ANALYZE_LOCK_STALE_MS = 2 * 60 * 1000;
const inFlightAnalyzeLocks = new Map();
const recentAnalyzeResults = new Map();

const SERVICE_LIBRARY = {
  bumper: {
    id: 'bumper-repair',
    name: 'Bumper Repair & Refinish',
    urgency: 'Immediate',
    min: 4200,
    max: 14500,
    laborHours: 4.5,
    materialFactor: 0.34,
  },
  fender: {
    id: 'fender-repair',
    name: 'Fender Repair & Spot Paint',
    urgency: 'Immediate',
    min: 4800,
    max: 15000,
    laborHours: 4.5,
    materialFactor: 0.36,
  },
  scratch: {
    id: 'paint-polish',
    name: 'Paint Correction & Polishing',
    urgency: 'Can Wait',
    min: 2800,
    max: 7000,
    laborHours: 2.5,
    materialFactor: 0.35,
  },
  dent: {
    id: 'dent-repair',
    name: 'Paintless Dent Repair',
    urgency: 'Immediate',
    min: 4500,
    max: 12000,
    laborHours: 4,
    materialFactor: 0.25,
  },
  repaint: {
    id: 'panel-repaint',
    name: 'Panel Repainting',
    urgency: 'Immediate',
    min: 6500,
    max: 18000,
    laborHours: 6,
    materialFactor: 0.45,
  },
  detail: {
    id: 'detailing',
    name: 'Exterior Detailing',
    urgency: 'Optional',
    min: 1800,
    max: 5200,
    laborHours: 2,
    materialFactor: 0.28,
  },
  panel: {
    id: 'panel-repair',
    name: 'Panel Straightening & Repair',
    urgency: 'Immediate',
    min: 8000,
    max: 24000,
    laborHours: 7,
    materialFactor: 0.38,
  },
  headlight: {
    id: 'headlight-restoration',
    name: 'Headlight Restoration',
    urgency: 'Can Wait',
    min: 1200,
    max: 3200,
    laborHours: 1,
    materialFactor: 0.2,
  },
  tailLight: {
    id: 'tail-light-repair',
    name: 'Tail Light Lens Repair',
    urgency: 'Immediate',
    min: 1800,
    max: 6400,
    laborHours: 1.5,
    materialFactor: 0.24,
  },
  trunk: {
    id: 'trunk-repair',
    name: 'Trunk Repair & Refinish',
    urgency: 'Immediate',
    min: 5200,
    max: 16500,
    laborHours: 5,
    materialFactor: 0.38,
  },
};

/* ── Add-On Services — user can toggle these to customise the repair quote ── */
const ADD_ON_SERVICES = {
  'ceramic-coating': {
    id: 'ceramic-coating',
    name: '9H Ceramic Coating',
    description: 'Professional-grade nano-ceramic layer for long-lasting paint protection and hydrophobic finish.',
    category: 'protection',
    flatPrice: 8000,
    isAddOn: true,
  },
  'full-polish': {
    id: 'full-polish',
    name: 'Full Body Machine Polish',
    description: 'Multi-stage compound + polish to restore factory paint clarity.',
    category: 'cosmetic',
    flatPrice: 2500,
    isAddOn: true,
  },
  'ppf-panels': {
    id: 'ppf-panels',
    name: 'Paint Protection Film (Damaged Panels)',
    description: 'Self-healing PPF applied to repaired panels for chip and scratch immunity.',
    category: 'protection',
    flatPrice: 12000,
    isAddOn: true,
  },
  'interior-detail': {
    id: 'interior-detail',
    name: 'Interior Deep Clean',
    description: 'Steam clean, leather conditioning, UV protectant for dash and trim.',
    category: 'cosmetic',
    flatPrice: 3500,
    isAddOn: true,
  },
  'wheel-refurbish': {
    id: 'wheel-refurbish',
    name: 'Wheel Refurbishment (x4)',
    description: 'Curb damage repair, re-lacquer, and protective coat for all four wheels.',
    category: 'repair',
    flatPrice: 6000,
    isAddOn: true,
  },
  'paint-sealant': {
    id: 'paint-sealant',
    name: 'Synthetic Paint Sealant',
    description: '6-month durability polymer sealant applied post-repaint for lasting shine.',
    category: 'protection',
    flatPrice: 1800,
    isAddOn: true,
  },
};

const roundCurrency = (value) => Math.max(0, Math.round(value));

const formatCurrencyRange = (min, max) => {
  const safeMin = roundCurrency(min);
  const safeMax = Math.max(safeMin, roundCurrency(max));
  return `₱${safeMin.toLocaleString('en-PH')} - ₱${safeMax.toLocaleString('en-PH')}`;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeSeverity = (severity) => {
  const normalized = String(severity || '').toLowerCase();
  if (normalized.includes('severe') || normalized.includes('high')) return 'severe';
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'moderate';
  return 'minor';
};

const normalizeUrgency = (urgency) => {
  const normalized = String(urgency || '').toLowerCase();
  if (normalized.includes('immediate') || normalized.includes('urgent')) return 'Immediate';
  if (normalized.includes('optional') || normalized.includes('low')) return 'Optional';
  return 'Can Wait';
};

const clampConfidence = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return Number(numeric.toFixed(2));
};

const sanitizeServiceId = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'service';

const resolveServiceTemplate = (damageType = '', affectedArea = '') => {
  const t = damageType.toLowerCase();
  const area = affectedArea.toLowerCase();

  if (area.includes('headlight')) return SERVICE_LIBRARY.headlight;
  if (area.includes('tail light')) return SERVICE_LIBRARY.tailLight;
  if (area.includes('bumper')) return SERVICE_LIBRARY.bumper;
  if (area.includes('fender')) return SERVICE_LIBRARY.fender;
  if (area.includes('trunk')) return SERVICE_LIBRARY.trunk;
  if (area.includes('panel')) return SERVICE_LIBRARY.panel;

  if (t.includes('headlight')) return SERVICE_LIBRARY.headlight;
  if (t.includes('tail light')) return SERVICE_LIBRARY.tailLight;
  if (t.includes('dent')) return SERVICE_LIBRARY.dent;
  if (t.includes('chip') || t.includes('repaint') || t.includes('paint peel')) return SERVICE_LIBRARY.repaint;
  if (t.includes('clearcoat') || t.includes('oxid') || t.includes('fade')) return SERVICE_LIBRARY.detail;
  if (t.includes('panel') || t.includes('collision')) return SERVICE_LIBRARY.panel;
  return SERVICE_LIBRARY.scratch;
};

const normalizeBoundingBox = (box) => {
  if (!box || typeof box !== 'object') return null;
  const x = Math.max(0, Math.min(1, Number(box.x || 0)));
  const y = Math.max(0, Math.min(1, Number(box.y || 0)));
  const width = Math.max(0.02, Math.min(1 - x, Number(box.width || 0.1)));
  const height = Math.max(0.02, Math.min(1 - y, Number(box.height || 0.1)));
  return { x, y, width, height };
};

const normalizeDamages = (damages, angleHints = []) => {
  const cleaned = asArray(damages)
    .map((item, index) => {
      const rawDamageType = String(item?.damage_type || item?.type || item?.name || '').trim();

      if (!rawDamageType) return null;

      const severity = normalizeSeverity(item?.severity);
      const confidence = clampConfidence(item?.confidence);
      const recommendedAction = String(
        item?.recommended_action || item?.action || `Inspect and repair ${rawDamageType}`
      ).trim();

      const boundingBox = normalizeBoundingBox(item?.bounding_box);
      const imageIndex = Number.isFinite(Number(item?.image_index)) ? Number(item.image_index) : 0;
      const explicitArea = String(
        item?.affected_area || item?.location || item?.part || item?.panel || ''
      ).trim();

      const angleHint = angleHints[imageIndex] || angleHints[0] || 'close_up';
      const normalizedCategory = normalizeDamageCategory(rawDamageType);
      const mappedArea = explicitArea
        ? (angleHints.length > 0 ? normalizeSelectedDamageArea(explicitArea, angleHint) : explicitArea)
        : validatePartMatch(detectVehiclePart(boundingBox, angleHint), angleHint);
      const suggestedServices = asArray(item?.suggested_services).map((id) => String(id)).filter(Boolean);

      const template = resolveServiceTemplate(normalizedCategory, mappedArea);

      return {
        id: `dmg_${index + 1}`,
        damage_type: normalizedCategory,
        original_damage_type: rawDamageType,
        affected_area: mappedArea,
        location: mappedArea,
        part: mappedArea,
        confidence,
        severity,
        recommended_action: recommendedAction,
        suggested_services: suggestedServices.length ? suggestedServices : [template.id],
        bounding_box: boundingBox,
        image_index: imageIndex,
      };
    })
    .filter(Boolean);

  return cleaned;
};

const mergeRecommendations = (damages, recommendations) => {
  const result = [];
  const seenIds = new Set();

  asArray(recommendations).forEach((item) => {
    const serviceName = String(item?.service_name || item?.service || '').trim();
    if (!serviceName) return;

    const serviceId = String(item?.service_id || sanitizeServiceId(serviceName));
    if (seenIds.has(serviceId)) return;

    const estimatedMin = Math.max(0, Number(item?.estimated_min || item?.min || 0));
    const estimatedMax = Math.max(estimatedMin, Number(item?.estimated_max || item?.max || estimatedMin));

    result.push({
      service_id: serviceId,
      service_name: serviceName,
      description: String(item?.description || '').trim() || `Recommended service: ${serviceName}`,
      urgency: normalizeUrgency(item?.urgency),
      related_areas: asArray(item?.related_areas).map((x) => String(x)).filter(Boolean),
      estimated_min: roundCurrency(estimatedMin),
      estimated_max: roundCurrency(estimatedMax),
    });
    seenIds.add(serviceId);
  });

  damages.forEach((damage) => {
    const template = resolveServiceTemplate(damage.damage_type, damage.affected_area);
    if (seenIds.has(template.id)) return;

    result.push({
      service_id: template.id,
      service_name: template.name,
      description: damage.recommended_action,
      urgency: template.urgency,
      related_areas: [damage.affected_area],
      estimated_min: template.min,
      estimated_max: template.max,
    });
    seenIds.add(template.id);
  });

  return result;
};

const estimateCostFromInputs = ({ damages = [], selectedServiceIds = [], recommendationPool = [] }) => {
  const severityFactor = {
    minor: 1,
    moderate: 1.45,
    severe: 2.2,
  };

  const baseLaborRate = 850;
  const selectedSet = new Set(
    asArray(selectedServiceIds).map((x) => String(x).trim()).filter(Boolean)
  );

  const availableServices = new Map();
  recommendationPool.forEach((service) => {
    availableServices.set(service.service_id, service);
  });

  if (selectedSet.size === 0) {
    recommendationPool.forEach((service) => selectedSet.add(service.service_id));
  }

  const breakdown = [];
  let totalMin = 0;
  let totalMax = 0;

  selectedSet.forEach((serviceId) => {
    const service = availableServices.get(serviceId);
    if (!service) return;

    const relatedDamages = damages.filter((damage) => {
      const relatedAreas = asArray(service.related_areas).map((x) => String(x).toLowerCase());
      if (!relatedAreas.length) return true;
      return relatedAreas.some((area) => damage.affected_area.toLowerCase().includes(area) || area.includes(damage.affected_area.toLowerCase()));
    });

    const damageMultiplier =
      relatedDamages.length > 0
        ? relatedDamages.reduce((sum, d) => sum + (severityFactor[d.severity] || 1), 0) / relatedDamages.length
        : 1;

    const labor = roundCurrency(baseLaborRate * damageMultiplier * Math.max(1, relatedDamages.length));
    const materials = roundCurrency((service.estimated_min * 0.25) + (service.estimated_max * 0.18));

    const min = roundCurrency(service.estimated_min * damageMultiplier + labor * 0.55 + materials * 0.45);
    const max = roundCurrency(service.estimated_max * damageMultiplier + labor + materials);

    totalMin += min;
    totalMax += max;

    breakdown.push({
      service_id: service.service_id,
      service_name: service.service_name,
      labor,
      materials,
      subtotal_min: min,
      subtotal_max: max,
      affected_areas: relatedDamages.map((d) => d.affected_area),
    });
  });

  if (breakdown.length === 0 && damages.length > 0) {
    const fallbackMin = damages.length * 3200;
    const fallbackMax = damages.length * 7800;
    totalMin += fallbackMin;
    totalMax += fallbackMax;
    breakdown.push({
      service_id: 'general-repair',
      service_name: 'General Damage Repair Package',
      labor: roundCurrency(fallbackMin * 0.35),
      materials: roundCurrency(fallbackMin * 0.2),
      subtotal_min: fallbackMin,
      subtotal_max: fallbackMax,
      affected_areas: damages.map((d) => d.affected_area),
    });
  }

  return {
    currency: 'PHP',
    min: roundCurrency(totalMin),
    max: roundCurrency(totalMax),
    total_estimated_cost: formatCurrencyRange(totalMin, totalMax),
    breakdown,
    assumptions: [
      'Estimate is generated from the offline damage template engine and selected services.',
      'Final bill may vary after in-person inspection and hidden damage checks.',
    ],
  };
};

const validateUploads = (files = []) => {
  if (!Array.isArray(files) || files.length === 0) {
    return 'Please upload at least one vehicle image.';
  }

  if (files.length > MAX_IMAGE_COUNT) {
    return `Maximum ${MAX_IMAGE_COUNT} images are allowed per scan.`;
  }

  for (const file of files) {
    if (!file.mimetype?.startsWith('image/')) {
      return 'Only image uploads are supported.';
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return `Image ${file.originalname || ''} exceeds 10MB limit.`;
    }
  }

  return null;
};

const extractModelUrl = (payload = {}) => {
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
    if (typeof url === 'string' && url.trim()) {
      const cleaned = url.split('?')[0].split('#')[0].toLowerCase().trim();
      // Only accept genuine .glb model files
      if (cleaned.endsWith('.glb')) {
        return url;
      }
      // Log rejected non-GLB URLs to catch Cloudinary image leaks
      console.warn('[extractModelUrl] Rejected non-GLB URL:', url);
    }
  }

  return null;
};

const extractTaskId = (payload = {}) => {
  const candidate = (
    payload?.task_id
    || payload?.id
    || payload?.result
    || payload?.result?.id
    || payload?.result?.task_id
    || payload?.data?.id
    || payload?.data?.task_id
    || ''
  );

  return typeof candidate === 'string' ? candidate : '';
};

const normalizeMeshyStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['succeeded', 'success', 'completed', 'done', 'finished', 'ar_ready'].includes(normalized)) {
    return 'ar_ready';
  }
  if (['failed', 'error', 'cancelled'].includes(normalized)) {
    return 'failed';
  }
  if (['queued', 'pending', 'processing', 'running', 'in_progress'].includes(normalized)) {
    return 'processing';
  }
  return 'processing';
};

const buildMeshyHeaders = (extra = {}) => ({
  Authorization: `Bearer ${MESHY_API_KEY}`,
  ...extra,
});

const get3DDependencyStatus = () => {
  const sharedReason = 'missing cloudinary or meshy configuration';

  if (!MESHY_API_KEY) {
    return {
      available: false,
      message: '3D generation is unavailable because MESHY_API_KEY is not configured.',
      reason: sharedReason,
    };
  }

  if (!isCloudinaryConfigured()) {
    return {
      available: false,
      message: `3D generation is unavailable because Cloudinary storage is not configured. ${getCloudinaryMissingConfigMessage()}`,
      reason: sharedReason,
    };
  }

  return {
    available: true,
    message: '',
    reason: '',
  };
};

const startMeshyTask = async (files) => {
  const cloudinaryUrls = await uploadVehicleScanImages(files, {
    folder: MESHY_CLOUDINARY_FOLDER,
  });

  // Meshy V2 Image-to-3D endpoint with PBR textures
  const jsonPayload = {
    image_url: cloudinaryUrls[0],
    enable_pbr: true,
    should_remesh: true,
    topology: 'triangle',
    target_polycount: 30000,
  };

  console.log('[Meshy V2] Starting image-to-3d with payload:', JSON.stringify(jsonPayload, null, 2));

  const jsonResp = await axios.post(
    `${MESHY_API_BASE}/image-to-3d`,
    jsonPayload,
    {
      headers: buildMeshyHeaders({ 'Content-Type': 'application/json' }),
      timeout: 60000,
    }
  );

  console.log('[Meshy V2] Response:', JSON.stringify(jsonResp.data, null, 2));

  return {
    ...(jsonResp.data || {}),
    source_image_urls: cloudinaryUrls,
  };
};

const fetchMeshyTask = async (taskId) => {
  const response = await axios.get(
    `${MESHY_API_BASE}/image-to-3d/${taskId}`,
    {
      headers: buildMeshyHeaders(),
      timeout: 45000,
    }
  );

  return response.data;
};

const buildAnalyzeResponse = ({
  status,
  message,
  damages,
  recommendations,
  source,
  fallbackReason,
}) => {
  const estimate = estimateCostFromInputs({
    damages,
    selectedServiceIds: recommendations.map((r) => r.service_id),
    recommendationPool: recommendations,
  });

  return {
    status,
    message,
    damages,
    recommendations,
    service_catalog: recommendations,
    breakdown: estimate.breakdown.map((line) => ({
      part: line.affected_areas[0] || 'vehicle body',
      service: line.service_name,
      cost_range: formatCurrencyRange(line.subtotal_min, line.subtotal_max),
      service_id: line.service_id,
      labor: line.labor,
      materials: line.materials,
    })),
    total_estimated_cost: estimate.total_estimated_cost,
    estimate,
    analysis_source: source,
    fallback_reason: fallbackReason || null,
  };
};

const createServerRequestId = () =>
  `srv_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const readHeaderValue = (value) => {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
};

const getAnalyzeRequestId = (req) =>
  readHeaderValue(req.headers?.['x-scan-request-id'])
  || readHeaderValue(req.headers?.['x-request-id'])
  || createServerRequestId();

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseImageMetaField = (value) =>
  parseArrayField(value)
    .filter((item) => item && typeof item === 'object');

const buildOfflineAnalyzeData = ({ files, angleHints, selectedAreas, imageMeta }) => {
  const contexts = buildOfflineImageContexts({
    files,
    angleHints,
    selectedAreas,
    imageMeta,
  });

  const damages = generateOfflineDamages(contexts);
  const recommendations = mergeRecommendations(damages, []);

  return buildAnalyzeResponse({
    status: 'damage_detected',
    message: 'Offline damage assessment complete.',
    damages,
    recommendations,
    source: 'rule_based',
  });
};

const buildAnalyzeRequestFingerprint = (files, angleHints = [], selectedAreas = [], imageMeta = []) => {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(angleHints));
  hash.update(JSON.stringify(selectedAreas));
  hash.update(JSON.stringify(imageMeta));

  files.forEach((file, index) => {
    hash.update(String(index));
    hash.update(String(file?.originalname || ''));
    hash.update(String(file?.mimetype || ''));
    hash.update(String(file?.size || 0));
    if (file?.buffer) {
      hash.update(file.buffer);
    }
  });

  return hash.digest('hex');
};

const cleanupAnalyzeRequestState = () => {
  const now = Date.now();

  for (const [key, value] of recentAnalyzeResults.entries()) {
    if (value.expiresAt <= now) {
      recentAnalyzeResults.delete(key);
    }
  }

  for (const [key, value] of inFlightAnalyzeLocks.entries()) {
    if (now - value.startedAt > ANALYZE_LOCK_STALE_MS) {
      console.warn(
        `[AI Analyze][${value.requestId}] Removing stale lock (age=${now - value.startedAt}ms, key=${key.slice(0, 12)}...)`
      );
      inFlightAnalyzeLocks.delete(key);
    }
  }
};

export const analyzeDamage = async (req, res) => {
  const requestId = getAnalyzeRequestId(req);
  const requestStartedAt = Date.now();

  try {
    const validationMessage = validateUploads(req.files);
    if (validationMessage) {
      console.warn(`[AI Analyze][${requestId}] Upload validation failed: ${validationMessage}`);
      return res.status(400).json({
        success: false,
        status: 'invalid',
        message: validationMessage,
        request_id: requestId,
      });
    }

    const angleHints = parseArrayField(req.body?.angles).map((value) => String(value));
    const selectedAreas = parseArrayField(
      req.body?.selected_areas || req.body?.damage_areas || req.body?.areas
    ).map((value) => String(value));
    const imageMeta = parseImageMetaField(
      req.body?.image_meta || req.body?.image_context || req.body?.metadata
    );

    cleanupAnalyzeRequestState();
    const requestFingerprint = buildAnalyzeRequestFingerprint(req.files, angleHints, selectedAreas, imageMeta);
    const fingerprintShort = requestFingerprint.slice(0, 12);

    const cachedResult = recentAnalyzeResults.get(requestFingerprint);
    if (cachedResult && cachedResult.expiresAt > Date.now()) {
      console.log(
        `[AI Analyze][${requestId}] Reusing recent result from ${cachedResult.requestId} (key=${fingerprintShort})`
      );
      return res.status(cachedResult.statusCode).json({
        ...cachedResult.payload,
        request_id: requestId,
        shared_request_id: cachedResult.requestId,
        dedupe_source: 'recent_cache',
      });
    }

    const inFlightLock = inFlightAnalyzeLocks.get(requestFingerprint);
    if (inFlightLock) {
      console.log(
        `[AI Analyze][${requestId}] Joining in-flight offline scan ${inFlightLock.requestId} (key=${fingerprintShort})`
      );
      const sharedResult = await inFlightLock.promise;
      return res.status(sharedResult.statusCode).json({
        ...sharedResult.payload,
        request_id: requestId,
        shared_request_id: inFlightLock.requestId,
        dedupe_source: 'in_flight',
      });
    }

    const executeAnalyze = async () => {
      console.log(
        `[AI Analyze][${requestId}] Offline scan started (images=${req.files.length}, key=${fingerprintShort})`
      );
      const data = buildOfflineAnalyzeData({
        files: req.files,
        angleHints,
        selectedAreas,
        imageMeta,
      });

      return {
        statusCode: 200,
        payload: { success: true, data, source: 'rule_based' },
      };
    };

    const analyzePromise = executeAnalyze();
    inFlightAnalyzeLocks.set(requestFingerprint, {
      promise: analyzePromise,
      requestId,
      startedAt: Date.now(),
    });

    let result;
    try {
      result = await analyzePromise;
    } finally {
      inFlightAnalyzeLocks.delete(requestFingerprint);
    }

    if (result?.payload?.success) {
      recentAnalyzeResults.set(requestFingerprint, {
        requestId,
        statusCode: result.statusCode,
        payload: result.payload,
        expiresAt: Date.now() + ANALYZE_RESULT_CACHE_TTL_MS,
      });
    }

    console.log(
      `[AI Analyze][${requestId}] Completed in ${Date.now() - requestStartedAt}ms (key=${fingerprintShort})`
    );
    return res.status(result.statusCode).json({
      ...result.payload,
      request_id: requestId,
      dedupe_source: 'none',
    });
  } catch (error) {
    console.error(`[AI Analyze][${requestId}] Unexpected error:`, error);
    return res.status(500).json({
      success: false,
      status: 'failed',
      message: 'Damage analysis failed due to server error.',
      request_id: requestId,
    });
  }
};

export const generate3DModel = async (req, res) => {
  try {
    const validationMessage = validateUploads(req.files);
    if (validationMessage) {
      return res.status(400).json({ success: false, status: 'failed', message: validationMessage });
    }

    const dependencyStatus = get3DDependencyStatus();
    if (!dependencyStatus.available) {
      return res.json({
        success: true,
        status: 'unavailable',
        message: dependencyStatus.message,
        reason: dependencyStatus.reason,
      });
    }

    const meshyResponse = await startMeshyTask(req.files);
    const taskId = extractTaskId(meshyResponse);
    const modelUrl = extractModelUrl(meshyResponse);
    const status = normalizeMeshyStatus(meshyResponse?.status || meshyResponse?.result?.status);

    if (modelUrl && status === 'ar_ready') {
      return res.json({
        success: true,
        status: 'ar_ready',
        model_url: modelUrl,
        message: '3D vehicle model generated successfully.',
      });
    }

    if (!taskId) {
      return res.status(502).json({
        success: false,
        status: 'failed',
        message: 'Meshy did not return a valid task identifier.',
      });
    }

    return res.status(202).json({
      success: true,
      status: 'processing',
      task_id: taskId,
      poll_url: `/api/ai/generate-3d/${taskId}`,
      message: '3D model generation started.',
    });
  } catch (error) {
    const detail = error?.response?.data || error?.message || 'Unknown error';
    console.error('❌ [Meshy Start] Error:', detail);
    return res.status(502).json({
      success: false,
      status: 'failed',
      message: 'Failed to start 3D model generation.',
      detail,
    });
  }
};

export const get3DModelStatus = async (req, res) => {
  try {
    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      return res.status(400).json({ success: false, status: 'failed', message: 'Task ID is required.' });
    }

    if (!MESHY_API_KEY) {
      return res.json({
        success: true,
        status: 'unavailable',
        message: '3D generation is unavailable. Configure MESHY_API_KEY to enable polling.',
        reason: 'missing cloudinary or meshy configuration',
      });
    }

    const payload = await fetchMeshyTask(taskId);
    const status = normalizeMeshyStatus(payload?.status || payload?.result?.status);
    const modelUrl = extractModelUrl(payload);

    if (status === 'ar_ready' && modelUrl) {
      return res.json({
        success: true,
        status: 'ar_ready',
        model_url: modelUrl,
        progress: 100,
        task_id: taskId,
      });
    }

    if (status === 'failed') {
      return res.status(502).json({
        success: false,
        status: 'failed',
        task_id: taskId,
        message: payload?.message || '3D generation failed.',
      });
    }

    return res.json({
      success: true,
      status: 'processing',
      task_id: taskId,
      progress: Number(payload?.progress || payload?.result?.progress || 0),
      message: '3D model is still being generated.',
    });
  } catch (error) {
    const detail = error?.response?.data || error?.message || 'Unknown error';
    console.error('❌ [Meshy Poll] Error:', detail);
    return res.status(502).json({
      success: false,
      status: 'failed',
      message: 'Failed to fetch 3D generation status.',
      detail,
    });
  }
};

export const estimateCost = async (req, res) => {
  try {
    const damages = normalizeDamages(req.body?.damages || []);

    if (!damages.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one damage item is required for cost estimation.',
      });
    }

    const recommendations = mergeRecommendations(damages, req.body?.recommendations || []);
    const selectedServiceIds = asArray(req.body?.selected_services || req.body?.selectedServiceIds);

    const estimate = estimateCostFromInputs({
      damages,
      selectedServiceIds,
      recommendationPool: recommendations,
    });

    return res.json({
      success: true,
      data: {
        ...estimate,
        recommended_services: recommendations,
      },
    });
  } catch (error) {
    console.error('❌ [AI Estimate] Error:', error);
    return res.status(500).json({ success: false, message: 'Cost estimation failed.' });
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
 * Calculate Cost — Live cost recalculation with add-on service support
 * ══════════════════════════════════════════════════════════════════════════════ */
export const calculateCost = async (req, res) => {
  try {
    const damages = normalizeDamages(req.body?.damages || []);
    const recommendations = mergeRecommendations(damages, req.body?.recommendations || []);
    const selectedServiceIds = asArray(req.body?.selected_services || req.body?.selectedServiceIds);
    const addOnIds = asArray(req.body?.add_on_ids || req.body?.addOnIds);

    // Base repair cost from selected damage services
    const baseEstimate = estimateCostFromInputs({
      damages,
      selectedServiceIds,
      recommendationPool: recommendations,
    });

    // Calculate add-on totals
    let addOnTotal = 0;
    const addOnBreakdown = [];

    for (const addOnId of addOnIds) {
      const addOn = ADD_ON_SERVICES[addOnId];
      if (!addOn) continue;
      addOnTotal += addOn.flatPrice;
      addOnBreakdown.push({
        service_id: addOn.id,
        service_name: addOn.name,
        description: addOn.description,
        category: addOn.category,
        price: addOn.flatPrice,
        is_add_on: true,
      });
    }

    const finalMin = baseEstimate.min + addOnTotal;
    const finalMax = baseEstimate.max + addOnTotal;
    const recommended = roundCurrency((finalMin + finalMax) / 2);

    return res.json({
      success: true,
      data: {
        currency: 'PHP',
        min: roundCurrency(finalMin),
        max: roundCurrency(finalMax),
        recommended,
        total_estimated_cost: formatCurrencyRange(finalMin, finalMax),
        formattedRecommended: `₱${recommended.toLocaleString('en-PH')}`,
        repair_breakdown: baseEstimate.breakdown,
        add_on_breakdown: addOnBreakdown,
        add_on_total: addOnTotal,
        assumptions: [
          ...baseEstimate.assumptions,
          ...(addOnTotal > 0 ? [`Add-on services total: ₱${addOnTotal.toLocaleString('en-PH')}`] : []),
        ],
        available_add_ons: Object.values(ADD_ON_SERVICES).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          category: a.category,
          price: a.flatPrice,
          selected: addOnIds.includes(a.id),
        })),
      },
    });
  } catch (error) {
    console.error('❌ [Calculate Cost] Error:', error);
    return res.status(500).json({ success: false, message: 'Live cost calculation failed.' });
  }
};

export const confirmServiceRequest = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const {
      vehicleId,
      imageAngles,
      imageCount,
      analysis_source,
      damages,
      recommendations,
      selected_services,
      estimate,
      model_url,
      model_task_id,
      notes,
    } = req.body || {};

    const normalizedDamages = normalizeDamages(damages || []);
    if (!normalizedDamages.length) {
      return res.status(400).json({
        success: false,
        message: 'Cannot confirm request without detected damages.',
      });
    }

    const normalizedRecommendations = mergeRecommendations(normalizedDamages, recommendations || []);
    const selectedServiceIds = asArray(selected_services).map((x) => String(x));

    const computedEstimate = estimateCostFromInputs({
      damages: normalizedDamages,
      selectedServiceIds,
      recommendationPool: normalizedRecommendations,
    });

    const finalEstimate = {
      min: roundCurrency(Number(estimate?.min ?? computedEstimate.min)),
      max: roundCurrency(Number(estimate?.max ?? computedEstimate.max)),
      formattedRange: String(estimate?.formattedRange || estimate?.total_estimated_cost || computedEstimate.total_estimated_cost),
      breakdown: asArray(estimate?.breakdown).length > 0
        ? asArray(estimate.breakdown).map((line) => ({
            serviceId: String(line?.serviceId || line?.service_id || 'service'),
            serviceName: String(line?.serviceName || line?.service_name || 'Service'),
            labor: roundCurrency(Number(line?.labor || 0)),
            materials: roundCurrency(Number(line?.materials || 0)),
            subtotal: roundCurrency(
              Number(
                line?.subtotal
                || line?.subtotal_max
                || line?.subtotalMax
                || line?.subtotal_min
                || line?.subtotalMin
                || 0
              )
            ),
            affectedAreas: asArray(line?.affectedAreas || line?.affected_areas).map((a) => String(a)),
          }))
        : computedEstimate.breakdown.map((line) => ({
            serviceId: line.service_id,
            serviceName: line.service_name,
            labor: line.labor,
            materials: line.materials,
            subtotal: line.subtotal_max,
            affectedAreas: line.affected_areas,
          })),
      assumptions: asArray(estimate?.assumptions).map((x) => String(x)).filter(Boolean).length
        ? asArray(estimate?.assumptions).map((x) => String(x))
        : computedEstimate.assumptions,
    };

    const doc = await AIServiceRequest.create({
      customer: customerId,
      vehicleId: String(vehicleId || ''),
      imageAngles: asArray(imageAngles).map((x) => String(x)),
      imageCount: Number(imageCount || normalizedDamages.length || 1),
      analysisSource: analysis_source === 'rule_based' ? 'rule_based' : 'fallback',
      damages: normalizedDamages.map((d) => ({
        damageType: d.damage_type,
        affectedArea: d.affected_area,
        severity: d.severity,
        confidence: d.confidence,
        recommendedAction: d.recommended_action,
      })),
      recommendations: normalizedRecommendations.map((r) => ({
        serviceId: r.service_id,
        serviceName: r.service_name,
        description: r.description,
        urgency: r.urgency,
        relatedAreas: r.related_areas,
        estimatedMin: r.estimated_min,
        estimatedMax: r.estimated_max,
      })),
      selectedServiceIds,
      estimate: {
        min: finalEstimate.min,
        max: finalEstimate.max,
        formattedRange: finalEstimate.formattedRange,
        breakdown: finalEstimate.breakdown,
        assumptions: finalEstimate.assumptions,
      },
      modelUrl: String(model_url || ''),
      modelTaskId: String(model_task_id || ''),
      notes: String(notes || ''),
      status: 'confirmed',
    });

    return res.status(201).json({
      success: true,
      data: {
        serviceRequestId: doc._id,
        status: doc.status,
        confirmedAt: doc.createdAt,
      },
      message: 'Service request confirmed successfully.',
    });
  } catch (error) {
    console.error('❌ [AI Confirm] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to confirm service request.' });
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
 * AI Repair Preview — Inpainting via Replicate
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Download an image from a URL and return it as a Buffer + dimensions.
 */
const downloadImage = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(response.data);
};

/**
 * Generate a white-on-black damage mask PNG from bounding boxes.
 * White = inpaint (damaged area), Black = keep original.
 * Each damage zone is expanded by 20% for natural edge blending.
 */
const generateDamageMask = (imageWidth, imageHeight, damages) => {
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext('2d');

  // Fill entire canvas with black (keep original)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  // Draw white ellipses for each damage zone (expanded by 20%)
  ctx.fillStyle = '#FFFFFF';
  for (const damage of damages) {
    const bb = damage.bounding_box || damage.boundingBox;
    if (!bb) continue;

    const expand = 0.20;
    const centerX = (bb.x + bb.width / 2) * imageWidth;
    const centerY = (bb.y + bb.height / 2) * imageHeight;
    const radiusX = (bb.width / 2) * imageWidth * (1 + expand);
    const radiusY = (bb.height / 2) * imageHeight * (1 + expand);

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
};

/**
 * POST /ai/repair-preview
 *
 * Accepts: { imageUrl, damages, imageWidth?, imageHeight? }
 * Returns: { success, data: { repairedImageUrl, status } }
 */
export const generateRepairPreview = async (req, res) => {
  const startTime = Date.now();
  console.log('🎨 [Repair Preview] Starting AI inpainting...');

  try {
    const { imageUrl, damages, imageWidth, imageHeight } = req.body;

    // ── Validation ──
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'imageUrl is required.',
      });
    }

    if (!Array.isArray(damages) || damages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'damages array with bounding boxes is required.',
      });
    }

    if (!REPLICATE_API_TOKEN) {
      console.warn('⚠️  REPLICATE_API_TOKEN is not configured.');
      return res.status(200).json({
        success: false,
        status: 'unavailable',
        message: 'AI repair preview is unavailable. Configure REPLICATE_API_TOKEN to enable.',
      });
    }

    if (!isCloudinaryConfigured()) {
      return res.status(200).json({
        success: false,
        status: 'unavailable',
        message: 'AI repair preview is unavailable. Cloudinary is not configured.',
      });
    }

    // ── 1. Upload the original image to Cloudinary if not already there ──
    let sourceImageUrl = imageUrl;
    if (!imageUrl.includes('cloudinary.com') && !imageUrl.includes('res.cloudinary.com')) {
      console.log('  ↳ Uploading source image to Cloudinary...');
      const imageBuffer = await downloadImage(imageUrl);
      sourceImageUrl = await uploadBufferToCloudinary(imageBuffer, {
        folder: MESHY_CLOUDINARY_FOLDER,
        filename: 'repair_source.jpg',
        contentType: 'image/jpeg',
      });
    }
    console.log('  ↳ Source image URL:', sourceImageUrl);

    // ── 2. Determine image dimensions ──
    const width = Number(imageWidth) || 1024;
    const height = Number(imageHeight) || 768;
    console.log(`  ↳ Mask dimensions: ${width}x${height}`);

    // ── 3. Generate damage mask ──
    console.log(`  ↳ Generating mask for ${damages.length} damage zone(s)...`);
    const maskBuffer = generateDamageMask(width, height, damages);

    // ── 4. Upload mask to Cloudinary ──
    console.log('  ↳ Uploading mask to Cloudinary...');
    const maskUrl = await uploadBufferToCloudinary(maskBuffer, {
      folder: MESHY_CLOUDINARY_FOLDER,
      filename: 'damage_mask.png',
      contentType: 'image/png',
    });
    console.log('  ↳ Mask URL:', maskUrl);

    // ── 5. Call Replicate FLUX Fill Pro (primary) ──
    console.log('  ↳ Calling Replicate FLUX Fill Pro for AI inpainting...');
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    let repairedImageUrl = null;
    let usedModel = 'flux-fill-pro';

    try {
      const output = await replicate.run(
        `${FLUX_FILL_PRO_MODEL}`,
        {
          input: {
            image: sourceImageUrl,
            mask: maskUrl,
            prompt: INPAINTING_PROMPT,
            guidance: 30,
            steps: 50,
            output_format: 'jpg',
            safety_tolerance: 5,
          },
        }
      );

      // FLUX returns a single URL or ReadableStream
      if (output && typeof output === 'object' && !Array.isArray(output) && typeof output.url === 'function') {
        // It's a ReadableStream — convert to buffer and upload to Cloudinary
        const chunks = [];
        for await (const chunk of output) {
          chunks.push(Buffer.from(chunk));
        }
        const resultBuffer = Buffer.concat(chunks);
        repairedImageUrl = await uploadBufferToCloudinary(resultBuffer, {
          folder: MESHY_CLOUDINARY_FOLDER,
          filename: `repair_result_${Date.now()}.jpg`,
          contentType: 'image/jpeg',
        });
      } else if (Array.isArray(output)) {
        repairedImageUrl = typeof output[0] === 'string' ? output[0] : null;
      } else if (typeof output === 'string') {
        repairedImageUrl = output;
      }

      console.log('  ↳ FLUX Fill Pro output:', repairedImageUrl);
    } catch (fluxError) {
      const fluxStatus = fluxError?.response?.status || fluxError?.status;
      const fluxMsg = fluxError?.message || String(fluxError);
      const isBillingError = fluxStatus === 402 || fluxMsg.includes('402') || fluxMsg.toLowerCase().includes('insufficient credit');

      console.warn('  ⚠️ FLUX Fill Pro failed:', fluxMsg);
      if (fluxError?.response?.status) console.warn('  └╴ HTTP status:', fluxError.response.status, JSON.stringify(fluxError.response.data || {}));

      // ── Billing exhausted — skip fallback (it would also fail) ──
      if (isBillingError) {
        console.warn('  └╴ Replicate credits exhausted. Returning credits_exhausted.');

        return res.status(200).json({
          success: false,
          status: 'credits_exhausted',
          message: 'AI repair preview is temporarily unavailable — Replicate API credits have been exhausted. Please add billing credit at replicate.com/account/billing.',
        });
      }

      console.log('  └╴ Falling back to flux-kontext restore-image...');

      // ── Fallback: flux-kontext restore-image ──
      try {
        usedModel = 'flux-kontext-restore';
        const fallbackOutput = await replicate.run(
          `${FLUX_RESTORE_MODEL}:${FLUX_RESTORE_VERSION}`,
          {
            input: {
              image: sourceImageUrl,
              prompt: INPAINTING_PROMPT,
            },
          }
        );

        if (fallbackOutput && typeof fallbackOutput === 'object' && !Array.isArray(fallbackOutput) && typeof fallbackOutput.url === 'function') {
          const chunks = [];
          for await (const chunk of fallbackOutput) {
            chunks.push(Buffer.from(chunk));
          }
          const resultBuffer = Buffer.concat(chunks);
          repairedImageUrl = await uploadBufferToCloudinary(resultBuffer, {
            folder: MESHY_CLOUDINARY_FOLDER,
            filename: `repair_fallback_${Date.now()}.jpg`,
            contentType: 'image/jpeg',
          });
        } else if (Array.isArray(fallbackOutput)) {
          repairedImageUrl = typeof fallbackOutput[0] === 'string' ? fallbackOutput[0] : null;
        } else if (typeof fallbackOutput === 'string') {
          repairedImageUrl = fallbackOutput;
        }

        console.log('  └╴ Fallback restore output:', repairedImageUrl);
      } catch (fallbackError) {
        const fbStatus = fallbackError?.response?.status || fallbackError?.status;
        const fbMsg = fallbackError?.message || String(fallbackError);
        const fbBilling = fbStatus === 402 || fbMsg.includes('402') || fbMsg.toLowerCase().includes('insufficient credit');

        console.error('  ❌ Fallback model also failed:', fbMsg);
        if (fallbackError?.response?.status) console.error('  └╴ HTTP status:', fallbackError.response.status, JSON.stringify(fallbackError.response.data || {}));

        if (fbBilling) {
  
          return res.status(200).json({
            success: false,
            status: 'credits_exhausted',
            message: 'AI repair preview is temporarily unavailable — Replicate API credits have been exhausted.',
          });
        }
      }
    }

    // ── 6. Upload result to Cloudinary if it's a Replicate temp URL ──
    if (repairedImageUrl && !repairedImageUrl.includes('cloudinary.com')) {
      try {
        console.log('  ↳ Persisting AI result to Cloudinary...');
        const resultBuffer = await downloadImage(repairedImageUrl);
        repairedImageUrl = await uploadBufferToCloudinary(resultBuffer, {
          folder: MESHY_CLOUDINARY_FOLDER,
          filename: `repair_${usedModel}_${Date.now()}.jpg`,
          contentType: 'image/jpeg',
        });
        console.log('  ↳ Persisted to:', repairedImageUrl);
      } catch (persistErr) {
        console.warn('  ⚠️ Failed to persist to Cloudinary, using temp URL:', persistErr?.message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!repairedImageUrl || typeof repairedImageUrl !== 'string') {
      console.error('  ↳ AI model returned no valid image.');
      return res.status(200).json({
        success: false,
        status: 'failed',
        message: 'AI inpainting did not return a valid image after trying both models.',
      });
    }

    console.log(`✅ [Repair Preview] Completed via ${usedModel} in ${elapsed}s:`, repairedImageUrl);

    return res.status(200).json({
      success: true,
      status: 'completed',
      data: {
        repairedImageUrl,
        maskUrl,
        processingTimeSeconds: parseFloat(elapsed),
        model: usedModel,
      },
    });
  } catch (error) {
    console.error('❌ [Repair Preview] Error:', error?.message || error);
    return res.status(500).json({
      success: false,
      status: 'failed',
      message: error?.message || 'Failed to generate repair preview.',
    });
  }
};

export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided.' });
    }
    
    if (!isCloudinaryConfigured()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cloudinary is not configured.' 
      });
    }

    const secure_url = await uploadBufferToCloudinary(req.file.buffer, {
      folder: MESHY_CLOUDINARY_FOLDER,
      filename: req.file.originalname || `upload_${Date.now()}.jpg`,
      contentType: req.file.mimetype || 'image/jpeg',
    });

    return res.status(200).json({
      success: true,
      secure_url,
    });
  } catch (error) {
    console.error('❌ [AI Upload Image] Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image.',
    });
  }
};

