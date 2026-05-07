/**
 * Customer live tracker — static copy + mapping to `trackerStageMedia[].stage` on bookings.
 * Keep in sync with QC `serviceTrackingStage` / backend `tracker.controller.js`.
 */

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
  photoUrl?: string;
  description?: string;
  uploadedAt?: string;
  uploadedBy?: string;
};

export function findTrackerStageMedia(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): TrackerStageMediaEntry | null {
  if (!stage || !booking?.trackerStageMedia?.length) return null;
  return booking.trackerStageMedia.find((e) => e.stage === stage) || null;
}

/** Final line shown to customer: staff note wins when non-empty, else default catalog line. */
export function resolveTrackerStageDescription(
  booking: { trackerStageMedia?: TrackerStageMediaEntry[] } | null | undefined,
  stage: TrackerMediaStage | null | undefined
): string {
  if (!stage) return '';
  const row = findTrackerStageMedia(booking, stage);
  const custom = (row?.description || '').trim();
  if (custom) return custom;
  return DEFAULT_TRACKER_STAGE_DESCRIPTION[stage] || '';
}
