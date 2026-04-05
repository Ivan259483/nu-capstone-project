import { type ImagePickerAsset } from 'expo-image-picker';
import { Palette } from '@/constants/theme';
import { type DamageSeverity, type VehicleAngle, type VehicleImageInput } from './types';

export const VEHICLE_ANGLE_SLOTS: Array<{ angle: VehicleAngle; label: string; required: boolean }> = [
  { angle: 'front', label: 'Front View', required: false },
  { angle: 'rear', label: 'Rear View', required: false },
  { angle: 'left', label: 'Left Side', required: false },
  { angle: 'right', label: 'Right Side', required: false },
  { angle: 'close_up', label: 'Close-up Damage', required: false },
];

export const DAMAGE_AREA_OPTIONS: Record<VehicleAngle, string[]> = {
  front: ['Front Bumper', 'Left Fender', 'Right Fender', 'Front Panel', 'Left Headlight', 'Right Headlight'],
  rear: ['Rear Bumper', 'Trunk', 'Rear Panel', 'Left Tail Light', 'Right Tail Light'],
  left: ['Left Bumper', 'Left Fender', 'Left Panel'],
  right: ['Right Bumper', 'Right Fender', 'Right Panel'],
  close_up: ['Bumper', 'Fender', 'Panel', 'Trunk', 'Headlight', 'Tail Light'],
};

export const getDefaultDamageArea = (angle: VehicleAngle): string => {
  switch (angle) {
    case 'front':
      return 'Front Bumper';
    case 'rear':
      return 'Rear Bumper';
    case 'left':
      return 'Left Panel';
    case 'right':
      return 'Right Panel';
    default:
      return 'Panel';
  }
};

export const MIN_IMAGE_COUNT = 1;
export const MAX_IMAGE_COUNT = 5;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const getSeverityColor = (severity: DamageSeverity) => {
  if (severity === 'severe') return Palette.danger;
  if (severity === 'moderate') return Palette.warning;
  return Palette.success;
};

export const formatPhp = (value: number) => `₱${Math.max(0, Math.round(value)).toLocaleString('en-PH')}`;

export const normalizeAssetToImageInput = (
  asset: ImagePickerAsset,
  angle: VehicleAngle
): VehicleImageInput => {
  const extension = asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
  const mimeType = asset.mimeType || EXT_TO_MIME[extension] || 'image/jpeg';

  return {
    id: `${angle}_${Date.now()}`,
    angle,
    selectedDamageArea: getDefaultDamageArea(angle),
    uri: asset.uri,
    fileName: asset.fileName || `${angle}_${Date.now()}.${extension}`,
    mimeType,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
  };
};

import { Validation } from '@/utils/validation';

export const validateVehicleImage = (image: VehicleImageInput): string | null => {
  if (!Validation.isValidImageFormat(image.mimeType)) {
    return `${image.fileName} is not a supported image format.`;
  }

  if (image.fileSize && !Validation.isValidImageSize(image.fileSize, 10)) {
    return `${image.fileName} exceeds the 10MB upload limit.`;
  }

  return null;
};

export const validateVehicleImageSet = (images: VehicleImageInput[]): string | null => {
  if (images.length < MIN_IMAGE_COUNT) {
    return `Please provide at least ${MIN_IMAGE_COUNT} vehicle photo before analysis.`;
  }

  if (images.length > MAX_IMAGE_COUNT) {
    return `Maximum ${MAX_IMAGE_COUNT} photos are allowed.`;
  }

  for (const image of images) {
    const error = validateVehicleImage(image);
    if (error) return error;
  }

  return null;
};

/**
 * Validates that a URL points to a genuine GLB 3D model file.
 * Rejects Cloudinary image URLs, JPG/PNG/WebP, and any non-GLB resource.
 */
export const isValidGlbUrl = (url: string | null | undefined): boolean => {
  if (!url || typeof url !== 'string') return false;

  // Strip query string & fragment for path-based check
  const cleaned = url.split('?')[0].split('#')[0].toLowerCase().trim();

  // Must explicitly end with .glb
  if (!cleaned.endsWith('.glb')) return false;

  // Must be a full URL (not a local file path or random string)
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  // Block known image-hosting domains that should never serve GLB files
  const blockedDomains = ['res.cloudinary.com', 'cloudinary.com', 'imgur.com', 'unsplash.com'];
  const isBlocked = blockedDomains.some((domain) => url.toLowerCase().includes(domain));
  if (isBlocked) return false;

  return true;
};

export const mapStatusLabel = (status: string): string => {
  switch (status) {
    case 'uploading':
      return 'Preparing local scan data';
    case 'analyzing':
      return 'Running offline damage scan';
    case 'generating_3d':
      return 'Generating 3D vehicle model';
    case 'rendering_ar':
      return '3D model ready for AR';
    case 'estimating_cost':
      return 'Calculating service estimate';
    case 'awaiting_confirmation':
      return 'Ready for customer confirmation';
    case 'confirmed':
      return 'Service request confirmed';
    case 'failed':
      return 'Workflow failed';
    default:
      return 'Ready to scan vehicle';
  }
};
