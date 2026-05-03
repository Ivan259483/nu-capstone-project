import { AxiosError } from 'axios';
import { apiClient, getApiErrorMessage } from './client';
import { authStorage } from '@/services/storage/authStorage';
import type {
  AnalysisResult,
  ConfirmationResult,
  CostEstimate,
  DamageBoundingBox,
  DamageIssue,
  ModelGenerationResult,
  ServiceRecommendation,
  VehicleImageInput,
  WorkflowError,
} from '@/features/ai-scan/types';
import { buildOfflineDamageAnalysis } from '@/features/ai-scan/offlineDamageEngine';
import { formatPhp, isValidGlbUrl } from '@/features/ai-scan/utils';

type UploadProgressCallback = (progress: number) => void;

const inFlightAnalyzeRequests = new Map<string, Promise<AnalysisResult>>();

const createClientRequestId = (): string =>
  `scan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const buildAnalyzeRequestKey = (images: VehicleImageInput[]): string => {
  const imageSignature = images
    .map((image) =>
      [
        image.angle,
        image.selectedDamageArea,
        image.fileName || 'unnamed',
        image.mimeType || 'image/jpeg',
        image.fileSize || 0,
        image.width || 0,
        image.height || 0,
        image.uri.slice(-48),
      ].join(':')
    )
    .sort()
    .join('|');

  return `${images.length}:${imageSignature}`;
};

/**
 * Validates that a model URL is a genuine GLB file.
 * Returns the URL if valid, or undefined if it's an image URL or invalid.
 */
const validateModelUrl = (rawUrl: unknown): string | undefined => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return undefined;
  if (isValidGlbUrl(rawUrl)) return rawUrl;
  console.warn('[aiService] Rejected non-GLB model URL:', rawUrl);
  return undefined;
};

const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const toSeverity = (value: unknown): DamageIssue['severity'] => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('severe') || normalized.includes('high')) return 'severe';
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'moderate';
  return 'minor';
};

const toUrgency = (value: unknown): ServiceRecommendation['urgency'] => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('immediate') || normalized.includes('urgent')) return 'Immediate';
  if (normalized.includes('optional') || normalized.includes('low')) return 'Optional';
  return 'Can Wait';
};

const clampConfidence = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return Number(numeric.toFixed(2));
};

const buildError = (code: string, message: string, retryable = true): WorkflowError => ({
  code,
  message,
  retryable,
});

const createFallbackAnalysis = (
  images: VehicleImageInput[],
  fallbackReason: string
): AnalysisResult => {
  const offline = buildOfflineDamageAnalysis(images);
  return {
    ...offline,
    message: 'Offline scan completed with fallback defaults.',
    source: 'fallback',
    fallbackReason,
  };
};

const createMultipartPayload = (images: VehicleImageInput[]): FormData => {
  const formData = new FormData();

  images.forEach((image, index) => {
    formData.append('images', {
      uri: image.uri,
      name: image.fileName || `vehicle_${index + 1}.jpg`,
      type: image.mimeType || 'image/jpeg',
    } as never);
  });

  formData.append('angles', JSON.stringify(images.map((image) => image.angle)));
  formData.append('selected_areas', JSON.stringify(images.map((image) => image.selectedDamageArea)));
  formData.append('image_meta', JSON.stringify(images.map((image, index) => ({
    angle: image.angle,
    selectedDamageArea: image.selectedDamageArea,
    width: image.width || 0,
    height: image.height || 0,
    fileSize: image.fileSize || 0,
    mimeType: image.mimeType || 'image/jpeg',
    fileName: image.fileName || `vehicle_${index + 1}.jpg`,
  }))));

  return formData;
};

const normalizeBoundingBox = (raw: unknown): DamageBoundingBox | null => {
  if (!raw || typeof raw !== 'object') return null;
  const box = raw as Record<string, unknown>;
  const x = Math.max(0, Math.min(1, Number(box.x || 0)));
  const y = Math.max(0, Math.min(1, Number(box.y || 0)));
  const width = Math.max(0.02, Math.min(1 - x, Number(box.width || 0.1)));
  const height = Math.max(0.02, Math.min(1 - y, Number(box.height || 0.1)));
  return { x, y, width, height };
};

const normalizeIssues = (rawDamages: unknown[]): DamageIssue[] => {
  return safeArray<Record<string, unknown>>(rawDamages)
    .map((row, index): DamageIssue | null => {
      const damageType = String(row.damage_type || row.type || row.name || '').trim();
      const affectedArea = String(row.affected_area || row.part || row.panel || '').trim();
      if (!damageType || !affectedArea) return null;

      const suggestedServices = safeArray<string>(row.suggested_services).map((id) => String(id)).filter(Boolean);
      const boundingBox = normalizeBoundingBox(row.bounding_box);
      const imageIndex = Number.isFinite(Number(row.image_index)) ? Number(row.image_index) : 0;

      return {
        id: String(row.id || `damage_${index + 1}`),
        damageType,
        originalDamageType: String(row.original_damage_type || row.damage_type || damageType),
        affectedArea: String(row.location || affectedArea).trim(),
        location: String(row.location || affectedArea).trim(),
        confidence: clampConfidence(row.confidence),
        severity: toSeverity(row.severity),
        recommendedAction: String(row.recommended_action || row.action || 'Inspection recommended'),
        suggestedServices,
        boundingBox,
        imageIndex,
        reasoning: row.reasoning ? String(row.reasoning) : undefined,
        repairRecommendation: row.repairRecommendation || row.repair_recommendation ? String(row.repairRecommendation || row.repair_recommendation) : undefined,
      };
    })
    .filter((row): row is DamageIssue => row !== null);
};

const normalizeRecommendations = (rawRecommendations: unknown[]): ServiceRecommendation[] => {
  return safeArray<Record<string, unknown>>(rawRecommendations)
    .map((row) => {
      const serviceName = String(row.service_name || row.service || '').trim();
      if (!serviceName) return null;

      const serviceId = String(row.service_id || serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      const estimatedMin = Math.max(0, Number(row.estimated_min || row.min || 0));
      const estimatedMax = Math.max(estimatedMin, Number(row.estimated_max || row.max || estimatedMin));

      return {
        serviceId,
        serviceName,
        description: String(row.description || '').trim() || `Recommended: ${serviceName}`,
        urgency: toUrgency(row.urgency),
        relatedAreas: safeArray<string>(row.related_areas).map((area) => String(area)).filter(Boolean),
        estimatedMin,
        estimatedMax,
        estimatedRepairTime: row.estimatedRepairTime || row.estimated_repair_time ? String(row.estimatedRepairTime || row.estimated_repair_time) : undefined,
      } as ServiceRecommendation | null;
    })
    .filter((row): row is ServiceRecommendation => Boolean(row));
};

const mapAnalysisPayload = (payload: Record<string, unknown>): AnalysisResult => {
  const issues = normalizeIssues(safeArray(payload.damages));
  const recommendations = normalizeRecommendations(
    safeArray(payload.recommendations).length
      ? safeArray(payload.recommendations)
      : safeArray(payload.service_catalog)
  );

  return {
    status: String(payload.status) === 'invalid' ? 'invalid' : 'damage_detected',
    message: typeof payload.message === 'string' ? payload.message : undefined,
    issues,
    recommendations,
    totalEstimatedCost: String(payload.total_estimated_cost || '₱0 - ₱0'),
    source: (() => {
      const raw = String(payload.analysis_source || payload.source || '');
      if (raw === 'roboflow_workflows') return 'rule_based' as const; // Roboflow AI — primary source
      if (raw === 'gemini_vision')      return 'rule_based' as const; // Legacy Gemini — kept for compat
      if (raw === 'rule_based')         return 'rule_based' as const;
      return 'fallback' as const;
    })(),
    fallbackReason:
      typeof payload.fallback_reason === 'string'
        ? payload.fallback_reason
        : null,
  };
};

const mapEstimatePayload = (payload: Record<string, unknown>): CostEstimate => {
  const min = Math.max(0, Number(payload.min || 0));
  const max = Math.max(min, Number(payload.max || min));
  const recommended = Math.max(0, Number(payload.recommended || Math.round((min + max) / 2)));

  const breakdown = safeArray<Record<string, unknown>>(payload.breakdown || payload.repair_breakdown).map((line) => ({
    serviceId: String(line.service_id || line.serviceId || 'service'),
    serviceName: String(line.service_name || line.serviceName || 'Service'),
    labor: Math.max(0, Number(line.labor || 0)),
    materials: Math.max(0, Number(line.materials || 0)),
    subtotalMin: Math.max(0, Number(line.subtotal_min || line.subtotalMin || line.subtotal || 0)),
    subtotalMax: Math.max(
      0,
      Number(
        line.subtotal_max
          || line.subtotalMax
          || line.subtotal
          || line.subtotal_min
          || line.subtotalMin
          || 0
      )
    ),
    affectedAreas: safeArray<string>(line.affected_areas || line.affectedAreas).map((area) => String(area)),
  }));

  const addOnBreakdown = safeArray<Record<string, unknown>>(payload.add_on_breakdown || payload.addOnBreakdown).map((a) => ({
    id: String(a.id || a.service_id || ''),
    name: String(a.name || a.service_name || ''),
    description: String(a.description || ''),
    category: String(a.category || 'cosmetic') as 'protection' | 'cosmetic' | 'repair',
    price: Math.max(0, Number(a.price || a.flatPrice || 0)),
    selected: Boolean(a.selected),
  }));

  return {
    currency: 'PHP',
    min,
    max,
    recommended,
    formattedRange: String(payload.total_estimated_cost || payload.formattedRange || `${formatPhp(min)} – ${formatPhp(max)}`),
    formattedRecommended: String(payload.formattedRecommended || formatPhp(recommended)),
    breakdown,
    addOnBreakdown,
    addOnTotal: Math.max(0, Number(payload.add_on_total || payload.addOnTotal || 0)),
    assumptions: safeArray<string>(payload.assumptions).map((x) => String(x)),
  };
};

/* ══════════════════════════════════════════════════════════════════════════════
 * Calculate Live Cost — with add-on service support
 * ══════════════════════════════════════════════════════════════════════════════ */
export const calculateLiveCost = async (params: {
  issues: DamageIssue[];
  recommendations: ServiceRecommendation[];
  selectedServiceIds: string[];
  addOnIds: string[];
}): Promise<CostEstimate> => {
  const response = await apiClient.post('/ai/calculate-cost', {
    damages: params.issues.map((issue) => ({
      id: issue.id,
      damage_type: issue.damageType,
      affected_area: issue.affectedArea,
      confidence: issue.confidence,
      severity: issue.severity,
      recommended_action: issue.recommendedAction,
    })),
    recommendations: params.recommendations.map((rec) => ({
      service_id: rec.serviceId,
      service_name: rec.serviceName,
      description: rec.description,
      urgency: rec.urgency,
      related_areas: rec.relatedAreas,
      estimated_min: rec.estimatedMin,
      estimated_max: rec.estimatedMax,
    })),
    selected_services: params.selectedServiceIds,
    add_on_ids: params.addOnIds,
  });

  return mapEstimatePayload(response.data?.data || {});
};

export const analyzeVehicleDamage = async (
  images: VehicleImageInput[],
  onUploadProgress?: UploadProgressCallback
): Promise<AnalysisResult> => {
  const requestKey = buildAnalyzeRequestKey(images);
  const existing = inFlightAnalyzeRequests.get(requestKey);

  if (existing) {
    console.log(
      `[aiService][analyze] Joining in-flight request (key=${requestKey.slice(0, 24)}..., images=${images.length})`
    );
    return existing;
  }

  const requestId = createClientRequestId();
  const startedAt = Date.now();

  const requestPromise = (async () => {
    console.log(`[aiService][${requestId}] Starting damage analysis (images=${images.length})`);

    try {
      // ── Try backend API (Gemini Vision AI) first ──
      const formData = createMultipartPayload(images);

      const response = await apiClient.post('/ai/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
        onUploadProgress: (event) => {
          if (!onUploadProgress || !event.total) return;
          // Map upload progress to 0-60% range (analysis phase takes 60-100%)
          onUploadProgress(Math.round((event.loaded / event.total) * 60));
        },
      });

      onUploadProgress?.(85);

      const payload = response.data?.data || response.data || {};
      const analysis = mapAnalysisPayload(payload);

      onUploadProgress?.(100);
      console.log(
        `[aiService][${requestId}] API analyze success (source=${analysis.source}, issues=${analysis.issues.length}, elapsed=${Date.now() - startedAt}ms)`
      );
      return analysis;
    } catch (apiError) {
      // ── Fallback to offline engine if API fails ──
      const reason = apiError instanceof Error ? apiError.message : 'API unreachable';
      console.warn(
        `[aiService][${requestId}] API analyze failed (${reason}), using offline engine (elapsed=${Date.now() - startedAt}ms)`
      );

      try {
        onUploadProgress?.(40);
        const analysis = buildOfflineDamageAnalysis(images);
        onUploadProgress?.(100);
        console.log(
          `[aiService][${requestId}] Offline analyze success (issues=${analysis.issues.length}, elapsed=${Date.now() - startedAt}ms)`
        );
        return {
          ...analysis,
          source: 'fallback' as const,
          fallbackReason: reason,
        };
      } catch (offlineError) {
        const offlineReason = getApiErrorMessage(offlineError, 'Offline analysis also failed.');
        console.error(`[aiService][${requestId}] Both API and offline failed: ${offlineReason}`);
        return createFallbackAnalysis(images, offlineReason);
      }
    } finally {
      inFlightAnalyzeRequests.delete(requestKey);
      console.log(`[aiService][${requestId}] Analyze request released lock`);
    }
  })();

  inFlightAnalyzeRequests.set(requestKey, requestPromise);
  return requestPromise;
};

export const start3DModelGeneration = async (
  images: VehicleImageInput[],
  onUploadProgress?: UploadProgressCallback
): Promise<ModelGenerationResult> => {
  const formData = createMultipartPayload(images);

  try {
    const response = await apiClient.post('/ai/generate-3d', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      validateStatus: () => true,
      timeout: 120000, // 2 minute timeout for initial handshake
      onUploadProgress: (event) => {
        if (!onUploadProgress) return;
        if (!event.total) {
          onUploadProgress(0);
          return;
        }
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      },
    });

    const status = String(response.data?.status || '').toLowerCase();
    const modelUrl = validateModelUrl(response.data?.model_url);
    const taskId = typeof response.data?.task_id === 'string' ? response.data.task_id : undefined;

    console.log('[start3DModelGeneration] status:', status, 'modelUrl:', modelUrl ?? '(none)', 'taskId:', taskId ?? '(none)');

    if (status === 'ar_ready' && modelUrl) {
      return {
        status: 'ar_ready',
        modelUrl,
        repairedModelUrl: validateModelUrl(response.data?.repaired_model_url),
        progress: 100,
        message: String(response.data?.message || '3D model ready.'),
      };
    }

    if (status === 'processing' && taskId) {
      return {
        status: 'processing',
        taskId,
        progress: Number(response.data?.progress || 0),
        message: String(response.data?.message || '3D generation in progress.'),
      };
    }

    if (status === 'unavailable') {
      return {
        status: 'unavailable',
        message: String(
          response.data?.message ||
          '3D model generation is not configured. You can still continue with repair estimate.'
        ),
      };
    }

    // Non-200 or unrecognized status — treat as unavailable rather than crashing
    return {
      status: 'unavailable',
      message:
        typeof response.data?.message === 'string'
          ? response.data.message
          : '3D model generation is not configured. You can still continue with repair estimate.',
    };
  } catch (error) {
    console.warn('[start3DModelGeneration] Network error — treating as unavailable:', error instanceof Error ? error.message : error);
    return {
      status: 'unavailable',
      message: '3D model service is unreachable. You can still continue with repair estimate.',
    };
  }
};

export const poll3DModelStatus = async (
  taskId: string,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (progress: number) => void;
  }
): Promise<ModelGenerationResult> => {
  const intervalMs = options?.intervalMs ?? 3500;
  const timeoutMs = options?.timeoutMs ?? 240000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await apiClient.get(`/ai/generate-3d/${taskId}`, {
      validateStatus: () => true,
    });

    const status = String(response.data?.status || '').toLowerCase();
    const progress = Math.max(0, Math.min(100, Number(response.data?.progress || 0)));
    options?.onProgress?.(progress);

    const polledModelUrl = validateModelUrl(response.data?.model_url);
    console.log('[poll3DModelStatus] status:', status, 'modelUrl:', polledModelUrl ?? '(none)', 'progress:', progress);

    if (status === 'ar_ready' && polledModelUrl) {
      return {
        status: 'ar_ready',
        taskId,
        modelUrl: polledModelUrl,
        repairedModelUrl: validateModelUrl(response.data?.repaired_model_url),
        progress: 100,
      };
    }

    if (status === 'unavailable') {
      return {
        status: 'unavailable',
        taskId,
        message: String(response.data?.message || '3D generation unavailable.'),
      };
    }

    if (status === 'failed') {
      throw buildError(
        'MESHY_POLL_FAILED',
        String(response.data?.message || '3D model generation failed.'),
        true
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw buildError(
    'MESHY_TIMEOUT',
    '3D model generation is taking longer than expected. You can retry from this step.',
    true
  );
};

export const estimateRepairCost = async (params: {
  issues: DamageIssue[];
  recommendations: ServiceRecommendation[];
  selectedServiceIds: string[];
}): Promise<CostEstimate> => {
  const response = await apiClient.post('/ai/estimate', {
    damages: params.issues.map((issue) => ({
      id: issue.id,
      damage_type: issue.damageType,
      affected_area: issue.affectedArea,
      confidence: issue.confidence,
      severity: issue.severity,
      recommended_action: issue.recommendedAction,
    })),
    recommendations: params.recommendations.map((rec) => ({
      service_id: rec.serviceId,
      service_name: rec.serviceName,
      description: rec.description,
      urgency: rec.urgency,
      related_areas: rec.relatedAreas,
      estimated_min: rec.estimatedMin,
      estimated_max: rec.estimatedMax,
    })),
    selected_services: params.selectedServiceIds,
  });

  return mapEstimatePayload(response.data?.data || {});
};

export const confirmAiServiceRequest = async (params: {
  imageAngles: string[];
  imageCount: number;
  analysis: AnalysisResult;
  selectedServiceIds: string[];
  estimate: CostEstimate;
  modelUrl: string | null;
  modelTaskId?: string | null;
  vehicleId?: string;
  notes?: string;
}): Promise<ConfirmationResult> => {
  const user = await authStorage.getUser();

  const payload = {
    vehicleId: params.vehicleId || '',
    imageAngles: params.imageAngles,
    imageCount: params.imageCount,
    analysis_source: params.analysis.source,
    damages: params.analysis.issues.map((issue) => ({
      id: issue.id,
      damage_type: issue.damageType,
      affected_area: issue.affectedArea,
      confidence: issue.confidence,
      severity: issue.severity,
      recommended_action: issue.recommendedAction,
      suggested_services: issue.suggestedServices,
    })),
    recommendations: params.analysis.recommendations.map((rec) => ({
      service_id: rec.serviceId,
      service_name: rec.serviceName,
      description: rec.description,
      urgency: rec.urgency,
      related_areas: rec.relatedAreas,
      estimated_min: rec.estimatedMin,
      estimated_max: rec.estimatedMax,
    })),
    selected_services: params.selectedServiceIds,
    estimate: {
      min: params.estimate.min,
      max: params.estimate.max,
      formattedRange: params.estimate.formattedRange,
      assumptions: params.estimate.assumptions,
      breakdown: params.estimate.breakdown.map((line) => ({
        serviceId: line.serviceId,
        serviceName: line.serviceName,
        labor: line.labor,
        materials: line.materials,
        subtotalMin: line.subtotalMin,
        subtotalMax: line.subtotalMax,
        affectedAreas: line.affectedAreas,
      })),
    },
    model_url: params.modelUrl || '',
    model_task_id: params.modelTaskId || '',
    notes: params.notes || '',
    customerId: user?.id || user?._id || '',
  };

  try {
    const response = await apiClient.post('/ai/confirm', payload);
    const data = response.data?.data as Record<string, unknown>;
    if (!data?.serviceRequestId) {
      throw buildError('CONFIRM_INVALID_RESPONSE', 'Confirmation was accepted but no request ID was returned.', false);
    }

    return {
      serviceRequestId: String(data.serviceRequestId),
      status: 'confirmed',
      confirmedAt: String(data.confirmedAt || new Date().toISOString()),
    };
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && 'retryable' in error
    ) {
      throw error as WorkflowError;
    }

    const axiosError = error as AxiosError;
    const message = getApiErrorMessage(axiosError, 'Unable to confirm service request.');
    throw buildError('CONFIRM_FAILED', message, true);
  }
};

/* ══════════════════════════════════════════════════════════════════════════════
 * NEW AI SCAN MODULE — GPT-4 Vision (mock+real toggle), Meshy 3D, Estimator
 *
 * These methods power the new (customer)/ai-scan/ flow:
 *   POST /api/ai/scan                  → analyze damage with GPT-4 Vision
 *   GET  /api/ai/scan/:id              → fetch a saved scan
 *   POST /api/ai/generate-3d-from-scan → start Meshy task using saved images
 *   GET  /api/ai/generate-3d/:taskId   → poll Meshy progress
 *   POST /api/ai/estimate-from-damages → recompute estimate
 * ══════════════════════════════════════════════════════════════════════════════ */

export type AiScanSeverity = 'high' | 'medium' | 'low';
export type AiScanUrgency = 'Immediate' | 'Can Wait' | 'Optional';
export type AiScanCondition = 'Excellent' | 'Good' | 'Fair' | 'Poor';

export interface AiScanCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiScanDamage {
  id: string;
  type: string;
  severity: AiScanSeverity;
  description: string;
  confidence: number;
  coordinates: AiScanCoordinates;
  affectedArea: string;
  imageIndex: number;
  angleHint?: string;
  urgency: AiScanUrgency;
}

export interface AiScanLineItem {
  id: string;
  damageId: string;
  serviceId: string;
  serviceName: string;
  description: string;
  affectedArea: string;
  damageType: string;
  severity: AiScanSeverity;
  urgency: AiScanUrgency;
  confidence: number;
  subtotalMin: number;
  subtotalMax: number;
  formattedSubtotal: string;
  color: string;
  icon: string;
}

export interface AiScanRecommendedPackage {
  id: string;
  name: string;
  tier: string;
  durationYears: number;
  basePrice: number;
  premiumPrice: number;
  description: string;
  formattedPrice: string;
  color: string;
  icon: string;
}

export interface AiScanEstimate {
  currency: 'PHP';
  lineItems: AiScanLineItem[];
  subtotal: number;
  subtotalMax: number;
  totalEstimate: number;
  formattedSubtotal: string;
  formattedTotal: string;
  recommendedPackage: AiScanRecommendedPackage;
  savingsAmount: number;
  formattedSavings: string;
  condition: AiScanCondition;
  urgency: AiScanUrgency;
  assumptions: string[];
}

export interface AiScanResult {
  scanId: string | null;
  source: 'mock' | 'gpt4_vision' | 'fallback';
  model: string;
  vehicleDetected: boolean;
  overallCondition: AiScanCondition;
  recommendedPackage: string;
  urgency: AiScanUrgency;
  summary: string;
  damages: AiScanDamage[];
  estimate: AiScanEstimate;
  imageUrls: string[];
  angles: string[];
  vehicleId?: string;
  openaiConfigured?: boolean;
  meshyConfigured?: boolean;
  createdAt: string;
  elapsedMs?: number;
}

export interface AiScanInputImage {
  uri: string;
  fileName?: string;
  mimeType?: string;
  angle?: string;
}

export interface AiScan3DProgress {
  status: 'processing' | 'ar_ready' | 'failed' | 'unavailable';
  taskId?: string;
  progress: number;
  modelUrl?: string;
  repairedModelUrl?: string;
  message?: string;
}

const toAiSeverity = (value: unknown): AiScanSeverity => {
  const v = String(value || '').toLowerCase();
  if (v === 'high' || v === 'severe') return 'high';
  if (v === 'low' || v === 'minor') return 'low';
  return 'medium';
};

const toAiUrgency = (value: unknown): AiScanUrgency => {
  const v = String(value || '').toLowerCase();
  if (v.includes('immediate') || v.includes('urgent')) return 'Immediate';
  if (v.includes('optional') || v.includes('low')) return 'Optional';
  return 'Can Wait';
};

const toAiCondition = (value: unknown): AiScanCondition => {
  const v = String(value || '').toLowerCase();
  if (v.startsWith('exc')) return 'Excellent';
  if (v.startsWith('good')) return 'Good';
  if (v.startsWith('poor')) return 'Poor';
  return 'Fair';
};

const mapDamage = (raw: any, index: number): AiScanDamage => ({
  id: String(raw?.id || `dmg_${index + 1}`),
  type: String(raw?.type || raw?.damage_type || raw?.name || 'Damage'),
  severity: toAiSeverity(raw?.severity),
  description: String(raw?.description || ''),
  confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0.85)),
  coordinates: {
    x: Math.max(0, Math.min(1, Number(raw?.coordinates?.x) || 0.1)),
    y: Math.max(0, Math.min(1, Number(raw?.coordinates?.y) || 0.2)),
    width: Math.max(0.02, Math.min(0.95, Number(raw?.coordinates?.width) || 0.2)),
    height: Math.max(0.02, Math.min(0.95, Number(raw?.coordinates?.height) || 0.2)),
  },
  affectedArea: String(raw?.affectedArea || raw?.affected_area || raw?.location || 'Vehicle Body'),
  imageIndex: Number.isFinite(Number(raw?.imageIndex)) ? Number(raw.imageIndex) : 0,
  angleHint: raw?.angleHint || raw?.angle_hint || 'close_up',
  urgency: toAiUrgency(raw?.urgency),
});

const mapLineItem = (raw: any, index: number): AiScanLineItem => ({
  id: String(raw?.id || `line_${index + 1}`),
  damageId: String(raw?.damageId || raw?.damage_id || `dmg_${index + 1}`),
  serviceId: String(raw?.serviceId || raw?.service_id || 'spf89'),
  serviceName: String(raw?.serviceName || raw?.service_name || 'SPF 89 Advanced'),
  description: String(raw?.description || ''),
  affectedArea: String(raw?.affectedArea || raw?.affected_area || 'Vehicle Body'),
  damageType: String(raw?.damageType || raw?.damage_type || 'Damage'),
  severity: toAiSeverity(raw?.severity),
  urgency: toAiUrgency(raw?.urgency),
  confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0.85)),
  subtotalMin: Math.max(0, Number(raw?.subtotalMin || raw?.subtotal_min) || 0),
  subtotalMax: Math.max(0, Number(raw?.subtotalMax || raw?.subtotal_max) || 0),
  formattedSubtotal: String(raw?.formattedSubtotal || raw?.formatted_subtotal || ''),
  color: String(raw?.color || '#F59E0B'),
  icon: String(raw?.icon || 'shield-outline'),
});

const mapRecommendedPackage = (raw: any): AiScanRecommendedPackage => ({
  id: String(raw?.id || 'spf89'),
  name: String(raw?.name || 'SPF 89 Advanced'),
  tier: String(raw?.tier || 'advanced'),
  durationYears: Number(raw?.durationYears || raw?.duration_years || 5),
  basePrice: Math.max(0, Number(raw?.basePrice || raw?.base_price) || 0),
  premiumPrice: Math.max(0, Number(raw?.premiumPrice || raw?.premium_price) || 0),
  description: String(raw?.description || ''),
  formattedPrice: String(raw?.formattedPrice || raw?.formatted_price || ''),
  color: String(raw?.color || '#F59E0B'),
  icon: String(raw?.icon || 'shield-outline'),
});

const mapEstimate = (raw: any): AiScanEstimate => ({
  currency: 'PHP',
  lineItems: (Array.isArray(raw?.lineItems) ? raw.lineItems : []).map(mapLineItem),
  subtotal: Math.max(0, Number(raw?.subtotal) || 0),
  subtotalMax: Math.max(0, Number(raw?.subtotalMax || raw?.subtotal_max) || 0),
  totalEstimate: Math.max(0, Number(raw?.totalEstimate || raw?.total_estimate) || 0),
  formattedSubtotal: String(raw?.formattedSubtotal || raw?.formatted_subtotal || ''),
  formattedTotal: String(raw?.formattedTotal || raw?.formatted_total || ''),
  recommendedPackage: mapRecommendedPackage(raw?.recommendedPackage || raw?.recommended_package || {}),
  savingsAmount: Math.max(0, Number(raw?.savingsAmount || raw?.savings_amount) || 0),
  formattedSavings: String(raw?.formattedSavings || raw?.formatted_savings || ''),
  condition: toAiCondition(raw?.condition),
  urgency: toAiUrgency(raw?.urgency),
  assumptions: Array.isArray(raw?.assumptions) ? raw.assumptions.map(String) : [],
});

const mapAiScanResult = (raw: any): AiScanResult => ({
  scanId: raw?.scanId ? String(raw.scanId) : null,
  source: ['mock', 'gpt4_vision', 'fallback'].includes(raw?.source) ? raw.source : 'mock',
  model: String(raw?.model || 'gpt-4-vision-mock'),
  vehicleDetected: raw?.vehicleDetected !== false,
  overallCondition: toAiCondition(raw?.overallCondition),
  recommendedPackage: String(raw?.recommendedPackage || 'SPF 89 Advanced'),
  urgency: toAiUrgency(raw?.urgency),
  summary: String(raw?.summary || ''),
  damages: (Array.isArray(raw?.damages) ? raw.damages : []).map(mapDamage),
  estimate: mapEstimate(raw?.estimate || {}),
  imageUrls: Array.isArray(raw?.imageUrls) ? raw.imageUrls.map(String) : [],
  angles: Array.isArray(raw?.angles) ? raw.angles.map(String) : [],
  vehicleId: raw?.vehicleId ? String(raw.vehicleId) : undefined,
  openaiConfigured: Boolean(raw?.openaiConfigured),
  meshyConfigured: Boolean(raw?.meshyConfigured),
  createdAt: String(raw?.createdAt || new Date().toISOString()),
  elapsedMs: Number.isFinite(Number(raw?.elapsedMs)) ? Number(raw.elapsedMs) : undefined,
});

/**
 * POST /api/ai/scan — Run GPT-4 Vision damage analysis on uploaded images.
 * If OPENAI_API_KEY is not set on the backend, a realistic mock response is
 * returned. When the key is added later, the same call automatically uses
 * the live API.
 */
export const runAiScan = async (
  images: AiScanInputImage[],
  options: {
    vehicleId?: string;
    onUploadProgress?: (progress: number) => void;
  } = {}
): Promise<AiScanResult> => {
  if (!Array.isArray(images) || images.length === 0) {
    throw buildError('AI_SCAN_INVALID', 'At least one photo is required.', false);
  }

  const formData = new FormData();
  images.forEach((image, index) => {
    formData.append('images', {
      uri: image.uri,
      name: image.fileName || `vehicle_${index + 1}.jpg`,
      type: image.mimeType || 'image/jpeg',
    } as never);
  });

  const angles = images.map((img) => img.angle || 'close_up');
  formData.append('angles', JSON.stringify(angles));
  if (options.vehicleId) {
    formData.append('vehicleId', options.vehicleId);
  }

  const response = await apiClient.post('/ai/scan', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90_000,
    onUploadProgress: (event) => {
      if (!options.onUploadProgress || !event.total) return;
      options.onUploadProgress(Math.round((event.loaded / event.total) * 60));
    },
  });

  options.onUploadProgress?.(100);

  if (!response.data?.success) {
    throw buildError(
      'AI_SCAN_FAILED',
      String(response.data?.message || 'AI scan failed.'),
      true
    );
  }

  return mapAiScanResult(response.data.data || {});
};

/**
 * GET /api/ai/scan/:id — Retrieve a previously saved scan.
 * Used to rehydrate state when navigating between screens via expo-router params.
 */
export const fetchAiScanById = async (scanId: string): Promise<AiScanResult> => {
  const response = await apiClient.get(`/ai/scan/${scanId}`);
  if (!response.data?.success) {
    throw buildError(
      'AI_SCAN_NOT_FOUND',
      String(response.data?.message || 'Scan not found.'),
      false
    );
  }
  return mapAiScanResult(response.data.data || {});
};

/**
 * POST /api/ai/generate-3d-from-scan — Kick off Meshy AI .glb generation
 * using the images saved with this scan.
 */
export const startAiScan3D = async (
  scanId: string
): Promise<AiScan3DProgress> => {
  const response = await apiClient.post(
    '/ai/generate-3d-from-scan',
    { scanId },
    { validateStatus: () => true }
  );

  const status = String(response.data?.status || '').toLowerCase();

  if (status === 'unavailable') {
    return {
      status: 'unavailable',
      progress: 0,
      message: String(response.data?.message || '3D generation is unavailable.'),
    };
  }

  if (status !== 'processing' || !response.data?.task_id) {
    return {
      status: 'unavailable',
      progress: 0,
      message: String(
        response.data?.message ||
          'Meshy did not return a valid task ID. The 3D viewer will be skipped.'
      ),
    };
  }

  return {
    status: 'processing',
    taskId: String(response.data.task_id),
    progress: 0,
    message: 'Meshy 3D generation started.',
  };
};

/**
 * Polls the Meshy task until it reaches ar_ready, fails, or times out.
 * Streams progress updates via the optional onProgress callback.
 */
export const pollAiScan3D = async (
  taskId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (progress: AiScan3DProgress) => void;
  } = {}
): Promise<AiScan3DProgress> => {
  const intervalMs = options.intervalMs ?? 4_000;
  const timeoutMs = options.timeoutMs ?? 240_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await apiClient.get(`/ai/generate-3d/${taskId}`, {
      validateStatus: () => true,
    });

    const status = String(response.data?.status || '').toLowerCase();
    const progress = Math.max(0, Math.min(100, Number(response.data?.progress) || 0));
    const modelUrl =
      typeof response.data?.model_url === 'string' && response.data.model_url
        ? response.data.model_url
        : undefined;
    const repairedModelUrl =
      typeof response.data?.repaired_model_url === 'string' && response.data.repaired_model_url
        ? response.data.repaired_model_url
        : undefined;

    const update: AiScan3DProgress = {
      status: status === 'ar_ready' ? 'ar_ready' : status === 'failed' ? 'failed' : 'processing',
      taskId,
      progress: status === 'ar_ready' ? 100 : progress,
      modelUrl,
      repairedModelUrl,
      message: response.data?.message ? String(response.data.message) : undefined,
    };

    options.onProgress?.(update);

    if (status === 'ar_ready' && modelUrl) {
      return update;
    }

    if (status === 'failed') {
      throw buildError(
        'MESHY_3D_FAILED',
        String(response.data?.message || '3D model generation failed.'),
        true
      );
    }

    if (status === 'unavailable') {
      return {
        status: 'unavailable',
        taskId,
        progress: 0,
        message: String(response.data?.message || '3D generation is unavailable.'),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw buildError(
    'MESHY_3D_TIMEOUT',
    '3D model generation is taking longer than expected. You can retry from the scan results.',
    true
  );
};

/**
 * POST /api/ai/estimate-from-damages — Recompute the estimate from a damage list.
 * Used when the user toggles services on the estimate screen.
 */
export const recomputeAiScanEstimate = async (
  damages: AiScanDamage[]
): Promise<AiScanEstimate> => {
  const response = await apiClient.post('/ai/estimate-from-damages', {
    damages: damages.map((d) => ({
      id: d.id,
      type: d.type,
      severity: d.severity,
      description: d.description,
      confidence: d.confidence,
      coordinates: d.coordinates,
      affectedArea: d.affectedArea,
      imageIndex: d.imageIndex,
      urgency: d.urgency,
    })),
  });

  if (!response.data?.success) {
    throw buildError(
      'ESTIMATE_FAILED',
      String(response.data?.message || 'Failed to recompute estimate.'),
      true
    );
  }
  return mapEstimate(response.data.data || {});
};

/* ══════════════════════════════════════════════════════════════════════════════
 * AI Repair Preview — Inpainting
 * ══════════════════════════════════════════════════════════════════════════════ */

export interface RepairPreviewInput {
  imageUrl: string;
  damages: Array<{
    boundingBox?: { x: number; y: number; width: number; height: number } | null;
    bounding_box?: { x: number; y: number; width: number; height: number } | null;
  }>;
  imageWidth?: number;
  imageHeight?: number;
  onProgress?: (progress: number, stage: string) => void;
}

export interface RepairPreviewResponse {
  status: 'completed' | 'failed' | 'unavailable';
  repairedImageUrl?: string;
  maskUrl?: string;
  processingTimeSeconds?: number;
  message?: string;
  model?: string;
}

export const uploadImageToCloudinary = async (fileUri: string): Promise<string> => {
  const formData = new FormData();
  formData.append('image', {
    uri: fileUri,
    name: 'upload.jpg',
    type: 'image/jpeg',
  } as any);

  try {
    const response = await apiClient.post('/ai/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data?.secure_url || '';
  } catch (error) {
    console.error('[uploadImageToCloudinary] Failed:', error);
    return '';
  }
};

/**
 * Realistic AI Repair Preview pipeline.
 * Emits progress stages over 10–15s while waiting for FLUX Fill Pro inpainting.
 */
export const generateRepairPreview = async (
  input: RepairPreviewInput
): Promise<RepairPreviewResponse> => {
  console.log('[generateRepairPreview] Starting with imageUrl:', input.imageUrl);
  console.log('[generateRepairPreview] Damage zones:', input.damages.length);

  const { onProgress } = input;

  // Stage progression — runs concurrently with the API call
  const STAGES: Array<{ at: number; pct: number; label: string }> = [
    { at: 0,    pct: 5,  label: 'Uploading to secure pipeline...' },
    { at: 1200, pct: 12, label: 'Generating damage mask from zones...' },
    { at: 2800, pct: 22, label: 'Matching PPG paint code...' },
    { at: 4500, pct: 35, label: 'FLUX Fill Pro: surface reconstruction...' },
    { at: 6500, pct: 48, label: 'AI inpainting: repairing damaged panels...' },
    { at: 8500, pct: 62, label: 'Blending repair edges...' },
    { at: 10500, pct: 75, label: 'Color-matching under lighting conditions...' },
    { at: 12000, pct: 85, label: 'Finalizing photorealistic composite...' },
    { at: 13500, pct: 92, label: 'Persisting result to cloud storage...' },
  ];

  const stageTimers: ReturnType<typeof setTimeout>[] = [];
  if (onProgress) {
    for (const stage of STAGES) {
      stageTimers.push(
        setTimeout(() => onProgress(stage.pct, stage.label), stage.at)
      );
    }
  }

  const clearStageTimers = () => stageTimers.forEach(clearTimeout);

  // ── Upload local file to Cloudinary if needed ──
  let finalImageUrl = input.imageUrl;
  if (finalImageUrl.startsWith('file://')) {
    console.log('[generateRepairPreview] Local file detected, uploading to Cloudinary...');
    onProgress?.(8, 'Uploading vehicle image securely...');
    let uploadedUrl = await uploadImageToCloudinary(finalImageUrl);

    if (!uploadedUrl) {
      console.log('[generateRepairPreview] Initial upload failed. Retrying...');
      onProgress?.(10, 'Retrying upload...');
      uploadedUrl = await uploadImageToCloudinary(finalImageUrl);
    }

    if (!uploadedUrl) {
      clearStageTimers();
      return {
        status: 'failed',
        message: 'Failed to securely upload image for AI repair preview after retry.',
      };
    }
    finalImageUrl = uploadedUrl;
    console.log('[generateRepairPreview] Uploaded to:', finalImageUrl);
  }

  try {
    const response = await apiClient.post('/ai/repair-preview', {
      imageUrl: finalImageUrl,
      damages: input.damages.map((d) => ({
        bounding_box: d.boundingBox || d.bounding_box || null,
      })),
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
    }, {
      timeout: 300000, // 5 minute timeout for FLUX inpainting
      validateStatus: () => true,
    });

    clearStageTimers();

    const rd = response.data;
    const status = String(rd?.status || '').toLowerCase();
    console.log('[generateRepairPreview] Response status:', status);

    if (status === 'completed' && rd?.data?.repairedImageUrl) {
      onProgress?.(100, 'AI repair preview ready.');
      return {
        status: 'completed',
        repairedImageUrl: String(rd.data.repairedImageUrl),
        maskUrl: rd.data.maskUrl ? String(rd.data.maskUrl) : undefined,
        processingTimeSeconds: Number(rd.data.processingTimeSeconds || 0),
        model: rd.data.model ? String(rd.data.model) : undefined,
      };
    }

    if (status === 'unavailable') {
      return {
        status: 'unavailable',
        message: String(rd?.message || 'AI repair preview is not configured.'),
      };
    }

    if (status === 'credits_exhausted') {
      console.warn('[generateRepairPreview] Replicate credits exhausted');
      return {
        status: 'unavailable',
        message: String(rd?.message || 'AI repair credits are currently exhausted. Showing projected simulation.'),
      };
    }

    return {
      status: 'failed',
      message: String(rd?.message || 'AI inpainting did not return a valid result.'),
    };
  } catch (error) {
    clearStageTimers();
    console.error('[generateRepairPreview] Error:', error);
    const axiosError = error as AxiosError;
    return {
      status: 'failed',
      message: getApiErrorMessage(axiosError, 'Failed to generate AI repair preview.'),
    };
  }
};
