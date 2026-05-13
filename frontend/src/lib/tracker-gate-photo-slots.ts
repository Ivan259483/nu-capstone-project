export const TRACKER_PHOTO_SLOT_KEYS = ['front', 'rear', 'left', 'right', 'close_up'] as const;

export type TrackerPhotoSlotKey = (typeof TRACKER_PHOTO_SLOT_KEYS)[number];

export const TRACKER_PHOTO_SLOT_LABELS: Record<TrackerPhotoSlotKey, string> = {
  front: 'Front',
  rear: 'Rear',
  left: 'Left side',
  right: 'Right side',
  close_up: 'Close-up',
};

/** Short label for compact UI (e.g. caps row). */
export const TRACKER_PHOTO_SLOT_SHORT: Record<TrackerPhotoSlotKey, string> = {
  front: 'FRONT',
  rear: 'REAR',
  left: 'LEFT',
  right: 'RIGHT',
  close_up: 'CLOSE-UP',
};

type GateStage = 'received' | 'in_progress' | 'quality_check' | 'ready_pickup';

/** Per-gate helper copy under each slot (customer-facing tone). */
export const TRACKER_SLOT_PROMPTS: Record<GateStage, Record<TrackerPhotoSlotKey, string>> = {
  received: {
    front: 'Front of vehicle on arrival',
    rear: 'Rear of vehicle on arrival',
    left: 'Left side on arrival',
    right: 'Right side on arrival',
    close_up: 'Existing damage close-up',
  },
  in_progress: {
    front: 'Preparation work',
    rear: 'Coating application',
    left: 'Left side in progress',
    right: 'Right side in progress',
    close_up: 'Detail work close-up',
  },
  quality_check: {
    front: 'Front after service',
    rear: 'Rear after service',
    left: 'Left side QC',
    right: 'Right side QC',
    close_up: 'Finish quality close-up',
  },
  ready_pickup: {
    front: 'Front final',
    rear: 'Rear final',
    left: 'Left side final',
    right: 'Right side final',
    close_up: 'Shine/coating close-up',
  },
};

export function normalizeTrackerSlotKey(raw: string | undefined | null): TrackerPhotoSlotKey | null {
  const s = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
  if (TRACKER_PHOTO_SLOT_KEYS.includes(s as TrackerPhotoSlotKey)) return s as TrackerPhotoSlotKey;
  return null;
}

export function isGatePhotoStage(stage: string): stage is GateStage {
  return stage === 'received' || stage === 'in_progress' || stage === 'quality_check' || stage === 'ready_pickup';
}

export function slotPromptForGate(stage: string, slot: TrackerPhotoSlotKey): string {
  if (!isGatePhotoStage(stage)) return '';
  return TRACKER_SLOT_PROMPTS[stage][slot] || '';
}
