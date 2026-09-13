/**
 * Evidence image optimization with a small Web Worker pool (2 workers).
 *
 * The pool size is also a memory bound: decoding a 12MP photo needs ~48MB of RGBA, so decoding five
 * at once can crash a mobile tab. The upload queue additionally limits optimize concurrency to 2.
 * Browsers without OffscreenCanvas fall back to the same policy on the main thread.
 */
import { encodeEvidenceImageOnMainThread } from '@/lib/compress-image-for-upload';
import { EVIDENCE_UPLOAD_MIME_TYPES, shouldOptimizeEvidence } from './optimize-policy';
import { EvidenceUploadError, type OptimizedEvidenceImage } from './upload-queue';

const POOL_SIZE = 2;

type Encoded = { blob: Blob; width: number; height: number; mimeType: string };
type PoolWorker = { worker: Worker; busy: boolean };

const pool: PoolWorker[] = [];
const idleWaiters: Array<(worker: PoolWorker) => void> = [];
let workerUnavailable = false;
let messageSeq = 0;

function supportsWorkerEncoding(): boolean {
  return typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap === 'function'
    && 'convertToBlob' in OffscreenCanvas.prototype;
}

function acquire(): Promise<PoolWorker> {
  const idle = pool.find((entry) => !entry.busy);
  if (idle) {
    idle.busy = true;
    return Promise.resolve(idle);
  }
  if (pool.length < POOL_SIZE) {
    const entry: PoolWorker = {
      worker: new Worker(new URL('./image-optimizer.worker.ts', import.meta.url), { type: 'module' }),
      busy: true,
    };
    pool.push(entry);
    return Promise.resolve(entry);
  }
  return new Promise((resolve) => idleWaiters.push(resolve));
}

function release(entry: PoolWorker) {
  const next = idleWaiters.shift();
  if (next) {
    next(entry);
    return;
  }
  entry.busy = false;
}

async function encodeInWorker(file: Blob): Promise<Encoded> {
  const entry = await acquire();
  try {
    return await new Promise<Encoded>((resolve, reject) => {
      const id = ++messageSeq;
      const cleanup = () => {
        entry.worker.removeEventListener('message', onMessage);
        entry.worker.removeEventListener('error', onError);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.data?.id !== id) return;
        cleanup();
        if (event.data.ok) resolve(event.data.result as Encoded);
        else reject(new Error(event.data.error || 'worker-encode-failed'));
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        workerUnavailable = true;
        reject(new Error(event.message || 'worker-error'));
      };
      entry.worker.addEventListener('message', onMessage);
      entry.worker.addEventListener('error', onError);
      entry.worker.postMessage({ id, file });
    });
  } finally {
    release(entry);
  }
}

export async function optimizeEvidenceImage(file: File): Promise<OptimizedEvidenceImage> {
  const started = performance.now();
  const originalBytes = file.size;

  const passthrough = (): OptimizedEvidenceImage => {
    if (!EVIDENCE_UPLOAD_MIME_TYPES.has(file.type)) {
      throw new EvidenceUploadError('UNSUPPORTED_IMAGE', 'This photo format is not supported. Use JPG, PNG, or WebP.', {
        retryable: false,
      });
    }
    return { blob: file, width: 0, height: 0, mimeType: file.type, originalBytes, ms: performance.now() - started };
  };

  if (!shouldOptimizeEvidence(file)) return passthrough();

  let encoded: Encoded | null = null;
  if (!workerUnavailable && supportsWorkerEncoding()) {
    try {
      encoded = await encodeInWorker(file);
    } catch (error) {
      console.warn('[EVIDENCE-UPLOAD] Worker optimization failed; using main thread.', error);
    }
  }
  if (!encoded) encoded = await encodeEvidenceImageOnMainThread(file).catch(() => null);

  if (!encoded || (encoded.blob.size >= file.size && EVIDENCE_UPLOAD_MIME_TYPES.has(file.type))) {
    return passthrough();
  }
  return { ...encoded, originalBytes, ms: performance.now() - started };
}
