/**
 * Presentation logic for the Multi-View Vehicle Inspection report.
 *
 * Every count here is a DETECTED REGION count, never a unique-damage count.
 * The same physical scratch photographed from two angles legitimately produces
 * two regions, and the app holds no evidence that would let it claim otherwise.
 */

import type { AiScanDamage, AiScanResult, AiScanViewResult } from '@/services/api/aiService';

export const VIEW_ANALYSIS_FAILED_MESSAGE =
  'This view could not be analyzed. Please retake or upload it again.';

export const MULTI_VIEW_ZERO_DETECTION_MESSAGE =
  'No confident damage was detected across the analyzed vehicle views.';

export const MULTI_VIEW_PARTIAL_FAILURE_MESSAGE =
  'Some views could not be analyzed and were not confirmed clean.';

export const VIEW_ZERO_DETECTION_MESSAGE = 'No confident damage detected in this view.';

export interface MultiViewSummary {
  requestedViews: number;
  analyzedViews: number;
  successfulViews: number;
  failedViews: number;
  viewsWithDamage: number;
  /** Regions across views. NOT a unique-damage count. */
  totalDetectedRegions: number;
}

export interface MultiViewViewResult {
  viewId: string;
  label: string;
  index: number;
  success: boolean;
  errorCode: string;
  message: string;
  noDamageDetected: boolean;
  detectedRegions: number;
}

export interface MultiViewInspection {
  inspectionId: string;
  summary: MultiViewSummary;
  views: MultiViewViewResult[];
  deduplicationApplied: boolean;
}

const toCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/**
 * A live batch response carries `damages` per view; a scan rehydrated from
 * GET /api/ai/scan/:id carries the persisted `detectedRegions` count instead.
 * Both are accepted.
 */
type RawInspectionView = Partial<AiScanViewResult> & { detectedRegions?: number };

export interface MultiViewInspectionSource {
  inspectionId?: string;
  inspectionSummary?: AiScanResult['inspectionSummary'];
  views?: RawInspectionView[];
  crossViewDeduplication?: AiScanResult['crossViewDeduplication'];
}

/**
 * Build the inspection view of a scan result. Returns null for a single-image
 * scan so the existing single-scan UI stays exactly as it is.
 */
export const normalizeMultiViewInspection = (
  scan: MultiViewInspectionSource | null | undefined
): MultiViewInspection | null => {
  if (!scan) return null;
  const rawViews = Array.isArray(scan.views) ? scan.views : [];
  if (rawViews.length === 0) return null;

  const views: MultiViewViewResult[] = rawViews.map((view, index) => {
    const viewId = String(view?.viewId || '');
    const success = view?.success !== false;
    const detectedRegions = Array.isArray(view?.damages)
      ? view.damages.length
      : toCount(view?.detectedRegions);
    return {
      viewId,
      // The server always supplies a label; the id is a last-resort fallback.
      label: String(view?.label || viewId),
      index: Number.isFinite(Number(view?.index)) ? Number(view?.index) : index,
      success,
      errorCode: String(view?.errorCode || ''),
      // Never surface an upstream provider message to a customer.
      message: success ? '' : VIEW_ANALYSIS_FAILED_MESSAGE,
      noDamageDetected: success && detectedRegions === 0,
      detectedRegions: success ? detectedRegions : 0,
    };
  });

  const successfulViews = views.filter((view) => view.success);
  const raw = scan.inspectionSummary;

  return {
    inspectionId: String(scan.inspectionId || ''),
    // Recomputed from the view list rather than trusted wholesale, so the
    // counts the customer reads can never contradict the rows beneath them.
    summary: {
      requestedViews: views.length,
      analyzedViews: successfulViews.length,
      successfulViews: successfulViews.length,
      failedViews: views.length - successfulViews.length,
      viewsWithDamage: successfulViews.filter((view) => view.detectedRegions > 0).length,
      totalDetectedRegions: successfulViews.reduce((sum, view) => sum + view.detectedRegions, 0)
        || toCount(raw?.totalDetectedRegions),
    },
    views,
    deduplicationApplied: scan.crossViewDeduplication?.applied === true,
  };
};

/** Group damages under the view they were detected in, in view order. */
export const groupDamagesByView = (
  damages: AiScanDamage[],
  views: MultiViewViewResult[]
): { view: MultiViewViewResult; damages: AiScanDamage[] }[] =>
  views.map((view) => ({
    view,
    damages: damages.filter((damage) =>
      damage.sourceView
        ? damage.sourceView.id === view.viewId
        : damage.imageIndex === view.index),
  }));

export const getDamagesForView = (
  damages: AiScanDamage[],
  view: MultiViewViewResult | null
): AiScanDamage[] => {
  if (!view) return damages;
  return damages.filter((damage) =>
    damage.sourceView ? damage.sourceView.id === view.viewId : damage.imageIndex === view.index);
};

export interface MultiViewSummaryCopy {
  title: string;
  viewsLine: string;
  damageViewsLine: string;
  regionsLine: string;
  /** Cautious wording. Never claims the vehicle has no damage. */
  message: string;
  partialFailureNote: string | null;
}

const plural = (count: number, singular: string, pluralWord: string) =>
  `${count} ${count === 1 ? singular : pluralWord}`;

export const getMultiViewSummaryCopy = (
  inspection: MultiViewInspection
): MultiViewSummaryCopy => {
  const { summary } = inspection;
  const partialFailureNote = summary.failedViews > 0 ? MULTI_VIEW_PARTIAL_FAILURE_MESSAGE : null;

  const message = summary.totalDetectedRegions === 0
    ? MULTI_VIEW_ZERO_DETECTION_MESSAGE
    : `${plural(summary.totalDetectedRegions, 'detected damage region', 'detected damage regions')} across `
      + `${plural(summary.analyzedViews, 'analyzed view', 'analyzed views')}.`;

  return {
    title: 'Vehicle Inspection Complete',
    viewsLine: `${plural(summary.analyzedViews, 'view', 'views')} analyzed`,
    damageViewsLine: `${plural(summary.viewsWithDamage, 'view', 'views')} with confidence-qualified damage`,
    // Deliberately "regions", not "unique damages".
    regionsLine: plural(summary.totalDetectedRegions, 'detected damage region', 'detected damage regions'),
    message,
    partialFailureNote,
  };
};
