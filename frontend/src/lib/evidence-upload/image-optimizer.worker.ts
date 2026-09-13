/**
 * Off-main-thread evidence encoder: decode (EXIF orientation applied) → resize → WebP (JPEG when
 * the browser cannot encode WebP). Re-encoding also strips EXIF metadata such as GPS location.
 */
import { EVIDENCE_ENCODE_STEPS, EVIDENCE_TARGET_MAX_BYTES, fitWithinEdge } from './optimize-policy';

type EncodeRequest = { id: number; file: Blob };

const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
};

let webpSupported: boolean | null = null;

async function encodeStep(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const { width, height } = fitWithinEdge(bitmap.width, bitmap.height, maxEdge);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('offscreen-2d-unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  let blob: Blob | null = null;
  if (webpSupported !== false) {
    blob = await canvas.convertToBlob({ type: 'image/webp', quality });
    // Unsupported types silently fall back to PNG — detect by the returned type.
    if (webpSupported === null) webpSupported = blob.type === 'image/webp';
  }
  if (!webpSupported) blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { blob: blob as Blob, width, height };
}

async function encode(file: Blob) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let best: { blob: Blob; width: number; height: number } | null = null;
    for (const step of EVIDENCE_ENCODE_STEPS) {
      best = await encodeStep(bitmap, step.maxEdge, step.quality);
      if (best.blob.size <= EVIDENCE_TARGET_MAX_BYTES) break;
    }
    if (!best) throw new Error('encode-failed');
    return { ...best, mimeType: best.blob.type };
  } finally {
    bitmap.close();
  }
}

scope.onmessage = async (event) => {
  const { id, file } = event.data;
  try {
    const result = await encode(file);
    scope.postMessage({ id, ok: true, result });
  } catch (error) {
    scope.postMessage({ id, ok: false, error: (error as Error)?.message || String(error) });
  }
};
