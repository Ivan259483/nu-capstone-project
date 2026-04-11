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
      if (raw === 'gemini_vision') return 'rule_based' as const; // Treat AI results as primary source
      if (raw === 'rule_based') return 'rule_based' as const;
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
