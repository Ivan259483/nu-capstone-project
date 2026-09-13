import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

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

export type CompressedPaymentProofAsset = {
  uri: string;
  base64: string;
  mimeType: string;
};

// Mirrors the web app's compressImageForBookingProof (frontend/src/lib/compress-image-for-upload.ts):
// resize to a max 1280px edge, JPEG, target <=420KB, quality floor 0.48.
const COMPRESSED_MAX_EDGE_PX = 1280;
const COMPRESSED_TARGET_MAX_BYTES = 420 * 1024;
const COMPRESSED_INITIAL_QUALITY = 0.86;
const COMPRESSED_MIN_QUALITY = 0.48;
const COMPRESSED_QUALITY_STEP = 0.1;

const estimateBytesFromBase64 = (base64: string): number => base64.length * 0.75;

const buildInitialResizeAction = (
  asset: ImagePicker.ImagePickerAsset,
): { resize: { width?: number; height?: number } } | null => {
  const { width, height } = asset;
  if (!width || !height) {
    // Dimensions unknown up front - just cap the width and let the library preserve aspect ratio.
    return { resize: { width: COMPRESSED_MAX_EDGE_PX } };
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= COMPRESSED_MAX_EDGE_PX) {
    // Already within bounds - do not upscale.
    return null;
  }

  return width >= height
    ? { resize: { width: COMPRESSED_MAX_EDGE_PX } }
    : { resize: { height: COMPRESSED_MAX_EDGE_PX } };
};

/**
 * Resizes and JPEG-compresses a payment-proof screenshot before it is turned into a data URL,
 * so uploads finish faster and avoid timeouts on full camera-resolution photos.
 *
 * Compression is an optimization, not a requirement: if manipulation throws for any reason,
 * the original asset's data is returned unchanged so the booking flow is never blocked.
 */
export const compressPaymentProofAsset = async (
  asset: ImagePicker.ImagePickerAsset,
): Promise<CompressedPaymentProofAsset> => {
  const fallback = (): CompressedPaymentProofAsset => ({
    uri: asset.uri,
    base64: asset.base64 ?? '',
    mimeType: inferMimeType(asset) ?? 'image/jpeg',
  });

  try {
    const resizeAction = buildInitialResizeAction(asset);

    let result = await manipulateAsync(asset.uri, resizeAction ? [resizeAction] : [], {
      base64: true,
      compress: COMPRESSED_INITIAL_QUALITY,
      format: SaveFormat.JPEG,
    });

    let quality = COMPRESSED_INITIAL_QUALITY;
    while (
      result.base64 &&
      estimateBytesFromBase64(result.base64) > COMPRESSED_TARGET_MAX_BYTES &&
      quality - COMPRESSED_QUALITY_STEP >= COMPRESSED_MIN_QUALITY
    ) {
      quality -= COMPRESSED_QUALITY_STEP;
      // Re-use the already-resized URI for subsequent quality passes instead of resizing again.
      result = await manipulateAsync(result.uri, [], {
        base64: true,
        compress: quality,
        format: SaveFormat.JPEG,
      });
    }

    if (!result.base64) {
      return fallback();
    }

    return { uri: result.uri, base64: result.base64, mimeType: 'image/jpeg' };
  } catch {
    return fallback();
  }
};

/** Builds the final `data:<mime>;base64,...` string from an already-compressed payment proof. */
export const paymentProofDataUrlFromCompressedAsset = (
  compressed: CompressedPaymentProofAsset,
): string => {
  if (!compressed.base64) {
    throw new Error('The selected receipt could not be read. Please choose the screenshot again.');
  }

  return `data:${compressed.mimeType};base64,${compressed.base64}`;
};
