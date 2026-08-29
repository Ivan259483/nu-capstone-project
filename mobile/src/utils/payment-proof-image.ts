import * as ImagePicker from 'expo-image-picker';

export const PAYMENT_PROOF_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 1,
  base64: true,
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const SUPPORTED_PAYMENT_PROOF_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

const inferMimeType = (asset: ImagePicker.ImagePickerAsset): string | null => {
  const reportedMimeType = asset.mimeType?.trim().toLowerCase();
  if (reportedMimeType === 'image/jpg') return 'image/jpeg';
  if (reportedMimeType && SUPPORTED_PAYMENT_PROOF_MIME_TYPES.has(reportedMimeType)) {
    return reportedMimeType;
  }

  const name = asset.fileName || asset.uri;
  const extension = name.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] || null : null;
};

export const paymentProofDataUrlFromAsset = (
  asset: ImagePicker.ImagePickerAsset,
): string => {
  if (!asset.base64) {
    throw new Error('The selected receipt could not be read. Please choose the screenshot again.');
  }

  const mimeType = inferMimeType(asset);
  if (!mimeType) {
    throw new Error('Please select a JPG, PNG, or WebP receipt screenshot.');
  }

  return `data:${mimeType};base64,${asset.base64}`;
};
