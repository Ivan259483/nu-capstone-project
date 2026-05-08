/**
 * Resize + JPEG-encode images in the browser so uploads finish faster
 * (smaller JSON body to API / Mongo).
 */
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
};

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

  const toBlob = (q: number) =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', q);
    });

  let quality = INITIAL_JPEG_QUALITY;
  let blob = await toBlob(quality);
  while (blob && blob.size > TARGET_MAX_BYTES && quality > minQ) {
    quality -= 0.07;
    blob = await toBlob(quality);
  }

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'tracker-photo';
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/** Tracker stage photos — larger, slightly higher quality cap. */
export async function compressImageForTrackerUpload(file: File): Promise<File> {
  return compressImageForUpload(file);
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
