/**
 * Browser → Cloudinary signed upload with real progress.
 *
 * Uses XMLHttpRequest (not the shared `api` axios instance): no Authorization header may leak to
 * Cloudinary, and upload progress events are required. Instead of one long overall timeout, a
 * stall watchdog aborts only when no progress arrives for `stallMs`, so slow-but-moving uploads
 * on weak networks are never killed while dead connections fail fast and get retried.
 */
import {
  EvidenceUploadError,
  type CloudinaryUploadResponse,
  type EvidenceIntent,
  type OptimizedEvidenceImage,
} from './upload-queue';

const DEFAULT_STALL_MS = 20_000;
/** After the last byte is sent, Cloudinary ingests and responds; allow for that separately. */
const RESPONSE_WAIT_MS = 30_000;

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

export function uploadEvidenceToCloudinary(
  intent: EvidenceIntent,
  image: OptimizedEvidenceImage,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  { stallMs = DEFAULT_STALL_MS }: { stallMs?: number } = {}
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      signal.removeEventListener('abort', onAbort);
      complete();
    };

    const arm = (ms: number, code: 'STALLED' | 'TIMEOUT') => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        xhr.abort();
        finish(() => reject(new EvidenceUploadError(
          code,
          code === 'STALLED'
            ? `Upload stalled — no progress for ${Math.round(stallMs / 1000)} seconds.`
            : 'Cloudinary did not respond in time.',
          { retryable: true }
        )));
      }, ms);
    };

    const onAbort = () => {
      xhr.abort();
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    xhr.open('POST', intent.uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
      arm(stallMs, 'STALLED');
    };
    xhr.upload.onload = () => {
      onProgress(1);
      arm(RESPONSE_WAIT_MS, 'TIMEOUT');
    };
    xhr.onerror = () => finish(() => reject(
      new EvidenceUploadError('NETWORK', 'Network error while uploading to Cloudinary.', { status: 0, retryable: true })
    ));
    xhr.onload = () => finish(() => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText || 'null');
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.public_id && body?.version && body?.signature) {
        resolve({
          public_id: body.public_id,
          version: body.version,
          signature: body.signature,
          format: body.format,
          bytes: body.bytes,
          width: body.width,
          height: body.height,
        });
        return;
      }
      const message = body?.error?.message || `Cloudinary upload failed (HTTP ${xhr.status}).`;
      // Signatures are valid for one hour; an expired one needs a fresh intent, not a user action.
      const expired = /stale request/i.test(message);
      reject(new EvidenceUploadError(expired ? 'INTENT_EXPIRED' : `CLOUDINARY_${xhr.status || 'ERROR'}`, message, {
        status: xhr.status,
        retryable: expired || xhr.status === 0 || xhr.status === 408 || xhr.status === 429 || xhr.status >= 500,
      }));
    });

    const form = new FormData();
    for (const [name, value] of Object.entries(intent.fields)) form.append(name, String(value));
    form.append('file', image.blob, `${intent.slot}.${extensionFor(image.mimeType)}`);

    arm(stallMs, 'STALLED');
    xhr.send(form);
  });
}
