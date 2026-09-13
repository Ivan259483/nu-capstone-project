/**
 * Resize + JPEG-encode images in the browser so uploads finish faster
 * (smaller JSON body to API / Mongo).
 */
import {
  EVIDENCE_ENCODE_STEPS,
  EVIDENCE_TARGET_MAX_BYTES,
  fitWithinEdge,
  shouldOptimizeEvidence,
} from '@/lib/evidence-upload/optimize-policy';

const DEFAULT_MAX_EDGE_PX = 1600;
const DEFAULT_TARGET_MAX_BYTES = 900 * 1024;
const DEFAULT_SKIP_BELOW_BYTES = 200 * 1024;
const INITIAL_JPEG_QUALITY = 0.86;
const MIN_JPEG_QUALITY = 0.52;

export type CompressImageOptions = {
  maxEdgePx?: number;
  targetMaxBytes?: number;
  skipBelowBytes?: number;
  minQuality?: number;
  forceJpeg?: boolean;
};

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

function fileFromJpegBlob(file: File, blob: Blob): File {
  const base = file.name.replace(/\.[^.]+$/, '') || 'tracker-photo';
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-decode-failed'));
    };
    img.src = url;
  });
}

/**
 * Returns a JPEG File (usually much smaller than phone screenshots / PNGs).
 * On failure or if output would be larger than input, returns the original file.
 */
export async function compressImageForUpload(file: File, options?: CompressImageOptions): Promise<File> {
  const MAX_EDGE_PX = options?.maxEdgePx ?? DEFAULT_MAX_EDGE_PX;
  const TARGET_MAX_BYTES = options?.targetMaxBytes ?? DEFAULT_TARGET_MAX_BYTES;
  const skipBelow = options?.skipBelowBytes ?? DEFAULT_SKIP_BELOW_BYTES;
  const minQ = options?.minQuality ?? MIN_JPEG_QUALITY;

  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;
  if (file.size < skipBelow) return file;

  let bitmap: ImageBitmap | null = null;
  let htmlImg: HTMLImageElement | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      htmlImg = await loadHtmlImage(file);
    }
  } catch {
    try {
      htmlImg = await loadHtmlImage(file);
    } catch {
      return file;
    }
  }

  const srcW = bitmap?.width ?? htmlImg!.naturalWidth;
  const srcH = bitmap?.height ?? htmlImg!.naturalHeight;
  if (!srcW || !srcH) {
    bitmap?.close();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap?.close();
    return file;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
  } else {
    ctx.drawImage(htmlImg!, 0, 0, w, h);
  }

  let quality = INITIAL_JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob && blob.size > TARGET_MAX_BYTES && quality > minQ) {
    quality -= 0.07;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  if (!blob || (!options?.forceJpeg && blob.size >= file.size)) {
    return file;
  }

  return fileFromJpegBlob(file, blob);
}

export type EncodedEvidenceImage = { blob: Blob; width: number; height: number; mimeType: string };

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

let mainThreadWebpSupported: boolean | null = null;

/**
 * Main-thread gate evidence encoder — the fallback for browsers without OffscreenCanvas.
 * Follows the same policy as `lib/evidence-upload/image-optimizer.worker.ts`: 1600px longest
 * edge, WebP (JPEG when unsupported), quality stepped down until the photo fits ~500 KB.
 */
export async function encodeEvidenceImageOnMainThread(file: File): Promise<EncodedEvidenceImage | null> {
  let bitmap: ImageBitmap | null = null;
  let htmlImg: HTMLImageElement | null = null;
  try {
    bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file, { imageOrientation: 'from-image' })
      : null;
    if (!bitmap) htmlImg = await loadHtmlImage(file);
  } catch {
    try {
      htmlImg = await loadHtmlImage(file);
    } catch {
      return null;
    }
  }

  const srcW = bitmap?.width ?? htmlImg!.naturalWidth;
  const srcH = bitmap?.height ?? htmlImg!.naturalHeight;
  if (!srcW || !srcH) {
    bitmap?.close();
    return null;
  }

  let best: EncodedEvidenceImage | null = null;
  try {
    for (const step of EVIDENCE_ENCODE_STEPS) {
      const { width, height } = fitWithinEdge(srcW, srcH, step.maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return best;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage((bitmap ?? htmlImg)!, 0, 0, width, height);

      let blob: Blob | null = null;
      if (mainThreadWebpSupported !== false) {
        blob = await canvasToBlob(canvas, 'image/webp', step.quality);
        if (mainThreadWebpSupported === null) mainThreadWebpSupported = blob?.type === 'image/webp';
      }
      if (!mainThreadWebpSupported) blob = await canvasToBlob(canvas, 'image/jpeg', step.quality);
      if (!blob) return best;

      best = { blob, width, height, mimeType: blob.type };
      if (blob.size <= EVIDENCE_TARGET_MAX_BYTES) break;
    }
    return best;
  } finally {
    bitmap?.close();
  }
}

/** Tracker stage photos (non-gate stages) — same evidence policy as the gate upload queue. */
export async function compressImageForTrackerUpload(file: File): Promise<File> {
  if (!shouldOptimizeEvidence(file)) return file;
  const encoded = await encodeEvidenceImageOnMainThread(file).catch(() => null);
  if (!encoded || encoded.blob.size >= file.size) return file;
  const base = file.name.replace(/\.[^.]+$/, '') || 'tracker-photo';
  const extension = encoded.mimeType === 'image/webp' ? 'webp' : 'jpg';
  return new File([encoded.blob], `${base}.${extension}`, { type: encoded.mimeType, lastModified: Date.now() });
}

/**
 * GCash / booking payment screenshots — smaller payload so POST /bookings returns faster.
 */
export async function compressImageForBookingProof(file: File): Promise<File> {
  return compressImageForUpload(file, {
    maxEdgePx: 1280,
    targetMaxBytes: 420 * 1024,
    skipBelowBytes: 120 * 1024,
    minQuality: 0.48,
  });
}

/** Small, web-safe JPEG for customer avatars selected from phone cameras. */
export async function compressProfilePhoto(file: File): Promise<File> {
  return compressImageForUpload(file, {
    maxEdgePx: 720,
    targetMaxBytes: 450 * 1024,
    skipBelowBytes: 0,
    minQuality: 0.48,
    forceJpeg: true,
  });
}
