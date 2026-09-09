import type { AiScanInputImage } from '../../services/api/aiService';

export const AI_SCAN_ROUTES = {
  estimate: '/(customer)/scan/estimate',
  prepare3d: '/(customer)/scan/prepare-3d',
  arView: '/(customer)/scan/ar-view',
} as const;

export const THREE_D_REQUIREMENTS = [
  'Full vehicle visible',
  'Good lighting',
  'Vehicle centered',
  'Avoid heavy glare or blur',
  'Do not crop major vehicle sections',
] as const;

export const THREE_D_OPTIONAL_HELPER =
  '3D visualization is optional. A full vehicle photo is required for best results.';

export const getAiResultDestination = (action: 'estimate' | 'continue_3d') =>
  action === 'estimate' ? AI_SCAN_ROUTES.estimate : AI_SCAN_ROUTES.prepare3d;

export const getThreeDPreparationCopy = (noDamageDetected: boolean) => ({
  eyebrow: noDamageDetected ? 'Optional Vehicle Visualization' : 'Optional 3D Visualization',
  generationLabel: noDamageDetected ? 'Generate Vehicle 3D Model' : 'Generate 3D Model',
  contextNote: noDamageDetected
    ? 'No AI-confirmed damage region will be represented in the vehicle-only 3D model.'
    : 'Your AI damage diagnosis remains saved separately from this 3D source photo.',
});

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const inferMimeType = (fileName = '', uri = '') => {
  const value = `${fileName} ${uri}`.toLowerCase();
  if (/\.png(?:\?|\s|$)/.test(value)) return 'image/png';
  if (/\.webp(?:\?|\s|$)/.test(value)) return 'image/webp';
  if (/\.heic(?:\?|\s|$)/.test(value)) return 'image/heic';
  if (/\.heif(?:\?|\s|$)/.test(value)) return 'image/heif';
  return 'image/jpeg';
};

export interface Vehicle3DImageCandidate {
  uri?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

export const createVehicle3DSourceImage = (
  candidate: Vehicle3DImageCandidate
): AiScanInputImage => ({
  uri: String(candidate.uri || '').trim(),
  fileName: candidate.fileName || `vehicle_3d_${Date.now()}.jpg`,
  mimeType: String(candidate.mimeType || inferMimeType(candidate.fileName || '', candidate.uri || ''))
    .toLowerCase(),
  angle: 'full_vehicle',
  selectedDamageArea: 'Vehicle',
  width: candidate.width ?? undefined,
  height: candidate.height ?? undefined,
  fileSize: candidate.fileSize ?? undefined,
});

export type Vehicle3DImageValidation =
  | { valid: true }
  | { valid: false; message: string };

export const validateVehicle3DSourceImage = (
  image: AiScanInputImage | null
): Vehicle3DImageValidation => {
  if (!image?.uri) {
    return { valid: false, message: 'Choose or capture a vehicle photo first.' };
  }

  const mimeType = String(image.mimeType || '').toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return { valid: false, message: 'Use a JPG, PNG, WebP, HEIC, or HEIF image.' };
  }

  if (
    !Number.isFinite(image.width)
    || !Number.isFinite(image.height)
    || Number(image.width) <= 0
    || Number(image.height) <= 0
  ) {
    return { valid: false, message: 'This image could not be read. Please choose another photo.' };
  }

  if (Math.min(Number(image.width), Number(image.height)) < 480) {
    return { valid: false, message: 'Choose a clearer image at least 480 pixels on its shortest side.' };
  }

  if (Number.isFinite(image.fileSize) && Number(image.fileSize) <= 0) {
    return { valid: false, message: 'This image appears to be empty or corrupted.' };
  }

  if (Number.isFinite(image.fileSize) && Number(image.fileSize) > 10 * 1024 * 1024) {
    return { valid: false, message: 'Choose an image smaller than 10 MB.' };
  }

  return { valid: true };
};

export const createVehicle3DSourcePatch = (image: AiScanInputImage | null) => ({
  vehicle3DSourceImage: image,
  modelStatus: 'idle' as const,
  modelTaskId: null,
  modelUrl: null,
  repairedModelUrl: null,
  modelUsdzUrl: null,
  modelProgress: 0,
  modelMessage: '',
});
