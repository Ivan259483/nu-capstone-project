import { useState, useEffect, useCallback, useRef } from 'react';
import { getSharedSocket } from './useRealtimeSync';
import api from '@/lib/api';
import { toast } from 'sonner';
import { compressImageForTrackerUpload } from '@/lib/compress-image-for-upload';
import { isGatePhotoStage, normalizeStaffGateSlot } from '@/lib/tracker-gate-photo-slots';

// ── Types ─────────────────────────────────────────────────────────────────────

export type QCTrackerStageMedia = {
  stage: string;
  slot?: string;
  photoUrl?: string;
  description?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  hasPhoto?: boolean;
};

export type QCStagePhotoUploadResult = {
  success: boolean;
  photoUrl?: string;
  trackerStageMedia?: QCTrackerStageMedia[];
  savedMedia?: QCTrackerStageMedia;
};

export interface QCJob {
  id: string;
  jobId: string;
  orderStatus?: string;
  paymentStatus?: string;
  invoiceId?: string | null;
  customer: string;
  /** Display name from order detail / API when different from `customer` */
  customerName?: string;
  vehicle: string;
  make: string;
  plate: string;
  service: string;
  serviceType: string;
  technician: string;
  technicianId?: string;
  submittedAt: string;
  elapsed: string;
  elapsedMinutes: number;
  status: 'pending-review' | 'in-review' | 'approved' | 'needs-fix' | 'resubmitted';
  aiFlag: boolean;
  priority: string;
  photos?: { before: string[]; after: string[] };
  trackerStageMedia?: QCTrackerStageMedia[];
  staffNotes?: { content: string; detailerName: string; createdAt: string }[];
  qcChecklist?: { item: string; passed: boolean; note?: string }[];
  damageAnnotations?: unknown[];
  notes?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  technicianNotes?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerNotes?: string;
  bookingDate?: string;
  bookingTime?: string;
  /** Hint from order warranty block — same lineage as customer vehicle / booking data */
  existingFwsAndShade?: string;
  qcHandoffSheet?: {
    clientName?: string;
    serviceDate?: string;
    makeModel?: string;
    plateNo?: string;
    tintShadeInstalled?: string;
    installer?: string;
  };
}

export interface QCStats {
  awaiting: number;
  approvedToday: number;
  returned: number;
  /** Orders QC approved (qcCompletedAt set) — lifetime, for reports */
  qcApprovedLifetime?: number;
  /** Distinct orders with a QC outcome (approved and/or returned) */
  totalQCReviewed?: number;
  qcApprovalRatePct?: number;
  qcReturnRatePct?: number;
  aiPending: number;
  avgReviewTime: string;
  trendData: { date: string; approved: number; returned: number }[];
  serviceDistribution: { name: string; value: number }[];
}

export interface QCActivityItem {
  id: string;
  jobId: string;
  type: 'approved' | 'returned';
  customer: string;
  vehicle: string;
  service: string;
  actor: string;
  timestamp: string;
  note: string | null;
}

export interface QCTechnicianStat {
  name: string;
  approved: number;
  returned: number;
  rate: number;
}

const QC_JOBS_LIMIT = 20;
const QC_JOBS_REQUEST_KEY = `qc-jobs:page=1&limit=${QC_JOBS_LIMIT}`;
const QC_JOBS_SNAPSHOT_STORAGE_KEY = 'autospf_qc_jobs_snapshot_v1';
const QC_JOBS_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;
const SUMMARY_POLL_INTERVAL_MS = 60_000;
const SOCKET_JOBS_DEBOUNCE_MS = 350;
const REQUEST_DEDUPE_MS = 5_000;
/** After stage-photo upload, skip socket-driven /qc/jobs refetch to avoid modal remount/flicker. */
let qcSocketJobsRefetchPausedUntil = 0;

function pauseQcSocketJobsRefetch(ms = 4500) {
  qcSocketJobsRefetchPausedUntil = Math.max(qcSocketJobsRefetchPausedUntil, Date.now() + ms);
}

/** Pause socket/list refetch while the file picker or upload is active (Live Tracker). */
export function pauseQcJobsRefetchForUpload(ms = 15_000) {
  pauseQcSocketJobsRefetch(ms);
}

type CacheEntry<T> = {
  data?: T;
  inFlight?: Promise<T>;
  updatedAt: number;
};

const qcRequestCache = new Map<string, CacheEntry<any>>();
let lastKnownNonEmptyQcJobs: QCJob[] = [];

function invalidateQcJobsRequestCache() {
  qcRequestCache.delete(QC_JOBS_REQUEST_KEY);
}

function normalizeQcTrackerMediaEntry(entry: any): QCTrackerStageMedia | null {
  const stage = String(entry?.stage || '').trim();
  if (!stage) return null;

  const rawPhotoUrl = String(entry?.photoUrl || '').trim();
  const photoUrl = rawPhotoUrl && !rawPhotoUrl.startsWith('data:') ? rawPhotoUrl : undefined;
  const slot = String(entry?.slot || '').trim() || undefined;

  return {
    stage,
    ...(slot ? { slot } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(typeof entry?.description === 'string' && entry.description.trim()
      ? { description: entry.description.trim() }
      : {}),
    ...(entry?.uploadedAt ? { uploadedAt: String(entry.uploadedAt) } : {}),
    ...(entry?.uploadedBy ? { uploadedBy: String(entry.uploadedBy) } : {}),
    hasPhoto: Boolean(entry?.hasPhoto || rawPhotoUrl || stage !== 'confirmed'),
  };
}

function normalizeQcTrackerMediaList(media: unknown): QCTrackerStageMedia[] {
  if (!Array.isArray(media)) return [];
  return media
    .map(normalizeQcTrackerMediaEntry)
    .filter((entry): entry is QCTrackerStageMedia => Boolean(entry));
}

function trackerMediaMatches(
  media: QCTrackerStageMedia,
  stage: string,
  slot?: string
): boolean {
  if (media.stage !== stage) return false;
  if (!slot) return !media.slot;
  return normalizeStaffGateSlot(media.slot, media.stage) === normalizeStaffGateSlot(slot, stage);
}

function findSavedTrackerMedia(
  media: QCTrackerStageMedia[],
  stage: string,
  slot?: string
): QCTrackerStageMedia | undefined {
  return [...media].reverse().find((entry) => trackerMediaMatches(entry, stage, slot));
}

function upsertTrackerMediaList(
  current: QCTrackerStageMedia[],
  incoming: QCTrackerStageMedia
): QCTrackerStageMedia[] {
  return [
    ...current.filter((entry) => !trackerMediaMatches(entry, incoming.stage, incoming.slot)),
    incoming,
  ];
}

function readPersistedQcJobsSnapshot(): QCJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(QC_JOBS_SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { savedAt?: number; jobs?: QCJob[] };
    if (!Array.isArray(parsed.jobs) || parsed.jobs.length === 0) return [];
    if (!parsed.savedAt || Date.now() - parsed.savedAt > QC_JOBS_SNAPSHOT_MAX_AGE_MS) {
      sessionStorage.removeItem(QC_JOBS_SNAPSHOT_STORAGE_KEY);
      return [];
    }
    return parsed.jobs;
  } catch {
    return [];
  }
}

function writePersistedQcJobsSnapshot(jobs: QCJob[]) {
  if (typeof window === 'undefined' || jobs.length === 0) return;
  try {
    sessionStorage.setItem(
      QC_JOBS_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), jobs: jobs.slice(0, QC_JOBS_LIMIT) })
    );
  } catch {
    // Storage can be unavailable in private mode or when quota is exceeded.
  }
}

function clearPersistedQcJobsSnapshot() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(QC_JOBS_SNAPSHOT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function getCachedQcJobs(): QCJob[] {
  const cached = qcRequestCache.get(QC_JOBS_REQUEST_KEY)?.data;
  return Array.isArray(cached) ? cached : [];
}

function rememberNonEmptyQcJobs(jobs: QCJob[]) {
  if (Array.isArray(jobs) && jobs.length > 0) {
    lastKnownNonEmptyQcJobs = jobs;
    writePersistedQcJobsSnapshot(jobs);
  }
}

function getInitialQcJobsSnapshot(): QCJob[] {
  const cached = getCachedQcJobs();
  if (cached.length > 0) return cached;
  if (lastKnownNonEmptyQcJobs.length > 0) return lastKnownNonEmptyQcJobs;
  const persisted = readPersistedQcJobsSnapshot();
  if (persisted.length > 0) {
    lastKnownNonEmptyQcJobs = persisted;
    return persisted;
  }
  return [];
}

const isCanceledRequest = (err: any) =>
  err?.code === 'ERR_CANCELED' ||
  err?.name === 'CanceledError' ||
  err?.message === 'canceled';

type QcChecklistItem = { item: string; passed: boolean; note?: string };

/** Coalesce auto-saves from Live Tracker checklist toggles to avoid 429 rate limits. */
const checklistSaveQueues = new Map<
  string,
  {
    inFlight: Promise<boolean> | null;
    pending: { id: string; items: QcChecklistItem[]; opts?: { quiet?: boolean } } | null;
    lastKey: string;
  }
>();

let checklistQuietRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function qcChecklistPayloadKey(items: QcChecklistItem[]): string {
  return items.map((i) => `${i.item}:${i.passed ? 1 : 0}`).join('|');
}

function scheduleQuietChecklistJobsRefresh(fetchJobs: (silent?: boolean) => Promise<void>) {
  if (checklistQuietRefreshTimer) clearTimeout(checklistQuietRefreshTimer);
  checklistQuietRefreshTimer = setTimeout(() => {
    checklistQuietRefreshTimer = null;
    invalidateQcJobsRequestCache();
    void fetchJobs(true);
  }, 2500);
}

async function patchQcChecklist(
  id: string,
  items: QcChecklistItem[],
  quiet: boolean
): Promise<void> {
  const maxAttempts = quiet ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await api.patch(`/qc/jobs/${id}/checklist`, { items });
      return;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429 && quiet && attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function runCoalescedChecklistSave(
  id: string,
  items: QcChecklistItem[],
  opts: { quiet?: boolean } | undefined,
  fetchJobs: (silent?: boolean) => Promise<void>
): Promise<boolean> {
  const quiet = Boolean(opts?.quiet);
  const payloadKey = qcChecklistPayloadKey(items);
  let queue = checklistSaveQueues.get(id);
  if (!queue) {
    queue = { inFlight: null, pending: null, lastKey: '' };
    checklistSaveQueues.set(id, queue);
  }

  if (queue.inFlight) {
    queue.pending = { id, items, opts };
    return queue.inFlight;
  }

  if (quiet && queue.lastKey === payloadKey) {
    return true;
  }

  const execute = async (): Promise<boolean> => {
    try {
      await patchQcChecklist(id, items, quiet);

      queue!.lastKey = payloadKey;
      if (!quiet) {
        toast.success('Checklist saved');
        invalidateQcJobsRequestCache();
        void fetchJobs(true);
      } else {
        scheduleQuietChecklistJobsRefresh(fetchJobs);
      }
      return true;
    } catch (err: any) {
      if (!quiet) {
        toast.error('Failed to save checklist');
      }
      return false;
    } finally {
      queue!.inFlight = null;
      const pending = queue!.pending;
      queue!.pending = null;
      if (pending) {
        return runCoalescedChecklistSave(pending.id, pending.items, pending.opts, fetchJobs);
      }
    }
  };

  queue.inFlight = execute();
  return queue.inFlight;
}

const dedupedRequest = async <T,>(key: string, request: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const cached = qcRequestCache.get(key);
  if (cached?.inFlight) return cached.inFlight;
  if (cached && cached.data !== undefined && now - cached.updatedAt < REQUEST_DEDUPE_MS) {
    return cached.data;
  }

  const inFlight = request()
    .then((data) => {
      qcRequestCache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .finally(() => {
      const latest = qcRequestCache.get(key);
      if (latest?.inFlight === inFlight) {
        qcRequestCache.set(key, { data: latest.data, updatedAt: latest.updatedAt });
      }
    });

  qcRequestCache.set(key, { data: cached?.data, inFlight, updatedAt: cached?.updatedAt ?? 0 });
  return inFlight;
};

type UseQCDataOptions = {
  loadSummary?: boolean;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useQCData({ loadSummary = true }: UseQCDataOptions = {}) {
  const initialJobsRef = useRef<QCJob[] | null>(null);
  if (initialJobsRef.current === null) {
    initialJobsRef.current = getInitialQcJobsSnapshot();
  }

  const [jobs, setJobs] = useState<QCJob[]>(() => initialJobsRef.current ?? []);
  const [jobsLoading, setJobsLoading] = useState(() => (initialJobsRef.current?.length ?? 0) === 0);
  const [stats, setStats] = useState<QCStats>({
    awaiting: 0,
    approvedToday: 0,
    returned: 0,
    qcApprovedLifetime: 0,
    totalQCReviewed: 0,
    qcApprovalRatePct: 0,
    qcReturnRatePct: 0,
    aiPending: 0,
    avgReviewTime: '—',
    trendData: [],
    serviceDistribution: [],
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [activity, setActivity] = useState<QCActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [technicianData, setTechnicianData] = useState<QCTechnicianStat[]>([]);
  const [techLoading, setTechLoading] = useState(true);

  const summaryPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobsRef = useRef<QCJob[]>(jobs);
  const mediaSocketPatchedUntilRef = useRef(new Map<string, number>());
  /** After first successful /qc/jobs response, never toggle jobsLoading again (silent refetches only). */
  const qcJobsHydratedRef = useRef((initialJobsRef.current?.length ?? 0) > 0);

  const patchJobTrackerMedia = useCallback(
    (
      orderId: string,
      media: QCTrackerStageMedia[],
      payload?: {
        status?: string;
        serviceTrackingStage?: string | null;
        paymentStatus?: string | null;
        invoiceId?: string | null;
        updatedAt?: string;
      }
    ) => {
      if (!orderId || media.length === 0) return;

      setJobs((current) => {
        let changed = false;
        const next = current.map((job) => {
          if (String(job.id) !== orderId) return job;
          changed = true;
          return {
            ...job,
            trackerStageMedia: media,
            ...(payload?.status !== undefined ? { orderStatus: payload.status } : {}),
            ...(payload?.serviceTrackingStage !== undefined
              ? { serviceTrackingStage: payload.serviceTrackingStage }
              : {}),
            ...(payload?.paymentStatus !== undefined ? { paymentStatus: payload.paymentStatus || undefined } : {}),
            ...(payload?.invoiceId !== undefined ? { invoiceId: payload.invoiceId } : {}),
            ...(payload?.updatedAt ? { serviceTrackingUpdatedAt: payload.updatedAt } : {}),
          } as QCJob;
        });

        if (!changed) return current;
        jobsRef.current = next;
        rememberNonEmptyQcJobs(next);
        qcRequestCache.set(QC_JOBS_REQUEST_KEY, {
          data: next,
          updatedAt: Date.now(),
        });
        return next;
      });
    },
    []
  );

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async (silent = false) => {
    const blockingUi = !silent && !qcJobsHydratedRef.current;
    const shouldResolveInitialLoading = !qcJobsHydratedRef.current;
    if (blockingUi) setJobsLoading(true);

    try {
      const nextJobs = await dedupedRequest<QCJob[]>(QC_JOBS_REQUEST_KEY, async () => {
        const res = await api.get('/qc/jobs', {
          params: { page: 1, limit: QC_JOBS_LIMIT },
          meta: { suppressErrorToast: true, suppressCancelLog: true },
        } as any);
        return res.data?.success ? (res.data.jobs ?? res.data.data ?? []) : [];
      });

      if (nextJobs.length > 0) {
        rememberNonEmptyQcJobs(nextJobs);
        jobsRef.current = nextJobs;
        setJobs(nextJobs);
      } else if (silent && jobsRef.current.length > 0) {
        // Silent upload/socket refreshes can transiently return empty while the backend settles.
        // Keep the current live lane visible until a non-silent fetch confirms true emptiness.
      } else {
        lastKnownNonEmptyQcJobs = [];
        clearPersistedQcJobsSnapshot();
        jobsRef.current = [];
        setJobs([]);
      }
      qcJobsHydratedRef.current = true;
    } catch (err: any) {
      if (isCanceledRequest(err)) return;
      if (!silent) console.error('[QC] Failed to fetch jobs:', err.message);
    } finally {
      if (blockingUi || shouldResolveInitialLoading) {
        setJobsLoading(false);
      }
    }
  }, []);

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setStatsLoading(true);
    try {
      const data = await dedupedRequest<QCStats | undefined>('qc-stats', async () => {
        const res = await api.get('/qc/dashboard/stats');
        return res.data?.success ? res.data.data : undefined;
      });
      if (data) setStats(data);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch stats:', err.message);
    } finally {
      if (!silent) setStatsLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async (silent = false) => {
    if (!silent) setActivityLoading(true);
    try {
      const data = await dedupedRequest<QCActivityItem[]>('qc-activity:limit=15', async () => {
        const res = await api.get('/qc/activity?limit=15');
        return res.data?.success ? (res.data.data ?? []) : [];
      });
      setActivity(data);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch activity:', err.message);
    } finally {
      if (!silent) setActivityLoading(false);
    }
  }, []);

  const fetchTechnicianData = useCallback(async (silent = false) => {
    if (!silent) setTechLoading(true);
    try {
      const data = await dedupedRequest<QCTechnicianStat[]>('qc-technicians', async () => {
        const res = await api.get('/qc/reports/technicians');
        return res.data?.success ? (res.data.data ?? []) : [];
      });
      setTechnicianData(data);
    } catch (err: any) {
      if (!silent) console.error('[QC] Failed to fetch technician report:', err.message);
    } finally {
      if (!silent) setTechLoading(false);
    }
  }, []);

  const refetchAll = useCallback(async (silent = false) => {
    await Promise.all([
      fetchJobs(silent),
      fetchStats(silent),
      fetchActivity(silent),
      fetchTechnicianData(silent),
    ]);
  }, [fetchJobs, fetchStats, fetchActivity, fetchTechnicianData]);

  const refetchSummary = useCallback(async (silent = false) => {
    await Promise.all([
      fetchStats(silent),
      fetchActivity(silent),
      fetchTechnicianData(silent),
    ]);
  }, [fetchStats, fetchActivity, fetchTechnicianData]);

  const resetSummaryPoll = useCallback(() => {
    if (summaryPollRef.current) clearInterval(summaryPollRef.current);
    summaryPollRef.current = setInterval(() => {
      refetchSummary(true);
    }, SUMMARY_POLL_INTERVAL_MS);
  }, [refetchSummary]);

  // ── Initial load + polling ───────────────────────────────────────────────────

  useEffect(() => {
    fetchJobs(false);
  }, [fetchJobs]);

  useEffect(() => {
    if (!loadSummary) {
      if (summaryPollRef.current) {
        clearInterval(summaryPollRef.current);
        summaryPollRef.current = null;
      }
      return;
    }

    refetchSummary(false);
    resetSummaryPoll();

    return () => {
      if (summaryPollRef.current) clearInterval(summaryPollRef.current);
    };
  }, [loadSummary, refetchSummary, resetSummaryPoll]);

  // ── Shared socket listener ───────────────────────────────────────────────────
  // Uses the app-wide singleton socket (getSharedSocket) — no new io() connection.
  // Fires a jobs-only refetch whenever MongoDB reports an orders change.

  useEffect(() => {
    const socket = getSharedSocket();
    /** Coalesce db_change + orderUpdated bursts into one jobs refresh. */
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSocketRefetch = () => {
      if (Date.now() < qcSocketJobsRefetchPausedUntil) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (Date.now() < qcSocketJobsRefetchPausedUntil) return;
        fetchJobs(true);
      }, SOCKET_JOBS_DEBOUNCE_MS);
    };

    // db_change fires from MongoDB Change Streams via the backend
    const handleDbChange = (payload: any) => {
      if (payload.collection !== 'orders') return;
      const orderId = String(payload.fullDocument?._id || payload.documentKey?._id || '').trim();
      const patchedUntil = orderId ? mediaSocketPatchedUntilRef.current.get(orderId) || 0 : 0;
      if (patchedUntil > Date.now()) {
        mediaSocketPatchedUntilRef.current.delete(orderId);
        return;
      }
      scheduleSocketRefetch();
    };
    const handleOrderUpdated = (payload: any) => {
      const orderId = String(payload?.orderId || payload?.id || payload?._id || '').trim();
      const media = normalizeQcTrackerMediaList(payload?.trackerStageMedia);
      if (orderId && media.length > 0) {
        console.log('[QC Upload Debug] useQCData targeted trackerStageMedia socket patch', {
          orderId,
          mediaCount: media.length,
          status: payload?.status,
          serviceTrackingStage: payload?.serviceTrackingStage,
        });
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        mediaSocketPatchedUntilRef.current.set(orderId, Date.now() + 5000);
        patchJobTrackerMedia(orderId, media, payload);
        return;
      }
      scheduleSocketRefetch();
    };
    socket.on('db_change', handleDbChange);
    // Legacy event name used by some controllers
    socket.on('orderUpdated', handleOrderUpdated);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      socket.off('db_change', handleDbChange);
      socket.off('orderUpdated', handleOrderUpdated);
    };
  }, [fetchJobs, patchJobTrackerMedia]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const approveJob = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/approve`);
      toast.success('Job approved', { description: 'The job has been marked as completed.' });
      await Promise.all([fetchJobs(true), fetchStats(true), fetchActivity(true)]);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to approve job';
      toast.error('Approval failed', { description: msg });
      return false;
    }
  }, [fetchJobs, fetchStats, fetchActivity]);

  const returnJob = useCallback(async (id: string, reason: string): Promise<boolean> => {
    if (!reason?.trim()) {
      toast.error('A return reason is required');
      return false;
    }
    try {
      await api.patch(`/qc/jobs/${id}/return`, { reason });
      toast.success('Job returned', { description: 'The job has been sent back to the technician.' });
      await Promise.all([fetchJobs(true), fetchStats(true), fetchActivity(true)]);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to return job';
      toast.error('Return failed', { description: msg });
      return false;
    }
  }, [fetchJobs, fetchStats, fetchActivity]);

  const updateChecklist = useCallback(
    async (id: string, items: QcChecklistItem[], opts?: { quiet?: boolean }): Promise<boolean> => {
      return runCoalescedChecklistSave(id, items, opts, fetchJobs);
    },
    [fetchJobs]
  );

  const updateServiceStatus = useCallback(async (id: string, stage: string): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/service-status`, { stage });
      toast.success('Stage updated', { description: `Service stage advanced to: ${stage.replace(/_/g, ' ')}` });
      // Live tracker only needs job rows — avoids 4 parallel GETs and browser “busy” feel.
      await fetchJobs(true);
      return true;
    } catch (err: any) {
      const data = err?.response?.data;
      const msg = data?.message || 'Failed to update service stage';
      const extra =
        typeof data?.uploaded === 'number' && typeof data?.required === 'number'
          ? ` (${data.uploaded}/${data.required} photos)`
          : '';
      const desc = data?.error ? `${data.error}${extra}` : `${msg}${extra}`;
      toast.error('Stage update failed', { description: desc });
      return false;
    }
  }, [fetchJobs]);

  const uploadTrackerStagePhoto = useCallback(
    async (
      orderId: string,
      payload: { stage: string; slot?: string; description?: string; file?: File | null },
      _opts?: { skipJobsRefresh?: boolean }
    ): Promise<QCStagePhotoUploadResult> => {
      console.log('[QC Upload Debug] Stage photo upload starts', {
        orderId,
        stage: payload.stage,
        slot: payload.slot,
        hasFile: Boolean(payload.file),
      });
      pauseQcSocketJobsRefetch(15_000);
      try {
        if (payload.file) {
          if (isGatePhotoStage(payload.stage) && !payload.slot) {
            toast.error('Missing photo slot');
            return { success: false };
          }

          let file = payload.file;
          try {
            file = await compressImageForTrackerUpload(file);
          } catch {}

          const form = new FormData();
          form.append('stage', payload.stage);
          if (payload.slot) form.append('slot', payload.slot);
          form.append('fastInline', '1');
          if (payload.description?.trim()) form.append('description', payload.description.trim());
          form.append('photo', file);

          const postRes = await api.post(`/orders/${orderId}/stage-photo`, form, {
            timeout: 120_000,
            headers: { 'Content-Type': undefined },
            meta: { suppressErrorToast: true },
          } as any);
          const postData = postRes?.data?.data;
          let trackerStageMedia = normalizeQcTrackerMediaList(postData?.trackerStageMedia);
          let savedMedia = findSavedTrackerMedia(trackerStageMedia, payload.stage, payload.slot);

          if (!savedMedia) {
            try {
              const reconcileRes = await api.get(`/orders/${orderId}/tracker-media`, {
                meta: { suppressErrorToast: true, suppressExpectedErrorLog: true },
              } as any);
              trackerStageMedia = normalizeQcTrackerMediaList(reconcileRes?.data?.data?.trackerStageMedia);
              savedMedia = findSavedTrackerMedia(trackerStageMedia, payload.stage, payload.slot);
            } catch {
              // The upload itself succeeded. Socket delivery remains the final reconciliation fallback.
            }
          }

          if (trackerStageMedia.length > 0) {
            patchJobTrackerMedia(orderId, trackerStageMedia);
          } else if (savedMedia) {
            const currentJob = jobsRef.current.find((job) => String(job.id) === String(orderId));
            const nextMedia = upsertTrackerMediaList(currentJob?.trackerStageMedia || [], savedMedia);
            patchJobTrackerMedia(orderId, nextMedia);
            trackerStageMedia = nextMedia;
          }

          console.log('[QC Upload Debug] Stage photo upload succeeds', {
            orderId,
            stage: payload.stage,
            slot: payload.slot,
            photoUrl: savedMedia?.photoUrl || postData?.photoUrl,
            savedMedia,
            mediaCount: trackerStageMedia.length,
          });
          toast.success('Stage photo saved', {
            description: 'Shown on the customer live tracker.',
          });
          return {
            success: true,
            photoUrl: savedMedia?.photoUrl,
            trackerStageMedia,
            savedMedia,
          };
        } else if (payload.stage === 'confirmed' && payload.description?.trim()) {
          await api.patch(
            `/orders/${orderId}/stage-photo`,
            {
              stage: 'confirmed',
              description: payload.description.trim(),
            },
            { meta: { suppressErrorToast: true } } as any
          );
        } else {
          toast.error(
            payload.stage === 'confirmed'
              ? 'Add a customer note or choose a photo'
              : 'Please choose an image file'
          );
          return { success: false };
        }
        console.log('[QC Upload Debug] Stage photo upload succeeds', {
          orderId,
          stage: payload.stage,
          slot: payload.slot,
          photoUrl: undefined,
          savedMedia: undefined,
          mediaCount: undefined,
        });
        toast.success('Stage photo saved', {
          description: 'Shown on the customer live tracker.',
        });
        return { success: true };
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Upload failed';
        toast.error('Stage photo upload failed', { description: msg });
        return { success: false };
      }
    },
    [patchJobTrackerMedia]
  );

  const deleteTrackerStagePhoto = useCallback(
    async (
      orderId: string,
      payload: { stage: string; slot: string },
      opts?: { skipJobsRefresh?: boolean }
    ): Promise<boolean> => {
      try {
        await api.delete(`/orders/${orderId}/stage-photo`, {
          params: { stage: payload.stage, slot: payload.slot },
          meta: { suppressErrorToast: true },
        } as any);
        toast.success('Photo removed');
        if (!opts?.skipJobsRefresh) {
          invalidateQcJobsRequestCache();
          void fetchJobs(true);
        }
        return true;
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Remove failed';
        toast.error('Could not remove photo', { description: msg });
        return false;
      }
    },
    [fetchJobs]
  );

  const addStaffNote = useCallback(async (orderId: string, content: string): Promise<boolean> => {
    const trimmed = content?.trim();
    if (!trimmed) {
      toast.error('Please enter an update message');
      return false;
    }
    try {
      await api.patch(`/orders/${orderId}/notes`, { content: trimmed });
      toast.success('Service update added', { description: 'Visible in the activity feed.' });
      await fetchJobs(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to add update';
      toast.error('Update failed', { description: msg });
      return false;
    }
  }, [fetchJobs]);

  const assignServiceStaff = useCallback(async (
    id: string,
    assignments: { slot: string; name: string; role: string }[]
  ): Promise<boolean> => {
    try {
      await api.patch(`/qc/jobs/${id}/assign-staff`, { assignments });
      toast.success('Staff assigned', { description: 'Service team updated successfully.' });
      await fetchJobs(true);
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to assign staff';
      toast.error('Assignment failed', { description: msg });
      return false;
    }
  }, [fetchJobs]);

  const saveQCHandoffSheet = useCallback(
    async (
      id: string,
      payload: {
        clientName?: string;
        serviceDate?: string;
        makeModel?: string;
        plateNo?: string;
        tintShadeInstalled?: string;
        installer?: string;
      }
    ): Promise<boolean> => {
      try {
        await api.patch(`/qc/jobs/${id}/handoff-sheet`, payload);
        invalidateQcJobsRequestCache();
        void fetchJobs(true);
        return true;
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Save failed';
        toast.error('Could not save handoff details', { description: msg });
        return false;
      }
    },
    [fetchJobs]
  );

  return {
    jobs,
    jobsLoading,
    stats,
    statsLoading,
    activity,
    activityLoading,
    technicianData,
    techLoading,
    refetchJobs: () => fetchJobs(false),
    refetchStats: async () => {
      await fetchStats(false);
      resetSummaryPoll();
    },
    refetchAll: async () => {
      await refetchAll(false);
      resetSummaryPoll();
    },
    approveJob,
    returnJob,
    updateChecklist,
    updateServiceStatus,
    uploadTrackerStagePhoto,
    deleteTrackerStagePhoto,
    assignServiceStaff,
    saveQCHandoffSheet,
    addStaffNote,
  };
}
