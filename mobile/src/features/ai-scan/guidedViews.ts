/**
 * Guided vehicle inspection views.
 *
 * These are the angles the capture screen has always used, not a new
 * vocabulary: `GuidedViewId` is the existing `VehicleAngle` union, and the same
 * value travels to the backend as the view id, the angle hint, and the
 * per-damage `sourceView.id`.
 *
 * A guided view is a camera position, never a vehicle component. Capturing the
 * Front view does not mean the damage is on the front bumper.
 */

import type { AiScanInputImage } from '@/services/api/aiService';
import type { VehicleAngle } from './types';

export type GuidedViewId = VehicleAngle;

export type GuidedViewStatus =
  | 'pending'
  | 'ready'
  | 'analyzing'
  | 'complete'
  | 'failed'
  | 'retake_required';

export interface GuidedViewDefinition {
  id: GuidedViewId;
  label: string;
  hint: string;
  icon: 'car-sport-outline' | 'return-down-back-outline' | 'arrow-back-outline' | 'arrow-forward-outline' | 'contract-outline';
}

export const GUIDED_VIEWS: readonly GuidedViewDefinition[] = [
  { id: 'front', label: 'Front', hint: 'Full nose and hood', icon: 'car-sport-outline' },
  { id: 'rear', label: 'Rear', hint: 'Bumper and trunk', icon: 'return-down-back-outline' },
  { id: 'left', label: 'Left', hint: 'Driver-side panels', icon: 'arrow-back-outline' },
  { id: 'right', label: 'Right', hint: 'Passenger-side panels', icon: 'arrow-forward-outline' },
  { id: 'close_up', label: 'Close-up', hint: 'Visible damage zone', icon: 'contract-outline' },
] as const;

export const GUIDED_VIEW_IDS: readonly GuidedViewId[] = GUIDED_VIEWS.map((view) => view.id);

export const MAX_GUIDED_VIEWS = GUIDED_VIEWS.length;

/** At least one guided view is enough to run an inspection. */
export const MIN_GUIDED_VIEWS_TO_ANALYZE = 1;

const GUIDED_VIEW_LABELS: Record<string, string> = Object.fromEntries(
  GUIDED_VIEWS.map((view) => [view.id, view.label])
);

export const getGuidedViewLabel = (viewId: string): string =>
  GUIDED_VIEW_LABELS[viewId] || viewId || 'View';

export const isGuidedViewId = (value: string): value is GuidedViewId =>
  Object.prototype.hasOwnProperty.call(GUIDED_VIEW_LABELS, value);

/**
 * Default damage-area hint for a guided view. Lives here, next to the view
 * table, and is re-exported from `./utils` so existing importers are unchanged.
 * Keeping it free of Expo imports also keeps this module unit-testable.
 */
export const getDefaultDamageArea = (viewId: GuidedViewId): string => {
  switch (viewId) {
    case 'front':
      return 'Front Bumper';
    case 'rear':
      return 'Rear Bumper';
    case 'left':
      return 'Left Panel';
    case 'right':
      return 'Right Panel';
    default:
      return 'Panel';
  }
};

/* ── Capture set ───────────────────────────────────────────────────────────── */

export interface GuidedViewCapture {
  viewId: GuidedViewId;
  label: string;
  status: GuidedViewStatus;
  image: AiScanInputImage | null;
}

/** Each guided view is stored under its own key, never by array position. */
export type GuidedCaptureSet = Record<GuidedViewId, GuidedViewCapture>;

export const createGuidedCaptureSet = (): GuidedCaptureSet =>
  GUIDED_VIEWS.reduce((set, view) => {
    set[view.id] = { viewId: view.id, label: view.label, status: 'pending', image: null };
    return set;
  }, {} as GuidedCaptureSet);

/**
 * Attach (or replace) the image for one guided view. Every other view is left
 * exactly as it was, so retaking one bad angle never disturbs the rest.
 */
export const setGuidedViewImage = (
  set: GuidedCaptureSet,
  viewId: GuidedViewId,
  image: AiScanInputImage
): GuidedCaptureSet => {
  if (!set[viewId]) return set;
  return {
    ...set,
    [viewId]: {
      ...set[viewId],
      status: 'ready',
      image: { ...image, angle: viewId, selectedDamageArea: image.selectedDamageArea || getDefaultDamageArea(viewId) },
    },
  };
};

export const clearGuidedViewImage = (
  set: GuidedCaptureSet,
  viewId: GuidedViewId
): GuidedCaptureSet => {
  if (!set[viewId]) return set;
  return {
    ...set,
    [viewId]: { ...set[viewId], status: 'pending', image: null },
  };
};

/** Views that hold an image, always in the canonical GUIDED_VIEWS order. */
export const getReadyGuidedViews = (set: GuidedCaptureSet): GuidedViewCapture[] =>
  GUIDED_VIEWS
    .map((view) => set[view.id])
    .filter((entry): entry is GuidedViewCapture & { image: AiScanInputImage } =>
      Boolean(entry && entry.image));

export const countReadyGuidedViews = (set: GuidedCaptureSet): number =>
  getReadyGuidedViews(set).length;

export const canAnalyzeGuidedSet = (set: GuidedCaptureSet): boolean =>
  countReadyGuidedViews(set) >= MIN_GUIDED_VIEWS_TO_ANALYZE;

/**
 * The ordered image list submitted for analysis. This order defines every
 * `imageIndex` in the response, so the results screen can resolve each damage
 * back to the exact photo it came from.
 */
export const getGuidedSubmissionImages = (set: GuidedCaptureSet): AiScanInputImage[] =>
  getReadyGuidedViews(set).map((entry) => entry.image as AiScanInputImage);

export const getNextEmptyGuidedView = (set: GuidedCaptureSet): GuidedViewId | null =>
  GUIDED_VIEWS.find((view) => !set[view.id]?.image)?.id ?? null;

/* ── Live progress ─────────────────────────────────────────────────────────── */

export interface GuidedViewProgress {
  viewId: GuidedViewId;
  label: string;
  status: GuidedViewStatus;
  message: string;
}

const PROGRESS_STATUS_LABELS: Record<GuidedViewStatus, string> = {
  pending: 'Waiting',
  ready: 'Ready',
  analyzing: 'Analyzing',
  complete: 'Complete',
  failed: 'Retake required',
  retake_required: 'Retake required',
};

export const getGuidedViewStatusLabel = (status: GuidedViewStatus): string =>
  PROGRESS_STATUS_LABELS[status] || 'Waiting';

/**
 * Progress rows for the views actually being submitted, in submission order.
 * Position in this array is the imageIndex, so it is not duplicated as a field.
 */
export const createGuidedViewProgress = (
  images: Pick<AiScanInputImage, 'angle'>[]
): GuidedViewProgress[] =>
  images.map((image) => {
    const viewId: GuidedViewId =
      image.angle && isGuidedViewId(image.angle) ? image.angle : 'close_up';
    return {
      viewId,
      label: getGuidedViewLabel(viewId),
      status: 'ready',
      message: '',
    };
  });

export const markGuidedViewsAnalyzing = (
  progress: GuidedViewProgress[]
): GuidedViewProgress[] =>
  progress.map((row) => ({ ...row, status: 'analyzing', message: '' }));

export const markGuidedViewsFailed = (
  progress: GuidedViewProgress[],
  message: string
): GuidedViewProgress[] =>
  progress.map((row) =>
    row.status === 'analyzing' || row.status === 'ready'
      ? { ...row, status: 'failed', message }
      : row);

/**
 * Resolve every row strictly from analysis results. A view is only marked
 * complete once its own result exists — no timer and no optimistic guess.
 */
export const resolveGuidedViewProgress = (
  progress: GuidedViewProgress[],
  results: { viewId: string; success: boolean; message?: string }[]
): GuidedViewProgress[] => {
  const byViewId = new Map(results.map((result) => [result.viewId, result]));
  return progress.map((row) => {
    const result = byViewId.get(row.viewId);
    if (!result) return row;
    return {
      ...row,
      status: result.success ? 'complete' : 'retake_required',
      message: result.success ? '' : String(result.message || ''),
    };
  });
};

export const countCompletedGuidedViews = (progress: GuidedViewProgress[]): number =>
  progress.filter((row) => row.status === 'complete').length;
