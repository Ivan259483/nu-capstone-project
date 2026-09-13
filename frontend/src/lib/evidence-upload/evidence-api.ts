/**
 * Browser transport for the evidence upload queue: AutoSPF API (intents / commit / fail),
 * direct Cloudinary upload, and the server-side upload fallback.
 */
import api, { BACKEND_API_URL } from '@/lib/api';
import { uploadEvidenceToCloudinary } from './cloudinary-direct-upload';
import { optimizeEvidenceImage } from './image-optimizer';
import {
  EvidenceUploadError,
  type EvidenceCommitResult,
  type EvidenceIntent,
  type EvidenceUploadTransport,
  type OptimizedEvidenceImage,
} from './upload-queue';

const QUIET = { meta: { suppressErrorToast: true } };
const API_REQUEST_TIMEOUT_MS = 20_000;
const SERVER_UPLOAD_TIMEOUT_MS = 60_000;

let loggedApiBase = false;

/** Proves at runtime which backend the uploads reach (local Express vs deployed API). */
function logApiBaseOnce() {
  if (loggedApiBase) return;
  loggedApiBase = true;
  console.info('[EVIDENCE-UPLOAD] API base', {
    backendApiUrl: BACKEND_API_URL,
    pageOrigin: typeof window !== 'undefined' ? window.location.origin : null,
  });
}

function toEvidenceError(error: any): Error {
  if (error instanceof EvidenceUploadError) return error;
  if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') {
    return new DOMException('Aborted', 'AbortError');
  }
  const status: number | null = error?.response?.status ?? null;
  const data = error?.response?.data;
  const code = data?.code
    || (error?.code === 'ECONNABORTED' ? 'TIMEOUT' : status ? `HTTP_${status}` : 'NETWORK');
  return new EvidenceUploadError(code, data?.message || error?.message || 'Request failed', { status: status ?? 0 });
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

export const evidenceUploadTransport: EvidenceUploadTransport = {
  optimize: (file) => optimizeEvidenceImage(file as File),

  async createIntents(orderId, stage, items) {
    logApiBaseOnce();
    try {
      const res = await api.post(
        `/orders/${orderId}/stage-evidence/intents`,
        { stage, items },
        { ...QUIET, timeout: API_REQUEST_TIMEOUT_MS } as any
      );
      return (res.data?.data?.intents || []) as EvidenceIntent[];
    } catch (error) {
      throw toEvidenceError(error);
    }
  },

  uploadToCloudinary: (intent, image, onProgress, signal) => uploadEvidenceToCloudinary(intent, image, onProgress, signal),

  async commit(orderId, intent, response, description) {
    try {
      const res = await api.post(
        `/orders/${orderId}/stage-evidence/${intent.evidenceId}/commit`,
        { attemptId: intent.attemptId, ...response, ...(description ? { description } : {}) },
        { ...QUIET, timeout: API_REQUEST_TIMEOUT_MS } as any
      );
      return (res.data?.data || {}) as EvidenceCommitResult;
    } catch (error) {
      throw toEvidenceError(error);
    }
  },

  async reportFailure(orderId, intent, code, message) {
    try {
      await api.post(
        `/orders/${orderId}/stage-evidence/${intent.evidenceId}/fail`,
        { attemptId: intent.attemptId, code, message },
        { ...QUIET, timeout: 10_000 } as any
      );
    } catch {
      // Best effort: the server also expires abandoned attempts on its own.
    }
  },

  async uploadViaServer(orderId, stage, slot, image: OptimizedEvidenceImage, onProgress, signal, description) {
    logApiBaseOnce();
    const form = new FormData();
    form.append('stage', stage);
    form.append('slot', slot);
    if (description) form.append('description', description);
    form.append('photo', image.blob, `${slot}.${extensionFor(image.mimeType)}`);
    try {
      const res = await api.post(`/orders/${orderId}/stage-photo`, form, {
        ...QUIET,
        timeout: SERVER_UPLOAD_TIMEOUT_MS,
        signal,
        headers: { 'Content-Type': undefined },
        onUploadProgress: (event: { loaded: number; total?: number }) => {
          if (event.total) onProgress(Math.min(1, event.loaded / event.total));
        },
      } as any);
      return (res.data?.data || {}) as EvidenceCommitResult;
    } catch (error) {
      throw toEvidenceError(error);
    }
  },
};
