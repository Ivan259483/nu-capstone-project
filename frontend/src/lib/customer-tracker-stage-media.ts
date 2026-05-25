/**
 * Customer live tracker — static copy + mapping to `trackerStageMedia[].stage` on bookings.
 * Keep in sync with QC `serviceTrackingStage` / backend `tracker.controller.js`.
 */

import {
  TRACKER_PHOTO_SLOT_KEYS,
  normalizeTrackerSlotKey,
  normalizeStaffGateSlot,
  TRACKER_PHOTO_SLOT_LABELS,
  TRACKER_PREASSESSMENT_SLOT_KEY,
  TRACKER_QC_FORM_SLOT_KEY,
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

export const QC_COMPLETE_TRACKER_STAGE_DESCRIPTION =
  "Your vehicle has passed final quality inspection. We're preparing it for pickup.";

export type TrackerStageMediaEntry = {
  stage: string;
  slot?: string;
  photoUrl?: string;
  description?: string;
  uploadedAt?: string;
  uploadedBy?: string;
};

/** Five exterior/detail angles plus optional Vehicle Arrive checklist; Quality Check uses qc_form only. */
export type CustomerTrackerDisplaySlot =
  | TrackerPhotoSlotKey
  | typeof TRACKER_PREASSESSMENT_SLOT_KEY
  | typeof TRACKER_QC_FORM_SLOT_KEY;

export type TrackerStageMediaWithDisplaySlot = TrackerStageMediaEntry & { displaySlot: CustomerTrackerDisplaySlot };

const PREASSESSMENT_CUSTOMER_LABEL = 'Pre-assessment checklist';
export const QC_FORM_CUSTOMER_LABEL = 'QC Form';

/** Five angle slots filled for received / in_progress / ready_pickup — same threshold as those QC gates. */
export const CUSTOMER_TRACKER_GATE_MIN_PHOTOS = 5;

/** Minimum slot rows per gate for customer evidence (matches backend gate rules). */
export function customerGateMinSlotCount(stage: TrackerMediaStage): number {
  if (stage === 'quality_check') return 1;
  return CUSTOMER_TRACKER_GATE_MIN_PHOTOS;
}

/** Ordered gate photos for customer UI (five angles; Vehicle Arrive may add a 6th checklist row; Quality Check is one qc_form row). Legacy slotless row maps to front only. */
export function listTrackerStageMediaForStage(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): TrackerStageMediaWithDisplaySlot[] {
  if (!stage || !booking?.trackerStageMedia?.length) return [];
  const rows = booking.trackerStageMedia.filter((e) => e.stage === stage && String(e.photoUrl || '').trim());

  if (stage === 'quality_check') {
    const qcFormRow = rows.find((r) => normalizeStaffGateSlot(r.slot, stage) === TRACKER_QC_FORM_SLOT_KEY);
    if (qcFormRow) return [{ ...qcFormRow, displaySlot: TRACKER_QC_FORM_SLOT_KEY }];
    const legacy = rows.find((r) => {
      const sl = normalizeStaffGateSlot(r.slot, stage);
      return sl === null ? !normalizeTrackerSlotKey(r.slot) : TRACKER_PHOTO_SLOT_KEYS.includes(sl as TrackerPhotoSlotKey);
    });
    if (legacy) return [{ ...legacy, displaySlot: TRACKER_QC_FORM_SLOT_KEY }];
    return [];
  }

  const out: TrackerStageMediaWithDisplaySlot[] = [];
  let consumedLegacy = false;
  for (const slot of TRACKER_PHOTO_SLOT_KEYS) {
    const explicit = rows.find((r) => normalizeTrackerSlotKey(r.slot) === slot);
    let row: TrackerStageMediaEntry | undefined = explicit;
    if (!row && slot === 'front') {
      row = rows.find((r) => {
        if (consumedLegacy) return false;
        if (normalizeTrackerSlotKey(r.slot)) return false;
        if (stage === 'received' && normalizeStaffGateSlot(r.slot, stage) === TRACKER_PREASSESSMENT_SLOT_KEY) {
          return false;
        }
        return true;
      });
      if (row) consumedLegacy = true;
    }
    if (row) out.push({ ...row, displaySlot: slot });
  }
  if (stage === 'received') {
    const preRow = rows.find((r) => normalizeStaffGateSlot(r.slot, stage) === TRACKER_PREASSESSMENT_SLOT_KEY);
    if (preRow) {
      out.push({ ...preRow, displaySlot: TRACKER_PREASSESSMENT_SLOT_KEY });
    }
  }
  return out;
}

export function getCustomerStageSlotPhotos(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): { url: string; label: string }[] {
  return listTrackerStageMediaForStage(booking, stage).map((r) => ({
    url: (r.photoUrl || '').trim(),
    label:
      r.displaySlot === TRACKER_PREASSESSMENT_SLOT_KEY
        ? PREASSESSMENT_CUSTOMER_LABEL
        : r.displaySlot === TRACKER_QC_FORM_SLOT_KEY
          ? QC_FORM_CUSTOMER_LABEL
          : TRACKER_PHOTO_SLOT_LABELS[r.displaySlot as TrackerPhotoSlotKey],
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

function normalizedTrackerValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function isQualityCheckCompleteForCustomer(
  booking:
    | {
        trackerStageMedia?: TrackerStageMediaEntry[];
        serviceTrackingStage?: string | null;
        status?: string | null;
      }
    | null
    | undefined
): boolean {
  const trackerStage = normalizedTrackerValue(booking?.serviceTrackingStage);
  const status = normalizedTrackerValue(booking?.status);
  const qcEvidenceComplete =
    getCustomerStageSlotPhotos(booking, 'quality_check').length >=
    customerGateMinSlotCount('quality_check');

  return (
    qcEvidenceComplete ||
    ['ready_pickup', 'completed', 'released'].includes(trackerStage) ||
    ['ready_for_payment', 'completed', 'paid', 'released', 'done'].includes(status)
  );
}

/** Final line shown to customer: completed QC copy wins, then staff note, then default catalog line. */
export function resolveTrackerStageDescription(
  booking:
    | {
        trackerStageMedia?: TrackerStageMediaEntry[];
        serviceTrackingStage?: string | null;
        status?: string | null;
      }
    | null
    | undefined,
  stage: TrackerMediaStage | null | undefined
): string {
  if (!stage) return '';
  if (stage === 'quality_check' && isQualityCheckCompleteForCustomer(booking)) {
    return QC_COMPLETE_TRACKER_STAGE_DESCRIPTION;
  }
  const rows = listTrackerStageMediaForStage(booking, stage);
  const custom = rows.map((r) => (r.description || '').trim()).find(Boolean);
  if (custom) return custom;
  return DEFAULT_TRACKER_STAGE_DESCRIPTION[stage] || '';
}

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
