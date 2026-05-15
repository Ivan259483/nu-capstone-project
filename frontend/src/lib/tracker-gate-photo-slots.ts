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

/** Vehicle Arrive — 6th slot (Quality Checker live tracker only). */
export const TRACKER_PREASSESSMENT_SLOT_KEY = 'preassessment_form' as const;

/** Quality Check gate — single checklist / inspection photo. */
export const TRACKER_QC_FORM_SLOT_KEY = 'qc_form' as const;

export type StaffGateSlotKey =
  | TrackerPhotoSlotKey
  | typeof TRACKER_PREASSESSMENT_SLOT_KEY
  | typeof TRACKER_QC_FORM_SLOT_KEY;

export const TRACKER_GATE_STANDARD_SLOT_COUNT = 5;
export const TRACKER_RECEIVED_QC_SLOT_COUNT = 6;
export const TRACKER_QUALITY_CHECK_GATE_SLOT_COUNT = 1;

export const PREASSESSMENT_SLOT_SHORT = 'CHECKLIST PHOTO';
export const PREASSESSMENT_SLOT_HINT = 'Photo of signed checklist';

export const QC_FORM_SLOT_SHORT = 'QC FORM / CHECKLIST';
export const QC_FORM_SLOT_HINT = 'Photo of completed QC checklist / signed inspection';

const PREASSESSMENT_ALIASES = new Set(['preassessment_form', 'checklist_photo', 'checklist']);
const QC_FORM_ALIASES = new Set(['qc_form', 'qc_checklist', 'final_inspection']);

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
    front: 'QC checklist (legacy)',
    rear: 'QC checklist (legacy)',
    left: 'QC checklist (legacy)',
    right: 'QC checklist (legacy)',
    close_up: 'QC checklist (legacy)',
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

/** Staff upload grid: includes checklist slot on Vehicle Arrive for QC viewers. */
export function normalizeStaffGateSlot(raw: string | undefined | null, stage?: string | null): StaffGateSlotKey | null {
  const st = String(stage || '').trim();
  const s = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
  if (PREASSESSMENT_ALIASES.has(s) && st === 'received') {
    return 'preassessment_form';
  }
  if (QC_FORM_ALIASES.has(s) && st === 'quality_check') {
    return 'qc_form';
  }
  return normalizeTrackerSlotKey(raw);
}

export function requiredSlotsCountForGate(gateStage: string, viewerIsQualityChecker: boolean): number {
  if (gateStage === 'quality_check') return TRACKER_QUALITY_CHECK_GATE_SLOT_COUNT;
  if (gateStage === 'received' && viewerIsQualityChecker) return TRACKER_RECEIVED_QC_SLOT_COUNT;
  return TRACKER_GATE_STANDARD_SLOT_COUNT;
}

export function orderedStaffGateSlots(gateStage: string, viewerIsQualityChecker: boolean): StaffGateSlotKey[] {
  if (gateStage === 'quality_check') {
    return [TRACKER_QC_FORM_SLOT_KEY];
  }
  if (gateStage === 'received' && viewerIsQualityChecker) {
    return [...TRACKER_PHOTO_SLOT_KEYS, TRACKER_PREASSESSMENT_SLOT_KEY];
  }
  return [...TRACKER_PHOTO_SLOT_KEYS];
}

export function isGatePhotoStage(stage: string): stage is GateStage {
  return stage === 'received' || stage === 'in_progress' || stage === 'quality_check' || stage === 'ready_pickup';
}

export function slotPromptForGate(stage: string, slot: TrackerPhotoSlotKey): string {
  if (!isGatePhotoStage(stage)) return '';
  return TRACKER_SLOT_PROMPTS[stage][slot] || '';
}

/** Hint under staff gate upload tiles (includes special slots). */
export function slotPromptForStaffGateSlot(stage: string, slot: StaffGateSlotKey): string {
  if (slot === TRACKER_QC_FORM_SLOT_KEY) return QC_FORM_SLOT_HINT;
  if (slot === TRACKER_PREASSESSMENT_SLOT_KEY) return PREASSESSMENT_SLOT_HINT;
  return slotPromptForGate(stage, slot as TrackerPhotoSlotKey);
}
