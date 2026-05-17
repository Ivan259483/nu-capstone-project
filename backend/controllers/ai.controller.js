import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { createHash } from 'crypto';

// canvas is a native C++ addon (requires cairo). Graceful import to prevent
// crashing the entire controller if system libs are missing on Railway.
let createCanvas = null;
try {
  const canvasModule = await import('canvas');
  createCanvas = canvasModule.createCanvas;
} catch (_) {
  console.warn('[AI Controller] ⚠️  canvas module unavailable — mask generation disabled');
}
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
import { analyzeWithRoboflow, isRoboflowAvailable } from '../utils/roboflowVision.utils.js';
import AIScan from '../models/aiScan.model.js';
import { analyzeWithGPTVision, isOpenAIConfigured } from '../services/gptVision.service.js';
import {
  startMeshyImageTo3D,
  getMeshyTaskStatus,
  meshyDependencyStatus,
} from '../services/meshy.service.js';
import { buildEstimateFromDamages } from '../services/estimator.service.js';

// ── Module-level Replicate session state ──────────────────────────────────────
// Set to true once a 402 is received so we skip all subsequent calls this
// process lifetime, avoiding 1.5 s latency hits per scan/preview request.
let replicateCreditsExhausted = false;

// Set DISABLE_REPLICATE=true in .env to permanently skip Replicate calls
// (survives nodemon restarts unlike the runtime flag above).
const REPLICATE_DISABLED = process.env.DISABLE_REPLICATE === 'true';


const MESHY_API_KEY = process.env.MESHY_API_KEY || '';
const OFFICIAL_MESHY_API_BASE = 'https://api.meshy.ai/openapi/v1';
const MESHY_API_BASE = (process.env.MESHY_API_BASE_URL || OFFICIAL_MESHY_API_BASE).replace(/\/+$/, '');
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
const WEBAR_TARGET_PATH = '/webar/targets/autospf-vehicle.mind';
const WEBAR_TARGET_IMAGE_PATH = '/webar/targets/autospf-vehicle.png';
const WEBAR_FALLBACK_MODEL_PATH = '/webar/models/fallback-car.glb';
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

const isGlbUrl = (url) => {
  if (typeof url !== 'string') return false;
  const cleaned = url.split('?')[0].split('#')[0].toLowerCase().trim();
  return cleaned.endsWith('.glb');
};

const collectUrlStrings = (value, label, acc = []) => {
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

const logMeshyUrlDiagnostics = (payload = {}) => {
  console.log('[Meshy] Available model_urls:', JSON.stringify({
    model_urls: payload?.model_urls || null,
    result_model_urls: payload?.result?.model_urls || null,
    output_model_urls: payload?.output?.model_urls || null,
    data_model_urls: payload?.data?.model_urls || null,
  }));
  console.log('[Meshy] Available texture_urls:', JSON.stringify({
    texture_urls: payload?.texture_urls || null,
    result_texture_urls: payload?.result?.texture_urls || null,
    output_texture_urls: payload?.output?.texture_urls || null,
    data_texture_urls: payload?.data?.texture_urls || null,
  }));
};

const extractModelUrl = (payload = {}) => {
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
      console.log('[Meshy] Selected GLB URL:', selectedUrl);
      return selectedUrl;
    }
    console.warn(`[Meshy] Rejected non-GLB model URL candidate (${candidate.label}):`, candidate.url);
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

  rejectedCandidates.forEach(({ label, url }) => {
    if (typeof url === 'string' && url.trim() && !isGlbUrl(url)) {
      console.warn(`[Meshy] Rejected non-GLB URL (${label}):`, url);
    }
  });

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

const buildMeshyHeaders = (extra = {}) => ({
  Authorization: `Bearer ${MESHY_API_KEY}`,
  ...extra,
});

const get3DDependencyStatus = () => {
  if (!MESHY_API_KEY) {
    return {
      available: false,
      message: '3D generation is unavailable because MESHY_API_KEY is not configured.',
      reason: 'missing meshy configuration',
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

  // Meshy Image-to-3D endpoint with PBR textures
  const jsonPayload = {
    image_url: cloudinaryUrls[0],
    enable_pbr: true,
    should_remesh: true,
    should_texture: true,
    target_polycount: 30000,
    target_formats: ['glb'],
  };

  console.log('[Meshy] Starting image-to-3d with payload:', JSON.stringify(jsonPayload, null, 2));

  const jsonResp = await axios.post(
    `${MESHY_API_BASE}/image-to-3d`,
    jsonPayload,
    {
      headers: buildMeshyHeaders({ 'Content-Type': 'application/json' }),
      timeout: 60000,
    }
  );

  console.log('[Meshy] Response:', JSON.stringify(jsonResp.data, null, 2));

  return {
    ...(jsonResp.data || {}),
    source_image_urls: cloudinaryUrls,
  };
};

/**
 * Fetch a Meshy task status.
 * @param {string} taskId
 * @param {string} [pollBase] - The confirmed working base URL. Probes all candidates on 404 if omitted.
 */
const fetchMeshyTask = async (taskId, pollBase = null) => {
  // Build probe list: working base first (if known), then all candidates for robustness
  const probeList = [...new Set([
    ...(pollBase ? [pollBase] : []),
    OFFICIAL_MESHY_API_BASE,
    MESHY_API_BASE,
    'https://api.meshy.ai/openapi/v2',
    'https://api.meshy.ai/v2',
    'https://api.meshy.ai/v1',
  ])];

  for (const base of probeList) {
    const pollUrl = `${base}/image-to-3d/${taskId}`;
    console.log(`[Meshy] GET poll: ${pollUrl}`);
    try {
      const response = await axios.get(pollUrl, {
        headers: buildMeshyHeaders(),
        timeout: 45000,
      });
      return response.data;
    } catch (error) {
      const httpStatus = error?.response?.status ?? 'no-response';
      const responseBody = error?.response?.data ?? null;
      console.warn(`[Meshy] ❌ poll ${httpStatus}: ${pollUrl} → ${JSON.stringify(responseBody)}`);
      if (httpStatus !== 404 && httpStatus !== 405 && httpStatus !== 'no-response') throw error;
    }
  }

  throw new Error(`All Meshy poll endpoints returned 404/405 for task ${taskId}`);
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
  `srv_scan_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

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
        `[AI Analyze][${requestId}] Scan started (images=${req.files.length}, key=${fingerprintShort})`
      );

      // ── Try Groq Vision AI first (analyzeWithRoboflow now uses Groq internally) ──
      if (isRoboflowAvailable()) {
        try {
          console.log(`[AI Analyze][${requestId}] Sending images to Groq Vision AI...`);
          const aiResult = await analyzeWithRoboflow(req.files, angleHints);

          if (aiResult.damages.length > 0) {
            const damages = normalizeDamages(aiResult.damages, angleHints);
            const recommendations = mergeRecommendations(damages, []);
            const aiSource = aiResult.source || 'groq_vision';
            const data = buildAnalyzeResponse({
              status: 'damage_detected',
              message: aiResult.summary || 'AI damage analysis complete.',
              damages,
              recommendations,
              source: aiSource,
            });

            console.log(`[AI Analyze][${requestId}] Groq Vision detected ${damages.length} damage(s)`);
            return {
              statusCode: 200,
              payload: { success: true, data, source: aiSource },
            };
          }

          if (!aiResult.vehicle_detected) {
            console.log(`[AI Analyze][${requestId}] Groq Vision: no vehicle detected, falling back to offline engine`);
          } else {
            console.log(`[AI Analyze][${requestId}] Groq Vision: no damages found, falling back to offline engine`);
          }
        } catch (aiError) {
          console.warn(
            `[AI Analyze][${requestId}] Groq Vision failed, falling back to offline engine:`,
            aiError?.message || aiError
          );
        }
      } else {
        console.log(`[AI Analyze][${requestId}] GROQ_API_KEY not configured, using offline engine`);
      }

      // ── Offline fallback ──
      console.log(`[AI Analyze][${requestId}] Generating damage assessment using offline analysis engine...`);
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

    const dep = get3DDependencyStatus();
    if (!dep.available) {
      return res.status(503).json({
        success: false,
        status: 'unavailable',
        message: dep.message,
        reason: dep.reason,
      });
    }

    console.log('[Meshy] Starting real image-to-3D task...');
    const taskData = await startMeshyImageTo3D(req.files);
    const taskId = taskData.taskId || extractTaskId(taskData.raw || {});

    if (!taskId) {
      console.error('[Meshy] No task ID returned from Meshy:', JSON.stringify(taskData));
      return res.status(502).json({
        success: false,
        status: 'failed',
        message: 'Meshy did not return a task ID. Please try again.',
      });
    }

    console.log(`[Meshy] Task started successfully. task_id=${taskId}`);

    return res.json({
      success: true,
      status: 'processing',
      task_id: taskId,
      meshy_poll_base: taskData.workingBase || '',
      progress: 0,
      message: '3D model generation started. Poll /status/:taskId for updates.',
      source_image_urls: taskData.sourceImageUrls || [],
    });

  } catch (error) {
    const detail = error?.response?.data || error?.message || 'Unknown error';
    console.error('❌ [Generate 3D] Meshy API error:', detail);
    const detailMessage =
      detail?.error?.message ||
      detail?.message ||
      (typeof detail === 'string' ? detail : '');
    return res.status(502).json({
      success: false,
      status: 'failed',
      message: detailMessage || 'Failed to start 3D model generation via Meshy.',
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

    // Look up the scan to retrieve the confirmed working poll base from when the task was started.
    // This ensures polling hits exactly the same Meshy endpoint variant as the POST that created the task.
    let pollBase = null;
    try {
      const scan = await AIScan.findOne({ modelTaskId: taskId }).select('meshyPollBase').lean();
      if (scan?.meshyPollBase) {
        pollBase = scan.meshyPollBase;
        console.log(`[Meshy Poll] Using stored pollBase for ${taskId}: ${pollBase}`);
      }
    } catch (dbErr) {
      console.warn(`[Meshy Poll] DB lookup failed (non-fatal) for taskId=${taskId}:`, dbErr?.message);
    }

    const payload = await fetchMeshyTask(taskId, pollBase);
    console.log(`[AI Scan][Meshy] Poll response for ${taskId}:`, JSON.stringify(payload, null, 2));
    const status = normalizeMeshyStatus(payload?.status || payload?.result?.status);
    if (status === 'ar_ready') {
      logMeshyUrlDiagnostics(payload);
    }
    const modelUrl = extractModelUrl(payload);

    if (status === 'ar_ready' && modelUrl) {
      try {
        await AIScan.findOneAndUpdate(
          { modelTaskId: taskId },
          {
            modelStatus: 'ready',
            modelUrl,
            repairedModelUrl: modelUrl,
          }
        );
      } catch (dbErr) {
        console.warn(`[Meshy Poll] Could not persist ready model for taskId=${taskId}:`, dbErr?.message);
      }

      return res.json({
        success: true,
        status: 'ar_ready',
        model_url: modelUrl,
        repaired_model_url: modelUrl,
        progress: 100,
        task_id: taskId,
      });
    }

    if (status === 'ar_ready' && !modelUrl) {
      console.error(`[Meshy] Task ${taskId} succeeded but no .glb URL was returned.`);
      return res.status(502).json({
        success: false,
        status: 'failed',
        task_id: taskId,
        message: 'Meshy completed the task but did not return a GLB model URL. Check backend Meshy URL diagnostics.',
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
  if (!createCanvas) {
    throw new Error('canvas module unavailable — cannot generate damage mask');
  }
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
  console.log(
    `  ↳ DISABLE_REPLICATE=${process.env.DISABLE_REPLICATE} | ` +
    `REPLICATE_DISABLED const=${REPLICATE_DISABLED} | ` +
    `replicateCreditsExhausted=${replicateCreditsExhausted}`
  );

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

    // ── Env-var hard disable (persists across restarts) ──
    if (REPLICATE_DISABLED) {
      console.log('  ↳ [Repair Preview] DISABLE_REPLICATE=true — returning placeholder instantly.');
      return res.status(200).json({
        success: false,
        status: 'credits_exhausted',
        message: 'AI repair preview is temporarily disabled. Enable Replicate billing to restore.',
      });
    }

    // ── Runtime flag (set after first 402 this session) ──
    if (replicateCreditsExhausted) {
      console.log('  ↳ [Repair Preview] Replicate credits exhausted (cached) — returning placeholder.');
      return res.status(200).json({
        success: false,
        status: 'credits_exhausted',
        message: 'AI repair preview is temporarily unavailable — Replicate credits exhausted.',
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

      // ── Billing exhausted — set flag, skip fallback (it would also fail) ──
      if (isBillingError) {
        replicateCreditsExhausted = true; // short-circuit all future calls this session
        console.warn('  └╴ Replicate credits exhausted — flagged for session. Returning credits_exhausted.');

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

/* ══════════════════════════════════════════════════════════════════════════════
 * NEW AI SCAN MODULE — GPT-4 Vision (mock+real toggle), Meshy 3D, Estimator
 * Endpoints:
 *   POST /api/ai/scan          → analyze damage with GPT-4 Vision (mock if no key)
 *   GET  /api/ai/scan/:id      → fetch a saved scan by id
 *   POST /api/ai/generate-3d   → start Meshy AI .glb generation
 *   GET  /api/ai/generate-3d/:taskId → poll Meshy progress
 *   POST /api/ai/estimate      → recompute estimate from damage list
 * ══════════════════════════════════════════════════════════════════════════════ */

const parseJsonField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * POST /api/ai/scan
 * Body (multipart):
 *   images   — 1..5 image files
 *   angles   — JSON array of angle hints, e.g. ["front", "rear"]
 *   vehicleId — optional vehicle id to associate with the scan
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       scanId, source, model, vehicleDetected, overallCondition,
 *       recommendedPackage, urgency, summary, damages[], estimate,
 *       imageUrls[], createdAt
 *     }
 *   }
 */
export const scanWithGPTVision = async (req, res) => {
  const requestId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  try {
    const validationMessage = validateUploads(req.files);
    if (validationMessage) {
      return res.status(400).json({
        success: false,
        message: validationMessage,
        request_id: requestId,
      });
    }

    const angles = parseJsonField(req.body?.angles).map(String);
    const vehicleId = String(req.body?.vehicleId || '').trim();

    console.log(
      `[AI Scan][${requestId}] Starting (images=${req.files.length}, angles=${angles.length}, vehicleId=${vehicleId || '-'})`
    );

    // ── 1. Analyze with GPT-4 Vision (mock if OPENAI_API_KEY is empty) ──
    const analysis = await analyzeWithGPTVision(req.files, {
      angles,
      requestId,
    });

    // ── 2. Build cost estimate from detected damages ──
    const estimate = buildEstimateFromDamages(analysis.damages);

    // ── 3. Best-effort upload images so the mobile app can render them ──
    let imageUrls = [];
    if (isCloudinaryConfigured()) {
      try {
        imageUrls = await uploadVehicleScanImages(req.files, {
          folder: MESHY_CLOUDINARY_FOLDER,
        });
      } catch (uploadErr) {
        console.warn(
          `[AI Scan][${requestId}] Cloudinary upload failed (non-fatal):`,
          uploadErr?.message || uploadErr
        );
      }
    }

    // ── 4. Persist the scan so it can be retrieved later ──
    let scanDoc = null;
    try {
      scanDoc = await AIScan.create({
        customer: req.user?.id || undefined,
        vehicleId,
        imageUrls,
        angles,
        imageCount: req.files.length,
        source: analysis.source,
        model: analysis.model,
        vehicleDetected: analysis.vehicleDetected,
        overallCondition: analysis.overallCondition,
        recommendedPackage: analysis.recommendedPackage,
        urgency: analysis.urgency,
        summary: analysis.summary,
        damages: analysis.damages,
        estimate,
        modelStatus: 'idle',
      });
    } catch (dbErr) {
      console.warn(
        `[AI Scan][${requestId}] Persist failed (non-fatal):`,
        dbErr?.message || dbErr
      );
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[AI Scan][${requestId}] Completed in ${elapsed}ms — source=${analysis.source}, damages=${analysis.damages.length}`
    );

    return res.json({
      success: true,
      request_id: requestId,
      data: {
        scanId: scanDoc?._id ? String(scanDoc._id) : null,
        source: analysis.source,
        model: analysis.model,
        vehicleDetected: analysis.vehicleDetected,
        overallCondition: analysis.overallCondition,
        recommendedPackage: analysis.recommendedPackage,
        urgency: analysis.urgency,
        summary: analysis.summary,
        damages: analysis.damages,
        estimate,
        imageUrls,
        angles,
        vehicleId,
        openaiConfigured: isOpenAIConfigured(),
        meshyConfigured: meshyDependencyStatus().available,
        createdAt: scanDoc?.createdAt || new Date().toISOString(),
        elapsedMs: elapsed,
      },
    });
  } catch (error) {
    console.error(`[AI Scan][${requestId}] Error:`, error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'AI scan failed.',
      request_id: requestId,
    });
  }
};

/**
 * GET /api/ai/scan/:id
 * Returns a previously saved scan document.
 */
export const getScanById = async (req, res) => {
  try {
    const scanId = String(req.params.id || '').trim();
    if (!scanId) {
      return res.status(400).json({ success: false, message: 'Scan id is required.' });
    }

    const scan = await AIScan.findById(scanId).lean();
    if (!scan) {
      return res.status(404).json({ success: false, message: 'Scan not found.' });
    }

    // If a customer is authenticated, ensure they only see their own scans.
    if (req.user?.id && scan.customer && String(scan.customer) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    return res.json({
      success: true,
      data: {
        scanId: String(scan._id),
        source: scan.source,
        model: scan.model,
        vehicleDetected: scan.vehicleDetected,
        overallCondition: scan.overallCondition,
        recommendedPackage: scan.recommendedPackage,
        urgency: scan.urgency,
        summary: scan.summary,
        damages: scan.damages || [],
        estimate: scan.estimate || {},
        imageUrls: scan.imageUrls || [],
        angles: scan.angles || [],
        vehicleId: scan.vehicleId || '',
        modelTaskId: scan.modelTaskId || '',
        modelUrl: scan.modelUrl || '',
        repairedModelUrl: scan.repairedModelUrl || '',
        modelStatus: scan.modelStatus || 'idle',
        createdAt: scan.createdAt,
      },
    });
  } catch (error) {
    console.error('[AI Scan][getScanById] Error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch scan.',
    });
  }
};

const getPublicOrigin = (req) => {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
};

const toPublicUrl = (req, pathname) => new URL(pathname, getPublicOrigin(req)).toString();

const toSafeWebARDamage = (damage = {}) => ({
  id: String(damage.id || ''),
  type: String(damage.type || 'Damage'),
  severity: ['high', 'medium', 'low'].includes(damage.severity) ? damage.severity : 'medium',
  description: String(damage.description || ''),
  confidence: Math.max(0, Math.min(1, Number(damage.confidence) || 0)),
  affectedArea: String(damage.affectedArea || 'Vehicle Body'),
  imageIndex: Number.isFinite(Number(damage.imageIndex)) ? Number(damage.imageIndex) : 0,
  angleHint: String(damage.angleHint || 'close_up'),
  urgency: String(damage.urgency || 'Can Wait'),
  coordinates: {
    x: Math.max(0, Math.min(1, Number(damage.coordinates?.x) || 0)),
    y: Math.max(0, Math.min(1, Number(damage.coordinates?.y) || 0)),
    width: Math.max(0.02, Math.min(1, Number(damage.coordinates?.width) || 0.12)),
    height: Math.max(0.02, Math.min(1, Number(damage.coordinates?.height) || 0.12)),
  },
});

const buildProxiedGlbUrl = (req, rawUrl) => {
  const modelUrl = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(modelUrl)) return '';
  return toPublicUrl(req, `/api/ai/proxy-glb?url=${encodeURIComponent(modelUrl)}`);
};

/**
 * GET /api/ai/webar-session/:scanId
 * Returns the minimal browser-safe payload needed by the static WebAR page.
 *
 * The route intentionally omits customer data, raw scan image URLs, notes, and
 * estimate details. If a bearer token is present, ownership is enforced; without
 * a token the response remains limited to unguessable scan IDs and safe AR data
 * so external browser launch works from the mobile app.
 */
export const getWebARSession = async (req, res) => {
  try {
    const scanId = String(req.params.scanId || '').trim();
    if (!scanId) {
      return res.status(400).json({ success: false, message: 'Scan id is required.' });
    }

    const scan = await AIScan.findById(scanId).lean();
    if (!scan) {
      return res.status(404).json({ success: false, message: 'Scan not found.' });
    }

    if (req.user?.id && scan.customer && String(scan.customer) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const fallbackModelUrl = toPublicUrl(req, WEBAR_FALLBACK_MODEL_PATH);
    const proxiedModelUrl = buildProxiedGlbUrl(req, scan.modelUrl);
    const modelReady = Boolean(proxiedModelUrl);
    const modelStatus = modelReady ? 'ready' : String(scan.modelStatus || 'idle');

    return res.json({
      success: true,
      data: {
        scanId: String(scan._id),
        title: 'AutoSPF+ repair simulation',
        modelStatus,
        modelTaskId: scan.modelTaskId || '',
        modelSource: modelReady ? 'meshy' : 'fallback',
        modelUrl: modelReady ? proxiedModelUrl : fallbackModelUrl,
        repairedModelUrl: modelReady
          ? buildProxiedGlbUrl(req, scan.repairedModelUrl || scan.modelUrl)
          : fallbackModelUrl,
        fallbackModelUrl,
        targetUrl: toPublicUrl(req, WEBAR_TARGET_PATH),
        targetImageUrl: toPublicUrl(req, WEBAR_TARGET_IMAGE_PATH),
        vehicleDetected: scan.vehicleDetected !== false,
        overallCondition: scan.overallCondition || 'Fair',
        recommendedPackage: scan.recommendedPackage || '',
        urgency: scan.urgency || 'Can Wait',
        summary: scan.summary || '',
        damages: (scan.damages || []).map(toSafeWebARDamage),
        createdAt: scan.createdAt,
      },
    });
  } catch (error) {
    console.error('[AI Scan][getWebARSession] Error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to build WebAR session.',
    });
  }
};

/**
 * POST /api/ai/generate-3d-from-scan
 * Body: { scanId } — uses the images already uploaded with the scan
 * Returns: { task_id, source_image_urls, ... }
 *
 * The existing /api/ai/generate-3d route accepts raw multipart files.
 * This new endpoint lets the mobile client kick off a Meshy task using
 * the images that were saved during the /api/ai/scan call.
 */
export const generate3DFromScan = async (req, res) => {
  try {
    const scanId = String(req.body?.scanId || '').trim();
    if (!scanId) {
      return res.status(400).json({ success: false, message: 'scanId is required.' });
    }

    const scan = await AIScan.findById(scanId);
    if (!scan) {
      return res.status(404).json({ success: false, message: 'Scan not found.' });
    }

    if (!Array.isArray(scan.imageUrls) || scan.imageUrls.length === 0) {
      const missingCloud = getCloudinaryMissingConfigMessage().trim();
      const message = !isCloudinaryConfigured()
        ? `This scan has no stored image URLs because Cloudinary is not configured on the API server (${
            missingCloud || 'set CLOUDINARY_* env vars'
          }). Damage analysis can still run from raw uploads, but 3D needs hosted URLs—configure Cloudinary and run a new scan.`
        : 'This scan has no uploaded images. Re-run the scan to enable 3D generation. If this keeps happening, check API logs for Cloudinary upload errors during POST /api/ai/scan.';
      return res.status(400).json({
        success: false,
        message,
      });
    }

    const dep = meshyDependencyStatus();
    if (!dep.available) {
      return res.status(503).json({
        success: false,
        status: 'unavailable',
        message: dep.message,
      });
    }

    const rawSourceUrl = String(scan.imageUrls[0] || '').trim();
    if (!/^https?:\/\//i.test(rawSourceUrl)) {
      return res.status(400).json({
        success: false,
        status: 'failed',
        message: 'Meshy requires a hosted image URL. Re-run scan upload.',
      });
    }

    // Force a Meshy-compatible Cloudinary JPG URL.
    // Problem: f_jpg,q_auto converts the content but the URL path still ends in .webp
    // which causes Meshy to reject the image based on the extension alone.
    // Fix: apply f_jpg transformation AND replace the non-jpg extension in the path.
    const sourceImageUrl = (() => {
      if (!rawSourceUrl.includes('/res.cloudinary.com/')) return rawSourceUrl;
      if (!rawSourceUrl.includes('/image/upload/')) return rawSourceUrl;
      let url = rawSourceUrl;
      // Inject format transformation only if not already present
      if (!/\/f_jpg/.test(url)) {
        url = url.replace('/image/upload/', '/image/upload/f_jpg,q_auto/');
      }
      // Replace any non-jpg extension with .jpg — the URL extension must match the delivery format
      url = url.replace(/\.(webp|avif|heic|heif|gif|bmp|tiff?)(\?|#|$)/i, '.jpg$2');
      return url;
    })();

    const payload = {
      image_url: sourceImageUrl,
      enable_pbr: true,
      should_remesh: true,
      should_texture: true,
      target_polycount: 30000,
      target_formats: ['glb'],
    };

    // Probe all known Meshy endpoint variants in priority order.
    // Different account plans expose different route prefixes — auto-detect which one works.
    const MESHY_ENDPOINT_CANDIDATES = [
      `${OFFICIAL_MESHY_API_BASE}/image-to-3d`,
      `${MESHY_API_BASE}/image-to-3d`,
      'https://api.meshy.ai/openapi/v2/image-to-3d',
      'https://api.meshy.ai/v2/image-to-3d',
      'https://api.meshy.ai/v1/image-to-3d',
      'https://api.meshy.ai/v2/image-to-3d-beta',
    ];
    // Deduplicate in case MESHY_API_BASE matches one of the fallbacks
    const probeList = [...new Set(MESHY_ENDPOINT_CANDIDATES)];

    console.log('[AI Scan][Meshy] ▶ Starting 3D generation');
    console.log(`  ↳ Key prefix   : ${MESHY_API_KEY.slice(0, 8)}***  (set: ${Boolean(MESHY_API_KEY)})`);
    console.log(`  ↳ Image URL    : ${sourceImageUrl}`);
    console.log(`  ↳ Probing ${probeList.length} endpoint candidates...`);

    let response;
    let usedEndpoint = '';
    for (const endpointUrl of probeList) {
      console.log(`  ↳ Trying       : ${endpointUrl}`);
      try {
        response = await axios.post(endpointUrl, payload, {
          headers: {
            Authorization: `Bearer ${MESHY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60_000,
        });
        usedEndpoint = endpointUrl;
        console.log(`  ↳ ✅ Success    : ${endpointUrl}`);
        break; // found a working endpoint
      } catch (error) {
        const httpStatus = error?.response?.status ?? 'no-response';
        const responseBody = error?.response?.data ?? null;
        console.warn(`  ↳ ❌ ${httpStatus}       : ${endpointUrl} → ${JSON.stringify(responseBody)}`);
        // Only fall through on routing errors (404/405); any other error is fatal
        if (httpStatus !== 404 && httpStatus !== 405 && httpStatus !== 'no-response') {
          throw error;
        }
      }
    }

    if (!response) {
      const msg = `All Meshy endpoint candidates returned 404/405. Tried: ${probeList.join(', ')}`;
      console.error(`[AI Scan][Meshy] ❌ ${msg}`);
      return res.status(502).json({
        success: false,
        status: 'failed',
        message: msg,
      });
    }

    console.log(`[AI Scan][Meshy] Start response (via ${usedEndpoint}):`, JSON.stringify(response.data, null, 2));

    const taskId =
      response.data?.task_id ||
      response.data?.id ||
      response.data?.result ||
      response.data?.result?.id ||
      '';

    if (!taskId) {
      return res.status(502).json({
        success: false,
        message: 'Meshy did not return a task ID.',
        detail: response.data,
      });
    }

    // Derive and persist the working poll base so GET /generate-3d/:taskId uses the same URL.
    // e.g. "https://api.meshy.ai/v1/image-to-3d" → "https://api.meshy.ai/v1"
    const workingBase = usedEndpoint.replace(/\/image-to-3d(-beta)?$/, '');
    console.log(`[AI Scan][Meshy] Working poll base saved: ${workingBase}`);

    scan.modelTaskId = String(taskId);
    scan.modelStatus = 'processing';
    scan.meshyPollBase = workingBase;
    await scan.save();

    return res.json({
      success: true,
      status: 'processing',
      task_id: String(taskId),
      meshy_poll_base: workingBase,
      progress: 0,
      source_image_urls: scan.imageUrls,
      scanId,
    });
  } catch (error) {
    const detail = error?.response?.data || error?.message || 'Unknown error';
    console.error('[AI Scan][generate3DFromScan] Error:', detail);
    return res.status(502).json({
      success: false,
      status: 'failed',
      message: 'Failed to start 3D model generation.',
      detail,
    });
  }
};

/**
 * POST /api/ai/estimate-from-damages
 * Body: { damages: [...] }
 * Returns: { lineItems, totalEstimate, recommendedPackage, savingsAmount, ... }
 *
 * This new endpoint accepts the GPT-4 Vision damage shape directly and
 * returns the customer-facing estimate. The existing /api/ai/estimate is
 * preserved for the legacy scan flow.
 */
/**
 * GET /api/ai/proxy-glb?url=ENCODED_MESHY_SIGNED_URL
 *
 * Fetches a Meshy-signed GLB from the server side and pipes it to the client
 * with CORS headers. This is required because Meshy's CDN (assets.meshy.ai)
 * blocks cross-origin fetches from arbitrary HTTP origins (e.g. the local dev
 * backend IP used as the WebView baseUrl). Proxying through our own backend
 * makes the request originate from the server, bypassing the CDN CORS policy.
 */
export const proxyGlb = async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();

  if (!rawUrl) {
    return res.status(400).json({ success: false, message: 'Missing ?url= parameter.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid URL.' });
  }

  // Only proxy Meshy CDN and Cloudinary assets — never act as an open relay
  const ALLOWED_HOSTS = ['assets.meshy.ai', 'res.cloudinary.com', 'storage.googleapis.com'];
  if (!ALLOWED_HOSTS.some((h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
    return res.status(403).json({ success: false, message: 'Host not allowed for proxy.' });
  }

  try {
    console.log('[proxy-glb] Fetching:', rawUrl.slice(0, 120) + (rawUrl.length > 120 ? '…' : ''));
    const upstream = await axios.get(rawUrl, {
      responseType: 'stream',
      timeout: 60_000,
      headers: {
        'User-Agent': 'AutoSPF-Backend/1.0',
        Accept: 'model/gltf-binary,application/octet-stream,*/*',
      },
    });

    // Permissive CORS so the WebView page on any local IP can load it
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'model/gltf-binary');

    const contentLength = upstream.headers['content-length'];
    if (contentLength) res.setHeader('Content-Length', contentLength);

    console.log('[proxy-glb] Streaming', contentLength ? `${(parseInt(contentLength) / 1024 / 1024).toFixed(1)} MB` : 'unknown size');
    upstream.data.pipe(res);
  } catch (error) {
    const status = error?.response?.status;
    const detail = error?.message || 'Unknown error';
    console.error(`[proxy-glb] ❌ Upstream ${status || 'ERR'}: ${detail}`);
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: `Failed to fetch GLB: ${detail}` });
    }
  }
};

/**
 * GET /api/ai/scans
 * Returns a paginated list of recent AI scan documents for the QC staff portal.
 * Populates the customer reference so the portal can show owner names.
 */
export const listAiScans = async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 50, 100);
    const skip   = Number(req.query.skip) || 0;
    const filter = {};
    if (req.query.modelStatus) filter.modelStatus = req.query.modelStatus;

    const [scans, total] = await Promise.all([
      AIScan.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name firstName lastName email phoneNumber')
        .lean(),
      AIScan.countDocuments(filter),
    ]);

    return res.json({ success: true, data: scans, total });
  } catch (error) {
    console.error('[AI] listAiScans error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to fetch scans.' });
  }
};

export const estimateFromDamages = async (req, res) => {
  try {
    const damages = Array.isArray(req.body?.damages) ? req.body.damages : [];
    if (!damages.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one damage item is required.',
      });
    }

    const estimate = buildEstimateFromDamages(damages);
    return res.json({ success: true, data: estimate });
  } catch (error) {
    console.error('[AI Scan][estimateFromDamages] Error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Estimate generation failed.',
    });
  }
};
