export type RepairVisualizationStatus =
  | 'idle'
  | 'queued'
  | 'processing'
  | 'still_processing'
  | 'ready'
  | 'failed'
  | 'unavailable'
  | 'cancelled';

export interface RepairVisualizationProgress {
  status: RepairVisualizationStatus;
  taskId: string | null;
  beforeImageUrl: string | null;
  afterImageUrl: string | null;
  sourceView: string | null;
  sourceImageIndex: number | null;
  sourceDamageId: string | null;
  aiModel: string | null;
  configuredCreditsPerImage: number | null;
  consumedCredits: number | null;
  progress: number;
  precedingTasks: number | null;
  message: string;
}

export interface RepairSourceOption {
  imageIndex: number;
  viewId: string;
  label: string;
  previewUri: string;
  sourceDamageId: string | null;
  credibilityScore: number;
}

interface SourceDamage {
  id?: string;
  imageIndex?: number;
  severity?: 'high' | 'medium' | 'low';
  confidence?: number;
  affectedAreaPercent?: number;
}

interface SourceView {
  viewId?: string;
  label?: string;
  index?: number;
  success?: boolean;
}

interface RepairSourceScan {
  imageUrls?: string[];
  angles?: string[];
  damages?: SourceDamage[];
  views?: SourceView[];
}

const SEVERITY_SCORE = { high: 3, medium: 2, low: 1 } as const;
const REPAIR_SOURCE_VIEWS = new Set(['front', 'rear', 'left', 'right', 'close_up']);

const humanizeView = (value: string, index: number) => {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'close_up' || normalized === 'closeup') return 'Close-up';
  if (normalized === 'front') return 'Front';
  if (normalized === 'rear') return 'Rear';
  if (normalized === 'left') return 'Left';
  if (normalized === 'right') return 'Right';
  return value.trim() || `View ${index + 1}`;
};

const rankDamage = (damage: SourceDamage) => (
  (SEVERITY_SCORE[damage.severity || 'low'] * 1_000_000)
  + (Math.max(0, Math.min(1, Number(damage.confidence) || 0)) * 10_000)
  + Math.max(0, Math.min(100, Number(damage.affectedAreaPercent) || 0))
);

/**
 * Builds one selectable source per stored guided view. The default (index 0
 * after sorting) is the view containing the highest-ranked credible damage;
 * ties remain stable in guided-capture order.
 */
export const buildRepairSourceOptions = (
  scan: RepairSourceScan,
  localPreviewUris: readonly (string | null | undefined)[] = []
): RepairSourceOption[] => {
  const imageUrls = Array.isArray(scan.imageUrls) ? scan.imageUrls : [];
  const views = Array.isArray(scan.views) ? scan.views : [];
  const damages = Array.isArray(scan.damages) ? scan.damages : [];
  const imageCount = Math.max(imageUrls.length, localPreviewUris.length);

  return Array.from({ length: imageCount }, (_, imageIndex) => {
    const storedUri = String(imageUrls[imageIndex] || '').trim();
    const localUri = String(localPreviewUris[imageIndex] || '').trim();
    // A local capture keeps the selector available while the background
    // archive finishes. The client sends only its index/view/damage ID;
    // the backend still resolves and submits the scan-owned HTTPS URL.
    const previewUri = /^https:\/\//i.test(storedUri) ? storedUri : localUri;
    if (!/^(?:https|file|content|ph|assets-library):\/\//i.test(previewUri)) return null;
    const view = views.find((candidate) => Number(candidate.index) === imageIndex);
    if (view?.success === false) return null;

    const angle = String(view?.viewId || scan.angles?.[imageIndex] || '').trim();
    const normalizedAngle = angle.toLowerCase().replace(/[\s-]+/g, '_');
    if (!REPAIR_SOURCE_VIEWS.has(normalizedAngle)) return null;
    const label = String(view?.label || '').trim() || humanizeView(angle, imageIndex);
    const rankedDamages = damages
      .filter((damage) => Number(damage.imageIndex || 0) === imageIndex)
      .map((damage) => ({ damage, score: rankDamage(damage) }))
      .sort((left, right) => right.score - left.score);

    return {
      imageIndex,
      viewId: normalizedAngle,
      label,
      previewUri,
      sourceDamageId: rankedDamages[0]?.damage.id ? String(rankedDamages[0].damage.id) : null,
      credibilityScore: rankedDamages[0]?.score || 0,
    };
  })
    .filter((option): option is RepairSourceOption => option !== null)
    .sort((left, right) => right.credibilityScore - left.credibilityScore || left.imageIndex - right.imageIndex);
};

const repairPollGenerations = new Map<string, number>();

const beginRepairPoll = (scanId: string) => {
  const generation = (repairPollGenerations.get(scanId) || 0) + 1;
  repairPollGenerations.set(scanId, generation);
  return generation;
};

const waitDefault = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls the existing scan-owned repair task only. Transport failures are
 * retried; a local window expiry returns still_processing with the same task
 * ID; only the backend's Meshy-authoritative `failed` status is terminal.
 */
export const pollRepairVisualizationTask = async (
  scanId: string,
  fetchStatus: () => Promise<RepairVisualizationProgress>,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    seed?: RepairVisualizationProgress | null;
    onProgress?: (progress: RepairVisualizationProgress) => void;
    shouldCancel?: () => boolean;
    now?: () => number;
    wait?: (ms: number) => Promise<void>;
  } = {}
): Promise<RepairVisualizationProgress> => {
  const intervalMs = options.intervalMs ?? 4_000;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const now = options.now || Date.now;
  const wait = options.wait || waitDefault;
  const startedAt = now();
  const generation = beginRepairPoll(scanId);
  let last = options.seed || {
    status: 'queued' as const,
    taskId: null,
    beforeImageUrl: null,
    afterImageUrl: null,
    sourceView: null,
    sourceImageIndex: null,
    sourceDamageId: null,
    aiModel: null,
    configuredCreditsPerImage: null,
    consumedCredits: null,
    progress: 0,
    precedingTasks: null,
    message: 'Waiting in the queue…',
  };
  const cancelled = () => (
    repairPollGenerations.get(scanId) !== generation
    || options.shouldCancel?.() === true
  );

  while (now() - startedAt < timeoutMs) {
    if (cancelled()) return { ...last, status: 'cancelled' };
    try {
      const next = await fetchStatus();
      if (cancelled()) return { ...last, status: 'cancelled' };
      last = next;
      options.onProgress?.(next);
      if (next.status === 'ready' || next.status === 'failed' || next.status === 'unavailable') {
        return next;
      }
    } catch {
      // Temporary network failure: retain the same task and keep polling.
    }
    await wait(intervalMs);
  }

  if (cancelled()) return { ...last, status: 'cancelled' };
  return {
    ...last,
    status: 'still_processing',
    message: 'Repair visualization is still processing.',
  };
};
