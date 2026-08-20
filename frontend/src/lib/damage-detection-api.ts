import axios from 'axios';
import api from '@/lib/api';
import { compressImageForUpload } from '@/lib/compress-image-for-upload';

export type DamageSeverity = 'high' | 'medium' | 'low';

export type SegmentationPoint = { x: number; y: number };

export type AutoGlossDamageIssue = {
  id: string;
  type: string;
  damageClass: string;
  severity: DamageSeverity;
  severityLabel: 'Severe' | 'Moderate' | 'Minor';
  description: string;
  confidence: number;
  affectedArea: string;
  imageIndex: number;
  urgency: string;
  recommendation: string;
  coordinates: { x: number; y: number; width: number; height: number };
  segmentation: {
    format: 'polygon' | 'rle';
    points: SegmentationPoint[];
    pointCount: number;
  };
  detectedArea: {
    pixels: number;
    percentage: number;
    imageWidth: number;
    imageHeight: number;
  };
};

export type DamageEstimateLineItem = {
  damageId?: string;
  serviceName?: string;
  description?: string;
  formattedSubtotal?: string;
};

export type DamageDetectionResult = {
  scanId: string | null;
  source: 'roboflow';
  model: string;
  vehicleDetected: boolean;
  noDamageDetected: boolean;
  summary: string;
  overallCondition: string;
  recommendedPackage: string;
  urgency: string;
  damages: AutoGlossDamageIssue[];
  damageReport: {
    reportId: string;
    title: string;
    status: 'damage_detected' | 'no_damage_detected';
    issueCount: number;
    highestSeverity: DamageSeverity | null;
    issues: AutoGlossDamageIssue[];
    downstream: Record<string, unknown>;
  };
  estimate: {
    formattedTotal?: string;
    formattedSubtotal?: string;
    totalEstimate?: number;
    lineItems?: DamageEstimateLineItem[];
  };
  integration: {
    recommendation: unknown[];
    costEstimation: unknown[];
    visualization3d: unknown[];
    ar: unknown[];
  };
};

type DetectionEnvelope = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: DamageDetectionResult;
};

export class DamageDetectionApiError extends Error {
  code: string;
  retryable: boolean;

  constructor(message: string, code = 'DAMAGE_DETECTION_FAILED', retryable = false) {
    super(message);
    this.name = 'DamageDetectionApiError';
    this.code = code;
    this.retryable = retryable;
  }
}

const toDetectionError = (error: unknown) => {
  if (error instanceof DamageDetectionApiError) return error;
  if (axios.isAxiosError<DetectionEnvelope>(error)) {
    const code = error.response?.data?.code || error.code || 'DAMAGE_DETECTION_FAILED';
    const retryable = !error.response || [429, 502, 503, 504].includes(error.response.status);
    const fallback = error.code === 'ECONNABORTED'
      ? 'The damage scan timed out. Check your connection and try again.'
      : 'Unable to analyze this vehicle image right now.';
    return new DamageDetectionApiError(error.response?.data?.message || fallback, code, retryable);
  }
  return new DamageDetectionApiError(
    error instanceof Error ? error.message : 'Unable to analyze this vehicle image right now.'
  );
};

export async function detectVehicleDamage(input: {
  images: File[];
  angles?: string[];
  damageAreas?: string[];
  vehicleId?: string;
}): Promise<DamageDetectionResult> {
  if (!input.images.length) {
    throw new DamageDetectionApiError('Choose at least one vehicle image.', 'IMAGE_REQUIRED');
  }

  try {
    const compressedImages = await Promise.all(input.images.map((image) => compressImageForUpload(image, {
      maxEdgePx: 1600,
      targetMaxBytes: 900 * 1024,
      skipBelowBytes: 180 * 1024,
      minQuality: 0.55,
    })));
    const formData = new FormData();
    compressedImages.forEach((image) => formData.append('images', image, image.name));
    formData.append('angles', JSON.stringify(input.angles || []));
    formData.append('damageAreas', JSON.stringify(input.damageAreas || []));
    if (input.vehicleId) formData.append('vehicleId', input.vehicleId);

    const response = await api.post<DetectionEnvelope>('/ai/scan', formData, {
      timeout: 45_000,
      headers: { 'Content-Type': 'multipart/form-data' },
      meta: { suppressErrorToast: true },
    } as never);
    if (response.data?.success === false || !response.data?.data) {
      throw new DamageDetectionApiError(
        response.data?.message || 'The damage scan returned an invalid response.',
        response.data?.code || 'INVALID_DAMAGE_RESPONSE'
      );
    }

    const result = response.data.data;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('autogloss:latest-damage-report', JSON.stringify(result));
      if (result.scanId) {
        sessionStorage.setItem(`autospf:scan:${result.scanId}`, JSON.stringify(result));
      }
    }
    return result;
  } catch (error) {
    throw toDetectionError(error);
  }
}

export default detectVehicleDamage;
