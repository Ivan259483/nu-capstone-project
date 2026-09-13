/**
 * Parallel upload queue for live-tracker gate evidence.
 *
 * Per photo: optimize (bounded pool) → signed intent (batched, one request for the whole pick)
 * → direct Cloudinary upload (bounded, default 5 in parallel) → commit to the API.
 *
 * - Each photo has its own state (PENDING / UPLOADING / SUCCESS / FAILED / RETRY), phase and
 *   progress, so the UI can show "Front ✓ · Rear 80% · Left Waiting".
 * - A failure only affects that photo. Transient failures auto-retry with backoff; a manual
 *   `retry(key)` reuses the already-optimized image, and if the Cloudinary upload had already
 *   succeeded it retries the commit only — the photo is never uploaded twice.
 * - Picking a new photo for a slot cancels the in-flight one.
 *
 * Deliberately free of DOM, React and `@/` imports so it can be unit tested under Node with a
 * fake transport (see tests/evidenceUploadQueue.test.ts).
 */

export type EvidenceUploadState = 'PENDING' | 'UPLOADING' | 'SUCCESS' | 'FAILED' | 'RETRY';
export type EvidenceUploadPhase = 'waiting' | 'optimizing' | 'signing' | 'uploading' | 'saving' | 'done' | 'failed';

export type OptimizedEvidenceImage = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  originalBytes: number;
  ms: number;
};

export type EvidenceIntentRequest = { slot: string; bytes: number; originalBytes: number };

export type EvidenceIntent = {
  slot: string;
  evidenceId: string;
  attemptId: string;
  status?: string;
  uploadUrl: string;
  fields: Record<string, string>;
  expiresAt: string;
};

export type CloudinaryUploadResponse = {
  public_id: string;
  version: string | number;
  signature: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
};

export type EvidenceCommitResult = {
  photoUrl?: string;
  savedMedia?: unknown;
  trackerStageMedia?: unknown[];
  superseded?: boolean;
};

export interface EvidenceUploadTransport {
  optimize(file: Blob): Promise<OptimizedEvidenceImage>;
  createIntents(orderId: string, stage: string, items: EvidenceIntentRequest[]): Promise<EvidenceIntent[]>;
  uploadToCloudinary(
    intent: EvidenceIntent,
    image: OptimizedEvidenceImage,
    onProgress: (fraction: number) => void,
    signal: AbortSignal
  ): Promise<CloudinaryUploadResponse>;
  commit(
    orderId: string,
    intent: EvidenceIntent,
    response: CloudinaryUploadResponse,
    description?: string
  ): Promise<EvidenceCommitResult>;
  reportFailure?(orderId: string, intent: EvidenceIntent, code: string, message: string): Promise<void>;
  /** Server-side upload, used when direct Cloudinary upload is unavailable. */
  uploadViaServer?(
    orderId: string,
    stage: string,
    slot: string,
    image: OptimizedEvidenceImage,
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
    description?: string
  ): Promise<EvidenceCommitResult>;
}

const RETRYABLE_CODES = new Set(['NETWORK', 'TIMEOUT', 'STALLED', 'INTENT_EXPIRED', 'INTENT_MISSING']);
const TERMINAL_CODES = new Set(['UNSUPPORTED_IMAGE', 'SUPERSEDED', 'ABORTED']);

export function isRetryableUploadFailure(status: number | null, code = ''): boolean {
  if (TERMINAL_CODES.has(code)) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  if (status === null || status === 0) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class EvidenceUploadError extends Error {
  code: string;
  status: number | null;
  retryable: boolean;

  constructor(code: string, message: string, options: { status?: number | null; retryable?: boolean } = {}) {
    super(message);
    this.name = 'EvidenceUploadError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? isRetryableUploadFailure(this.status, code);
  }
}

export type EvidenceUploadItem = {
  key: string;
  orderId: string;
  stage: string;
  slot: string;
  state: EvidenceUploadState;
  phase: EvidenceUploadPhase;
  /** 0–100: optimize 0–10, upload 10–95, commit 95–100. */
  progress: number;
  attempt: number;
  autoRetries: number;
  batchId: string;
  via: 'direct' | 'server' | null;
  originalBytes: number;
  optimizedBytes: number | null;
  error: { code: string; message: string } | null;
  /** Whether a manual Retry makes sense for the current failure. */
  retryable: boolean;
  enqueuedAt: number;
  settledAt: number | null;
  timings: { optimizeMs?: number; signMs?: number; uploadMs?: number; commitMs?: number; totalMs?: number };
  result: EvidenceCommitResult | null;
};

export type EvidenceUploadOutcome = {
  success: boolean;
  cancelled?: boolean;
  result?: EvidenceCommitResult;
  error?: { code: string; message: string };
};

export type EvidenceBatchSummary = {
  batchId: string;
  orderId: string;
  stage: string;
  total: number;
  succeeded: number;
  failed: number;
  inFlight: number;
  settled: boolean;
  startedAt: number;
  settledAt: number | null;
  durationMs: number | null;
  items: Array<{
    slot: string;
    state: EvidenceUploadState;
    via: 'direct' | 'server' | null;
    originalBytes: number;
    optimizedBytes: number | null;
    autoRetries: number;
    timings: EvidenceUploadItem['timings'];
    error: string | null;
    errorMessage: string | null;
  }>;
};

export type EvidenceUploadSnapshot = { version: number; items: ReadonlyMap<string, EvidenceUploadItem> };

export type EvidenceUploadQueueOptions = {
  optimizeConcurrency?: number;
  uploadConcurrency?: number;
  maxAutoRetries?: number;
  retryDelaysMs?: number[];
  jitterMs?: number;
  intentBatchWindowMs?: number;
  maxIntentBatch?: number;
  directUpload?: boolean;
  now?: () => number;
  random?: () => number;
  logger?: Pick<Console, 'info' | 'warn'>;
};

export function evidenceUploadKey(orderId: string, stage: string, slot: string): string {
  return `${orderId}:${stage}:${slot}`;
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

function toUploadError(error: unknown): EvidenceUploadError {
  if (error instanceof EvidenceUploadError) return error;
  const message = (error as { message?: string } | null)?.message || 'Upload failed';
  return new EvidenceUploadError('UNKNOWN', message, { retryable: true });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createLimiter(limit: number) {
  let active = 0;
  let max = Math.max(1, limit);
  const waiting: Array<() => void> = [];
  const pump = () => {
    while (active < max && waiting.length) {
      active += 1;
      waiting.shift()!();
    }
  };
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          task().then(resolve, reject).finally(() => {
            active -= 1;
            pump();
          });
        });
        pump();
      });
    },
    setLimit(next: number) {
      max = Math.max(1, next);
      pump();
    },
    get limit() {
      return max;
    },
  };
}

type Job = {
  key: string;
  orderId: string;
  stage: string;
  slot: string;
  file: Blob | null;
  description?: string;
  image?: OptimizedEvidenceImage;
  uploaded?: { intent: EvidenceIntent; response: CloudinaryUploadResponse };
  controller: AbortController;
  waiters: Array<(outcome: EvidenceUploadOutcome) => void>;
};

type Batch = {
  batchId: string;
  orderId: string;
  stage: string;
  keys: Set<string>;
  startedAt: number;
  settledAt: number | null;
};

type IntentEntry = {
  request: EvidenceIntentRequest;
  resolve: (intent: EvidenceIntent) => void;
  reject: (error: unknown) => void;
};

const SETTLED_STATES: ReadonlySet<EvidenceUploadState> = new Set(['SUCCESS', 'FAILED']);

export class EvidenceUploadQueue {
  private transport: EvidenceUploadTransport;
  private options: Required<Omit<EvidenceUploadQueueOptions, 'logger' | 'now' | 'random'>>;
  private now: () => number;
  private random: () => number;
  private logger: Pick<Console, 'info' | 'warn'>;
  private optimizeLimiter: ReturnType<typeof createLimiter>;
  private uploadLimiter: ReturnType<typeof createLimiter>;
  private directUpload: boolean;
  private stallCount = 0;
  private jobs = new Map<string, Job>();
  private items = new Map<string, EvidenceUploadItem>();
  private snapshot: EvidenceUploadSnapshot = { version: 0, items: this.items };
  private listeners = new Set<() => void>();
  private batchListeners = new Set<(summary: EvidenceBatchSummary) => void>();
  private batches = new Map<string, Batch>();
  private activeBatchByScope = new Map<string, string>();
  private intentBatches = new Map<string, { orderId: string; stage: string; entries: IntentEntry[]; timer: ReturnType<typeof setTimeout> | null }>();
  private batchSeq = 0;

  constructor(transport: EvidenceUploadTransport, options: EvidenceUploadQueueOptions = {}) {
    this.transport = transport;
    this.options = {
      optimizeConcurrency: options.optimizeConcurrency ?? 2,
      uploadConcurrency: options.uploadConcurrency ?? 5,
      maxAutoRetries: options.maxAutoRetries ?? 2,
      retryDelaysMs: options.retryDelaysMs ?? [1000, 3000],
      jitterMs: options.jitterMs ?? 400,
      intentBatchWindowMs: options.intentBatchWindowMs ?? 40,
      maxIntentBatch: options.maxIntentBatch ?? 6,
      directUpload: options.directUpload ?? true,
    };
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.logger = options.logger ?? console;
    this.optimizeLimiter = createLimiter(this.options.optimizeConcurrency);
    this.uploadLimiter = createLimiter(this.options.uploadConcurrency);
    this.directUpload = this.options.directUpload && typeof transport.uploadToCloudinary === 'function';
  }

  // ── Store API (useSyncExternalStore-compatible) ──────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EvidenceUploadSnapshot => this.snapshot;

  onBatchSettled(listener: (summary: EvidenceBatchSummary) => void): () => void {
    this.batchListeners.add(listener);
    return () => this.batchListeners.delete(listener);
  }

  get(key: string): EvidenceUploadItem | undefined {
    return this.items.get(key);
  }

  has(key: string): boolean {
    return this.jobs.has(key);
  }

  hasActiveUploads(): boolean {
    for (const item of this.items.values()) {
      if (!SETTLED_STATES.has(item.state)) return true;
    }
    return false;
  }

  getBatchSummary(orderId: string, stage: string): EvidenceBatchSummary | null {
    const batchId = this.activeBatchByScope.get(`${orderId}:${stage}`);
    const batch = batchId ? this.batches.get(batchId) : undefined;
    return batch ? this.summarize(batch) : null;
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  enqueue(input: { orderId: string; stage: string; slot: string; file: Blob; description?: string }): Promise<EvidenceUploadOutcome> {
    const key = evidenceUploadKey(input.orderId, input.stage, input.slot);
    const existing = this.jobs.get(key);
    if (existing) this.cancelJob(existing);

    const job: Job = {
      key,
      orderId: input.orderId,
      stage: input.stage,
      slot: input.slot,
      file: input.file,
      description: input.description,
      controller: new AbortController(),
      waiters: [],
    };
    this.jobs.set(key, job);

    const batchId = this.joinBatch(job);
    this.setItem(key, {
      key,
      orderId: job.orderId,
      stage: job.stage,
      slot: job.slot,
      state: 'PENDING',
      phase: 'waiting',
      progress: 0,
      attempt: 1,
      autoRetries: 0,
      batchId,
      via: null,
      originalBytes: input.file.size,
      optimizedBytes: null,
      error: null,
      retryable: false,
      enqueuedAt: this.now(),
      settledAt: null,
      timings: {},
      result: null,
    });

    const outcome = this.waitFor(job);
    void this.run(job);
    return outcome;
  }

  /** Retries one failed photo. Resolves immediately for photos that are not in a failed state. */
  retry(key: string): Promise<EvidenceUploadOutcome> {
    const job = this.jobs.get(key);
    const item = this.items.get(key);
    if (!job || !item) return Promise.resolve({ success: false, error: { code: 'NOT_FOUND', message: 'Nothing to retry' } });
    if (item.state === 'SUCCESS') return Promise.resolve({ success: true, result: item.result ?? undefined });
    if (item.state !== 'FAILED') return this.waitFor(job);

    job.controller = new AbortController();
    const batchId = this.joinBatch(job);
    this.patch(job, {
      state: 'RETRY',
      phase: 'waiting',
      attempt: item.attempt + 1,
      autoRetries: 0,
      batchId,
      error: null,
      retryable: false,
      settledAt: null,
      progress: job.uploaded ? 95 : job.image ? 10 : 0,
    });
    const outcome = this.waitFor(job);
    void this.run(job);
    return outcome;
  }

  retryAllFailed(orderId: string, stage: string): Promise<EvidenceUploadOutcome[]> {
    const keys = [...this.items.values()]
      .filter((item) => item.orderId === orderId && item.stage === stage && item.state === 'FAILED')
      .map((item) => item.key);
    return Promise.all(keys.map((key) => this.retry(key)));
  }

  cancel(key: string) {
    const job = this.jobs.get(key);
    if (!job) return;
    this.cancelJob(job);
    this.jobs.delete(key);
    const next = new Map(this.items);
    next.delete(key);
    this.items = next;
    for (const batch of this.batches.values()) batch.keys.delete(key);
    this.emit();
  }

  // ── Pipeline ────────────────────────────────────────────────────────────────

  private async run(job: Job): Promise<void> {
    const { signal } = job.controller;
    const startedAt = this.now();
    try {
      if (!job.image) {
        this.patch(job, { phase: 'waiting' });
        job.image = await this.optimizeLimiter.run(async () => {
          throwIfAborted(signal);
          this.patch(job, { state: 'UPLOADING', phase: 'optimizing', progress: 2 });
          const t0 = this.now();
          const image = await this.transport.optimize(job.file as Blob);
          this.patchTimings(job, { optimizeMs: this.now() - t0 });
          return image;
        });
        job.file = null;
        this.patch(job, { optimizedBytes: job.image.blob.size, progress: 10 });
      }
      throwIfAborted(signal);
      const image = job.image;

      let result: EvidenceCommitResult;
      if (!this.directUpload && this.transport.uploadViaServer) {
        this.patch(job, { state: 'UPLOADING', phase: 'waiting', via: 'server' });
        result = await this.uploadLimiter.run(async () => {
          throwIfAborted(signal);
          this.patch(job, { phase: 'uploading' });
          const t0 = this.now();
          const serverResult = await this.transport.uploadViaServer!(
            job.orderId, job.stage, job.slot, image,
            (fraction) => this.setProgress(job, 10 + fraction * 85),
            signal,
            job.description
          );
          this.patchTimings(job, { uploadMs: this.now() - t0 });
          return serverResult;
        });
      } else {
        if (!job.uploaded) {
          this.patch(job, { state: 'UPLOADING', phase: 'signing', via: 'direct' });
          const t0 = this.now();
          const intent = await this.requestIntent(job, { slot: job.slot, bytes: image.blob.size, originalBytes: image.originalBytes });
          this.patchTimings(job, { signMs: this.now() - t0 });
          throwIfAborted(signal);

          this.patch(job, { phase: 'waiting' });
          const response = await this.uploadLimiter.run(async () => {
            throwIfAborted(signal);
            this.patch(job, { phase: 'uploading' });
            const t1 = this.now();
            try {
              return await this.transport.uploadToCloudinary(
                intent, image, (fraction) => this.setProgress(job, 10 + fraction * 85), signal
              );
            } catch (error) {
              if (!isAbortError(error) && this.transport.reportFailure) {
                const failure = toUploadError(error);
                void this.transport.reportFailure(job.orderId, intent, failure.code, failure.message).catch(() => {});
              }
              throw error;
            } finally {
              this.patchTimings(job, { uploadMs: this.now() - t1 });
            }
          });
          job.uploaded = { intent, response };
        }

        throwIfAborted(signal);
        this.patch(job, { state: 'UPLOADING', phase: 'saving', progress: 96 });
        const t2 = this.now();
        try {
          result = await this.transport.commit(job.orderId, job.uploaded.intent, job.uploaded.response, job.description);
        } catch (error) {
          const failure = toUploadError(error);
          // A rejected commit (bad signature, wrong slot…) will never succeed with the same
          // upload — the next retry must upload again instead of re-committing.
          if (!failure.retryable) job.uploaded = undefined;
          throw error;
        } finally {
          this.patchTimings(job, { commitMs: this.now() - t2 });
        }
      }

      job.image = undefined;
      this.patch(job, {
        state: 'SUCCESS',
        phase: 'done',
        progress: 100,
        error: null,
        retryable: false,
        result,
        settledAt: this.now(),
      });
      this.patchTimings(job, { totalMs: this.now() - (this.items.get(job.key)?.enqueuedAt ?? startedAt) });
      this.settle(job, { success: true, result });
    } catch (raw) {
      if (signal.aborted || isAbortError(raw)) {
        this.resolveWaiters(job, { success: false, cancelled: true });
        return;
      }
      const error = toUploadError(raw);

      if (error.code === 'DIRECT_UPLOAD_UNAVAILABLE' && this.directUpload && this.transport.uploadViaServer) {
        this.directUpload = false;
        this.logger.warn('[EVIDENCE-UPLOAD] Direct Cloudinary upload unavailable; switching to server upload.');
        return this.run(job);
      }
      if (error.code === 'STALLED') {
        this.stallCount += 1;
        if (this.stallCount >= 2 && this.uploadLimiter.limit > 2) this.uploadLimiter.setLimit(2);
      }

      const item = this.items.get(job.key);
      if (this.jobs.get(job.key) !== job || !item) return;

      if (error.retryable && item.autoRetries < this.options.maxAutoRetries) {
        const delays = this.options.retryDelaysMs;
        const delay = (delays[Math.min(item.autoRetries, delays.length - 1)] ?? 0) + this.random() * this.options.jitterMs;
        this.patch(job, {
          state: 'RETRY',
          phase: 'waiting',
          autoRetries: item.autoRetries + 1,
          error: { code: error.code, message: error.message },
        });
        try {
          await sleep(delay, signal);
        } catch {
          this.resolveWaiters(job, { success: false, cancelled: true });
          return;
        }
        return this.run(job);
      }

      const failure = { code: error.code, message: error.message };
      this.patch(job, {
        state: 'FAILED',
        phase: 'failed',
        error: failure,
        retryable: error.code !== 'UNSUPPORTED_IMAGE' && error.code !== 'SUPERSEDED',
        settledAt: this.now(),
      });
      this.settle(job, { success: false, error: failure });
    }
  }

  private requestIntent(job: Job, request: EvidenceIntentRequest): Promise<EvidenceIntent> {
    const scope = `${job.orderId}:${job.stage}`;
    return new Promise<EvidenceIntent>((resolve, reject) => {
      let batch = this.intentBatches.get(scope);
      if (!batch) {
        batch = { orderId: job.orderId, stage: job.stage, entries: [], timer: null };
        this.intentBatches.set(scope, batch);
        batch.timer = setTimeout(() => void this.flushIntents(scope), this.options.intentBatchWindowMs);
      }
      const duplicate = batch.entries.find((entry) => entry.request.slot === request.slot);
      if (duplicate) {
        batch.entries = batch.entries.filter((entry) => entry !== duplicate);
        duplicate.reject(abortError());
      }
      batch.entries.push({ request, resolve, reject });
      if (batch.entries.length >= this.options.maxIntentBatch) {
        if (batch.timer) clearTimeout(batch.timer);
        void this.flushIntents(scope);
      }
    });
  }

  private async flushIntents(scope: string) {
    const batch = this.intentBatches.get(scope);
    if (!batch) return;
    this.intentBatches.delete(scope);
    if (batch.timer) clearTimeout(batch.timer);
    if (!batch.entries.length) return;
    try {
      const intents = await this.transport.createIntents(batch.orderId, batch.stage, batch.entries.map((entry) => entry.request));
      for (const entry of batch.entries) {
        const intent = intents.find((candidate) => candidate.slot === entry.request.slot);
        if (intent) entry.resolve(intent);
        else entry.reject(new EvidenceUploadError('INTENT_MISSING', 'The server did not sign this photo.', { retryable: true }));
      }
    } catch (error) {
      for (const entry of batch.entries) entry.reject(error);
    }
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private cancelJob(job: Job) {
    job.controller.abort();
    this.resolveWaiters(job, { success: false, cancelled: true });
  }

  private waitFor(job: Job): Promise<EvidenceUploadOutcome> {
    return new Promise((resolve) => job.waiters.push(resolve));
  }

  private resolveWaiters(job: Job, outcome: EvidenceUploadOutcome) {
    const waiters = job.waiters.splice(0);
    for (const resolve of waiters) resolve(outcome);
  }

  private settle(job: Job, outcome: EvidenceUploadOutcome) {
    this.resolveWaiters(job, outcome);
    const batchId = this.items.get(job.key)?.batchId;
    if (batchId) this.checkBatch(batchId);
  }

  private joinBatch(job: Job): string {
    const scope = `${job.orderId}:${job.stage}`;
    const activeId = this.activeBatchByScope.get(scope);
    let batch = activeId ? this.batches.get(activeId) : undefined;
    if (!batch || batch.settledAt !== null) {
      this.batchSeq += 1;
      batch = { batchId: `batch-${this.batchSeq}`, orderId: job.orderId, stage: job.stage, keys: new Set(), startedAt: this.now(), settledAt: null };
      this.batches.set(batch.batchId, batch);
      this.activeBatchByScope.set(scope, batch.batchId);
      if (activeId) this.batches.delete(activeId);
    }
    batch.keys.add(job.key);
    return batch.batchId;
  }

  private checkBatch(batchId: string) {
    const batch = this.batches.get(batchId);
    if (!batch || batch.settledAt !== null) return;
    const items = [...batch.keys].map((key) => this.items.get(key)).filter(Boolean) as EvidenceUploadItem[];
    if (!items.every((item) => item.batchId !== batchId || SETTLED_STATES.has(item.state))) return;
    batch.settledAt = this.now();
    const summary = this.summarize(batch);
    this.emit();
    for (const listener of this.batchListeners) {
      try {
        listener(summary);
      } catch (error) {
        this.logger.warn('[EVIDENCE-UPLOAD] batch listener failed', error);
      }
    }
  }

  private summarize(batch: Batch): EvidenceBatchSummary {
    const items = [...batch.keys]
      .map((key) => this.items.get(key))
      .filter((item): item is EvidenceUploadItem => Boolean(item) && item!.batchId === batch.batchId);
    const succeeded = items.filter((item) => item.state === 'SUCCESS').length;
    const failed = items.filter((item) => item.state === 'FAILED').length;
    return {
      batchId: batch.batchId,
      orderId: batch.orderId,
      stage: batch.stage,
      total: items.length,
      succeeded,
      failed,
      inFlight: items.length - succeeded - failed,
      settled: batch.settledAt !== null,
      startedAt: batch.startedAt,
      settledAt: batch.settledAt,
      durationMs: batch.settledAt !== null ? batch.settledAt - batch.startedAt : null,
      items: items.map((item) => ({
        slot: item.slot,
        state: item.state,
        via: item.via,
        originalBytes: item.originalBytes,
        optimizedBytes: item.optimizedBytes,
        autoRetries: item.autoRetries,
        timings: item.timings,
        error: item.error?.code ?? null,
        errorMessage: item.error?.message ?? null,
      })),
    };
  }

  private setProgress(job: Job, value: number) {
    const progress = Math.max(0, Math.min(95, Math.round(value)));
    const current = this.items.get(job.key);
    if (!current || current.progress === progress) return;
    this.patch(job, { progress });
  }

  private patchTimings(job: Job, timings: EvidenceUploadItem['timings']) {
    const current = this.items.get(job.key);
    if (!current) return;
    this.patch(job, { timings: { ...current.timings, ...timings } });
  }

  /** Updates the item only while `job` is still the live job for its key. */
  private patch(job: Job, patch: Partial<EvidenceUploadItem>) {
    if (this.jobs.get(job.key) !== job) return;
    const current = this.items.get(job.key);
    if (!current) return;
    this.setItem(job.key, { ...current, ...patch });
  }

  private setItem(key: string, item: EvidenceUploadItem) {
    const next = new Map(this.items);
    next.set(key, item);
    this.items = next;
    this.emit();
  }

  private emit() {
    this.snapshot = { version: this.snapshot.version + 1, items: this.items };
    for (const listener of this.listeners) listener();
  }
}
