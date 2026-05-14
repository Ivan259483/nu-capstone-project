/**
 * Customer live tracker — static copy + mapping to `trackerStageMedia[].stage` on bookings.
 * Keep in sync with QC `serviceTrackingStage` / backend `tracker.controller.js`.
 */

import {
  TRACKER_PHOTO_SLOT_KEYS,
  normalizeTrackerSlotKey,
  TRACKER_PHOTO_SLOT_LABELS,
  type TrackerPhotoSlotKey,
} from './tracker-gate-photo-slots';

export type TrackerMediaStage =
  | 'confirmed'
  | 'received'
  | 'in_progress'
  | 'quality_check'
  | 'ready_pickup';

/** Full-page live tracker (`CustomerLiveTrackerPage`) step ids. */
export type LiveTrackerStepId =
  | 'awaiting_vehicle'
  | 'confirmed'
  | 'received'
  | 'in_progress'
  | 'completed'
  | 'paid';

/** Which API media row (if any) binds to each full-page step. */
export const LIVE_TRACKER_STEP_MEDIA_STAGE: Record<LiveTrackerStepId, TrackerMediaStage | null> = {
  awaiting_vehicle: null,
  confirmed: 'confirmed',
  received: 'received',
  in_progress: 'in_progress',
  completed: 'quality_check',
  paid: 'ready_pickup',
};

/** Dashboard embedded tracker (`CustomerDashboard` section=tracker) uses these step ids. */
export const DASHBOARD_TRACKER_STEP_MEDIA_STAGE: Record<string, TrackerMediaStage | null> = {
  confirmed: 'confirmed',
  received: 'received',
  in_progress: 'in_progress',
  completed: 'quality_check',
  paid: 'ready_pickup',
};

/** Default customer-facing copy when staff has not overridden `description`. */
export const DEFAULT_TRACKER_STAGE_DESCRIPTION: Record<TrackerMediaStage, string> = {
  confirmed:
    'Your appointment has been confirmed. Please arrive on time.',
  received:
    'Your vehicle has arrived at our shop. Our team is preparing for service.',
  in_progress:
    'Our certified technicians are now working on your vehicle.',
  quality_check:
    'Your vehicle is undergoing final quality inspection by our QC team.',
  ready_pickup:
    'Your vehicle is ready! Please proceed to our shop for pickup.',
};

export type TrackerStageMediaEntry = {
  stage: string;
  slot?: string;
  photoUrl?: string;
  description?: string;
  uploadedAt?: string;
  uploadedBy?: string;
};

export type TrackerStageMediaWithDisplaySlot = TrackerStageMediaEntry & { displaySlot: TrackerPhotoSlotKey };

/** Ordered gate photos (up to five) for customer UI. Legacy slotless row maps to front only. */
export function listTrackerStageMediaForStage(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): TrackerStageMediaWithDisplaySlot[] {
  if (!stage || !booking?.trackerStageMedia?.length) return [];
  const rows = booking.trackerStageMedia.filter((e) => e.stage === stage && String(e.photoUrl || '').trim());
  const out: TrackerStageMediaWithDisplaySlot[] = [];
  let consumedLegacy = false;
  for (const slot of TRACKER_PHOTO_SLOT_KEYS) {
    const explicit = rows.find((r) => normalizeTrackerSlotKey(r.slot) === slot);
    let row: TrackerStageMediaEntry | undefined = explicit;
    if (!row && slot === 'front') {
      row = rows.find((r) => !normalizeTrackerSlotKey(r.slot) && !consumedLegacy);
      if (row) consumedLegacy = true;
    }
    if (row) out.push({ ...row, displaySlot: slot });
  }
  return out;
}

export function getCustomerStageSlotPhotos(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): { url: string; label: string }[] {
  return listTrackerStageMediaForStage(booking, stage).map((r) => ({
    url: (r.photoUrl || '').trim(),
    label: TRACKER_PHOTO_SLOT_LABELS[r.displaySlot],
  }));
}

export function findTrackerStageMedia(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): TrackerStageMediaEntry | null {
  if (!stage || !booking?.trackerStageMedia?.length) return null;
  const ordered = listTrackerStageMediaForStage(booking, stage);
  if (ordered.length) return ordered[0];
  return booking.trackerStageMedia.find((e) => e.stage === stage) || null;
}

/** Final line shown to customer: staff note wins when non-empty, else default catalog line. */
export function resolveTrackerStageDescription(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): string {
  if (!stage) return '';
  const rows = listTrackerStageMediaForStage(booking, stage);
  const custom = rows.map((r) => (r.description || '').trim()).find(Boolean);
  if (custom) return custom;
  return DEFAULT_TRACKER_STAGE_DESCRIPTION[stage] || '';
}

/** Five angle slots filled — same threshold as QC gate advance. */
export const CUSTOMER_TRACKER_GATE_MIN_PHOTOS = 5;

/**
 * When `serviceTrackingStage` (or coarse `status`) still says "received" but all intake
 * photos exist, treat the pipeline as at least the next step so the customer UI matches
 * evidence (mirrors dashboard bumps for quality_check / ready_pickup).
 */
export function bumpCustomerTrackerIndexForReceivedGateComplete(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[]; serviceTrackingStage?: string; status?: string } | null | undefined,
  baseIndex: number,
  pipeline: 'dashboard5' | 'fullpage6'
): number {
  if (!booking) return baseIndex;
  const tsKey = String(booking.serviceTrackingStage ?? '').trim().toLowerCase().replace(/-/g, '_');
  const status = String(booking.status ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (getCustomerStageSlotPhotos(booking, 'received').length < CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
    return baseIndex;
  }
  const stageLagsEvidence = tsKey === 'received' || (!tsKey && status === 'received');
  if (!stageLagsEvidence) return baseIndex;
  const minAfterIntake = pipeline === 'dashboard5' ? 2 : 3;
  return Math.max(baseIndex, minAfterIntake);
}

/**
 * When `serviceTrackingStage` is still `in_progress` but all service-bay photos exist, the QC
 * UI is already on the Quality Check gate — advance the customer display to the QC step.
 */
export function bumpCustomerTrackerIndexForInProgressGateComplete(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[]; serviceTrackingStage?: string; status?: string } | null | undefined,
  baseIndex: number,
  pipeline: 'dashboard5' | 'fullpage6'
): number {
  if (!booking) return baseIndex;
  const tsKey = String(booking.serviceTrackingStage ?? '').trim().toLowerCase().replace(/-/g, '_');
  const status = String(booking.status ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (getCustomerStageSlotPhotos(booking, 'in_progress').length < CUSTOMER_TRACKER_GATE_MIN_PHOTOS) {
    return baseIndex;
  }
  const stageLagsEvidence =
    tsKey === 'in_progress'
    || (!tsKey && (status === 'in_progress' || status === 'in-progress'));
  if (!stageLagsEvidence) return baseIndex;
  const minAfterWork = pipeline === 'dashboard5' ? 3 : 4;
  return Math.max(baseIndex, minAfterWork);
}
