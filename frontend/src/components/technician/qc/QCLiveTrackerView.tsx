import { QCPaymentHandoff } from './QCPaymentHandoff';
import { serviceHandoffState } from '@/lib/service-handoff';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowUpRight,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Filter,
  FileCheck,
  Grid2X2,
  ImageIcon,
  Info,
  List,
  Loader2,
  Lock,
  PackageCheck,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  UserCheck,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { QCJob, QCStagePhotoUploadResult } from '@/hooks/useQCData';
import { OrderService } from '@/lib/order-service';
import type { ServiceStage } from './QCServiceControlPanel';
import {
  TRACKER_PHOTO_SLOT_SHORT,
  slotPromptForStaffGateSlot,
  type TrackerPhotoSlotKey,
  type StaffGateSlotKey,
  normalizeStaffGateSlot,
  requiredSlotsCountForGate,
  orderedStaffGateSlots,
  TRACKER_PREASSESSMENT_SLOT_KEY,
  PREASSESSMENT_SLOT_SHORT,
  TRACKER_QC_FORM_SLOT_KEY,
  QC_FORM_SLOT_SHORT,
} from '@/lib/tracker-gate-photo-slots';
import {
  clearLiveTrackerDeepLinkJobId,
  readLiveTrackerDeepLink,
  type QCLiveTrackerDeepLink,
} from '@/lib/qc-job-workflow';
import { pauseQcJobsRefetchForUpload } from '@/hooks/useQCData';
import { useAuth } from '@/contexts/AuthContext';
import { getSafeUserRole, STAFF_QC_ROLE } from '@/lib/roles';
import {
  getCompletedGateIndexFromServiceStage,
  getTrackerPipelineProgressPct,
} from '@/lib/tracker-pipeline-progress';
import { filterQCJobsBySearch } from '@/lib/qc-job-search';

type TrackerMedia = {
  stage?: string;
  slot?: string;
  photoUrl?: string;
  description?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  hasPhoto?: boolean;
};

function mediaHasRenderablePhotoUrl(media?: { photoUrl?: string } | null): boolean {
  return Boolean(String(media?.photoUrl || '').trim());
}

function mediaRepresentsSavedPhoto(media?: TrackerMedia | null): boolean {
  if (!media) return false;
  if (mediaHasRenderablePhotoUrl(media)) return true;
  if (media.hasPhoto) return true;
  return Boolean(media.stage && media.stage !== 'confirmed');
}

/** Accept only local previews, relative paths, and HTTPS server media. */
function sanitizeInlineTrackerPhotoUrl(url: unknown): string {
  const trimmed = String(url ?? '').trim();
  if (!trimmed || trimmed.startsWith('data:')) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return parsed.toString();
    const isLocalDevelopment = import.meta.env.DEV
      && parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    return isLocalDevelopment ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function sanitizeTrackerMediaEntry(entry: TrackerMedia): TrackerMedia {
  const photoUrl = sanitizeInlineTrackerPhotoUrl(entry.photoUrl);
  if (photoUrl) return { ...entry, photoUrl };
  if (String(entry.photoUrl || '').startsWith('data:')) {
    return { ...entry, photoUrl: undefined, hasPhoto: entry.hasPhoto ?? true };
  }
  return entry;
}

function countTrackerPhotoUrls(media: TrackerMedia[] | undefined): number {
  return (media || []).filter((item) => mediaRepresentsSavedPhoto(item)).length;
}

function countRenderableTrackerPhotoUrls(media: TrackerMedia[] | undefined): number {
  return (media || []).filter((item) => mediaHasRenderablePhotoUrl(item)).length;
}

type ShopFloorUpdate = {
  id: string;
  content: string;
  author: string;
  createdAt?: string;
  sortKey: number;
};

type GateState = 'done' | 'active' | 'waiting';

type TrackerGate = {
  id: ServiceStage;
  label: string;
  shortLabel: string;
  sub: string;
  pct: number;
  Icon: LucideIcon;
  dotClass: string;
};

const TRACKER_GATES: TrackerGate[] = [
  {
    id: 'received',
    label: 'Vehicle Arrive',
    shortLabel: 'Arrive',
    sub: 'Photo of vehicle at intake',
    pct: 25,
    Icon: Car,
    dotClass: 'bg-orange-500',
  },
  {
    id: 'in_progress',
    label: 'Service In Progress',
    shortLabel: 'In Progress',
    sub: 'Photo during active work',
    pct: 50,
    Icon: Wrench,
    dotClass: 'bg-blue-500',
  },
  {
    id: 'quality_check',
    label: 'Quality Check',
    shortLabel: 'QC',
    sub: 'Photo at QC inspection',
    pct: 75,
    Icon: ShieldCheck,
    dotClass: 'bg-purple-500',
  },
  {
    id: 'ready_pickup',
    label: 'Ready for Pickup',
    shortLabel: 'Pickup',
    sub: 'Photo before handoff',
    pct: 100,
    Icon: PackageCheck,
    dotClass: 'bg-green-500',
  },
];

const QC_PASS_THRESHOLD = 75;

const QC_CHECKLIST_SECTIONS = [
  {
    title: 'Pre-Installations',
    /** Paper form: YES / NO columns */
    outcomeLabels: { pass: 'YES', fail: 'NO' } as const,
    items: [
      'Fill/Explain Tint form',
      'Dashcams, accessories removed',
      'Ask client about RFID removal',
    ],
  },
  {
    title: 'Post-Installation',
    outcomeLabels: { pass: 'PASS', fail: 'FAIL' } as const,
    items: [
      'Windows cleaned after installation',
      'No large bubbles',
      'No peeling or film lifting',
      'Film edges properly trimmed',
      'Tint shade matches client request',
      'Dashcam returned',
      'Vehicle interior inspected',
      'Remind NO roll down for 7 days',
    ],
  },
] as const;

const QC_CHECKLIST_ITEMS = QC_CHECKLIST_SECTIONS.flatMap((section, sectionIndex) =>
  section.items.map((label, itemIndex) => ({
    id: `${sectionIndex}-${itemIndex}`,
    label,
    section: section.title,
  }))
);

/** Survives SelectedOrderPanel remounts so checklist toggles are not reset after photo upload refetch. */
const qcChecklistUiCache = new Map<string, Set<string>>();

function qcChecklistPassedCount(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((r: any) => r && (r.passed === true || r.checked === true)).length;
}

/** Prefer the richer snapshot so silent refetches after photo upload don’t wipe unsaved checklist progress. */
function mergeOrderQcChecklistPayload(job: QCJob, incoming: unknown): any[] {
  const oldList = Array.isArray((job as any).qcChecklist) ? (job as any).qcChecklist : [];
  const newList = Array.isArray(incoming) ? incoming : [];
  const oc = qcChecklistPassedCount(oldList);
  const nc = qcChecklistPassedCount(newList);
  if (nc > oc) return newList;
  if (oc > nc) return oldList;
  if (newList.length > oldList.length) return newList;
  if (oldList.length > newList.length) return oldList;
  return newList.length ? newList : oldList;
}

function qcChecklistRowsToCheckedSet(rows: unknown): Set<string> {
  const next = new Set<string>();
  if (!Array.isArray(rows)) return next;
  for (const row of rows) {
    const label = String((row as any)?.item || (row as any)?.name || '').trim();
    if (!label) continue;
    const hit = QC_CHECKLIST_ITEMS.find((e) => e.label === label);
    if (hit && ((row as any).passed === true || (row as any).checked === true)) {
      next.add(hit.id);
    }
  }
  return next;
}

function checkedSetToQcChecklistPayload(ids: Set<string>) {
  return QC_CHECKLIST_ITEMS.map(({ id, label }) => ({
    item: label,
    passed: ids.has(id),
    note: '',
  }));
}

type QCGateValidation = {
  plateValid: boolean;
  thresholdMet: boolean;
  allItemsChecked: boolean;
  photoAttached: boolean;
  checkedCount: number;
  totalCount: number;
  score: number;
  ready: boolean;
  missing: string[];
};

/** Matches backend / QC `serviceTrackingStage` advance order (confirmed is implicit first). */
const SERVICE_STAGE_ADVANCE_ORDER: ServiceStage[] = [
  'confirmed',
  'received',
  'in_progress',
  'quality_check',
  'ready_pickup',
];

function getNextPipelineServiceStage(job: QCJob): ServiceStage | null {
  const rawJobStage = String((job as any).serviceTrackingStage || 'confirmed').toLowerCase();
  const orderKey = (['approved', 'assigned'].includes(rawJobStage) ? 'confirmed' : rawJobStage) as ServiceStage;
  const orderIdx = SERVICE_STAGE_ADVANCE_ORDER.indexOf(orderKey);
  if (orderIdx < 0 || orderIdx >= SERVICE_STAGE_ADVANCE_ORDER.length - 1) return null;
  return SERVICE_STAGE_ADVANCE_ORDER[orderIdx + 1];
}

function displayNameForPipelineStage(stage: ServiceStage): string {
  const gate = TRACKER_GATES.find((g) => g.id === stage);
  if (gate) return gate.label;
  if (stage === 'confirmed') return 'Appointment confirmed';
  return toTitleCase(stage.replace(/_/g, ' '));
}

const TRACKED_ORDER_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'paid', 'completed', 'released'];
const CUSTOMER_UPDATE_STALE_MS = 24 * 60 * 60 * 1000;
const QC_LIVE_MODAL_PERSIST_KEY = 'autospf:qc-live-modal:v1';

type LiveOrderFilter = 'all' | 'needs-evidence' | 'received' | 'in_progress' | 'quality_check' | 'ready_pickup';
type LiveOrderSort = 'priority' | 'latest' | 'oldest' | 'customer' | 'stage';
type LiveOrderDensity = 'grid' | 'compact';

function relTime(iso?: string) {
  if (!iso) return 'Recently';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return 'Recently';
  }
}

const toTitleCase = (str: string) =>
  str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

function formatTitle(value?: string | null, fallback = '-') {
  const formatted = toTitleCase(String(value ?? '').trim());
  return formatted || fallback;
}

function formatVehicle(job: QCJob) {
  return (
    [job.vehicleYear, formatTitle(job.vehicleMake || job.make, ''), formatTitle(job.vehicleModel, '')]
      .filter(Boolean)
      .join(' ') ||
    formatTitle(job.vehicle, '-')
  );
}

function formatCustomer(value?: string | null) {
  return formatTitle(value, 'Customer');
}

function formatService(job: QCJob) {
  return String(job.serviceType || job.service || 'Service').trim() || 'Service';
}

function truncateOrderId(value?: string | null) {
  const id = String(value || '').trim();
  if (id.length <= 16) return id || '-';
  return `${id.slice(0, 7)}...${id.slice(-5)}`;
}

function getMediaList(job: QCJob): TrackerMedia[] {
  return (((job as any).trackerStageMedia || []) as TrackerMedia[]).filter(Boolean);
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function countFilledGateSlots(mediaList: TrackerMedia[], stage: string): number {
  if (stage === 'quality_check') {
    for (const m of mediaList) {
      if (m.stage !== stage) continue;
      if (!mediaRepresentsSavedPhoto(m)) continue;
      return 1;
    }
    return 0;
  }
  const keys = new Set<string>();
  for (const m of mediaList) {
    if (m.stage !== stage) continue;
    if (!mediaRepresentsSavedPhoto(m)) continue;
    const slot = normalizeStaffGateSlot(m.slot, m.stage);
    if (slot) keys.add(slot);
    else keys.add('__legacy__');
  }
  return keys.size;
}

function gateHasAllSlots(mediaList: TrackerMedia[], stage: string, viewerIsQualityChecker: boolean): boolean {
  const need = requiredSlotsCountForGate(stage, viewerIsQualityChecker);
  return countFilledGateSlots(mediaList, stage) >= need;
}

function buildQCGateValidation(plateValue: string, checkedIds: Set<string>, mediaList: TrackerMedia[]): QCGateValidation {
  const checkedCount = checkedIds.size;
  const totalCount = QC_CHECKLIST_ITEMS.length;
  const score = Math.round((checkedCount / totalCount) * 100);
  const validation = {
    plateValid: /^\d{4}$/.test(plateValue),
    thresholdMet: score >= QC_PASS_THRESHOLD,
    allItemsChecked: checkedCount === totalCount,
    photoAttached: gateHasAllSlots(mediaList, 'quality_check', true),
    checkedCount,
    totalCount,
    score,
  };
  const missing: string[] = [];
  if (!validation.plateValid) missing.push('plate validation');
  if (!validation.thresholdMet) missing.push('75% QC threshold');
  if (!validation.allItemsChecked) missing.push('all checklist items');
  if (!validation.photoAttached) missing.push('QC photo');

  return {
    ...validation,
    ready: missing.length === 0,
    missing,
  };
}

/** Match server: legacy slotless row counts as front for this slot only. */
function getMediaForSlot(
  mediaList: TrackerMedia[],
  stage: string,
  slot: StaffGateSlotKey
): TrackerMedia | undefined {
  if (slot === TRACKER_QC_FORM_SLOT_KEY) {
    const explicit = mediaList.find(
      (m) =>
        m.stage === stage &&
        normalizeStaffGateSlot(m.slot, m.stage) === TRACKER_QC_FORM_SLOT_KEY &&
        mediaRepresentsSavedPhoto(m)
    );
    if (explicit) return explicit;
    return mediaList.find((m) => m.stage === stage && mediaRepresentsSavedPhoto(m));
  }
  const explicit = mediaList.find(
    (m) => m.stage === stage && normalizeStaffGateSlot(m.slot, m.stage) === slot && mediaRepresentsSavedPhoto(m)
  );
  if (explicit) return explicit;
  if (slot === 'front') {
    return mediaList.find(
      (m) => m.stage === stage && mediaRepresentsSavedPhoto(m) && !normalizeStaffGateSlot(m.slot, m.stage)
    );
  }
  return undefined;
}

function matchesStageSlotRow(item: TrackerMedia, media: TrackerMedia): boolean {
  if (item.stage !== media.stage) return false;
  const islot = normalizeStaffGateSlot(item.slot, item.stage);
  const mslot = normalizeStaffGateSlot(media.slot, media.stage);
  if (mslot && islot === mslot) return true;
  if (mslot === 'front' && !islot && mediaRepresentsSavedPhoto(item)) return true;
  if (
    media.stage === 'quality_check' &&
    mslot === TRACKER_QC_FORM_SLOT_KEY &&
    mediaRepresentsSavedPhoto(item)
  ) {
    return true;
  }
  return false;
}

/** Keep in-memory blob previews until a remote https URL is available (avoid swapping in heavy base64). */
function preferTrackerPhotoMerge(existing: TrackerMedia | undefined, incoming: TrackerMedia): TrackerMedia {
  const existingUrl = String(existing?.photoUrl || '').trim();
  const incomingUrl = String(incoming?.photoUrl || '').trim();
  if (existingUrl.startsWith('blob:')) {
    if (!incomingUrl || incomingUrl.startsWith('data:')) return existing ?? incoming;
    if (incomingUrl.startsWith('https://') || incomingUrl.startsWith('/')) {
      return { ...incoming, photoUrl: incomingUrl };
    }
    return existing ?? incoming;
  }
  return incoming;
}

function mergeTrackerStageMediaLists(oldList: TrackerMedia[], serverList: TrackerMedia[]): TrackerMedia[] {
  const merged: TrackerMedia[] = [];
  const consumed = new Set<number>();
  const safeServerList = serverList.map(sanitizeTrackerMediaEntry);

  for (const oldItem of oldList) {
    const serverIndex = safeServerList.findIndex(
      (serverItem, index) => !consumed.has(index) && matchesStageSlotRow(oldItem, serverItem)
    );
    if (serverIndex >= 0) {
      consumed.add(serverIndex);
      merged.push(preferTrackerPhotoMerge(oldItem, safeServerList[serverIndex]!));
    } else if (mediaRepresentsSavedPhoto(oldItem) || String(oldItem.photoUrl || '').startsWith('blob:')) {
      merged.push(oldItem);
    }
  }

  safeServerList.forEach((serverItem, index) => {
    if (consumed.has(index)) return;
    if (mediaRepresentsSavedPhoto(serverItem)) merged.push(serverItem);
  });

  return merged;
}

function stageToOrderStatus(stage: ServiceStage, fallback?: string) {
  if (stage === 'received') return 'received';
  if (stage === 'in_progress' || stage === 'quality_check') return 'in_progress';
  if (stage === 'ready_pickup') return 'ready_for_payment';
  if (stage === 'completed') return 'completed';
  if (stage === 'released') return 'released';
  return fallback;
}

function getTrackerState(job: QCJob) {
  const rawStage = ((job as any).serviceTrackingStage || null) as ServiceStage | null;
  const rawStatus = String((job as any).orderStatus || '').toLowerCase();
  const normalizedStage = rawStage === 'released' || rawStage === 'completed' ? 'ready_pickup' : rawStage;
  const statusComplete = rawStatus === 'completed' || rawStatus === 'released';
  const stageComplete = rawStage === 'ready_pickup' || rawStage === 'completed' || rawStage === 'released';
  const completedIndex = Math.max(
    getCompletedGateIndexFromServiceStage(normalizedStage ?? undefined),
    statusComplete ? TRACKER_GATES.length - 1 : -1
  );
  const isComplete = stageComplete || statusComplete || completedIndex >= TRACKER_GATES.length - 1;
  const isReleased = ['completed', 'released'].includes(String(rawStage || '')) || ['completed', 'released'].includes(rawStatus);
  const activeIndex = isComplete ? TRACKER_GATES.length - 1 : Math.min(Math.max(completedIndex + 1, 0), TRACKER_GATES.length - 1);
  const progressPct = getTrackerPipelineProgressPct({
    serviceTrackingStage: (job as any).serviceTrackingStage,
    status: (job as any).orderStatus,
  });

  return {
    completedIndex,
    activeIndex,
    currentGate: TRACKER_GATES[activeIndex],
    nextGate: TRACKER_GATES[activeIndex + 1] || null,
    progressPct,
    isComplete,
    isReleased,
  };
}

function getGateState(job: QCJob, index: number): GateState {
  const tracker = getTrackerState(job);
  if (index <= tracker.completedIndex) return 'done';
  if (index === tracker.activeIndex && !tracker.isComplete) return 'active';
  return 'waiting';
}

function needsCustomerUpdate(job: QCJob) {
  const mediaList = getMediaList(job);
  const uploadedAt = mediaList
    .map((media) => (media.uploadedAt ? new Date(media.uploadedAt).getTime() : 0))
    .reduce((max, next) => Math.max(max, next), 0);

  if (!uploadedAt) return true;
  return Date.now() - uploadedAt > CUSTOMER_UPDATE_STALE_MS;
}

function buildShopFloorUpdates(job: QCJob): ShopFloorUpdate[] {
  return ((job.staffNotes || []) as any[])
    .map((note, index) => {
      const content = String(note?.content || '').trim();
      if (!content || content.startsWith('[QC_RETURN]')) return null;
      const createdAt = note?.createdAt;
      const sortKey = createdAt ? new Date(createdAt).getTime() : index;
      return {
        id: `note-${index}-${sortKey}`,
        content,
        author: String(note?.detailerName || note?.createdBy || 'Staff'),
        createdAt,
        sortKey,
      } satisfies ShopFloorUpdate;
    })
    .filter(Boolean)
    .sort((a, b) => a!.sortKey - b!.sortKey) as ShopFloorUpdate[];
}

function getLeadTechnician(job: QCJob) {
  const assignments = (((job as any).serviceStaffAssignments || []) as { name?: string }[]).filter((slot) => slot.name);
  return assignments[0]?.name || job.technician || '-';
}

type QCHandoffFormState = {
  clientName: string;
  serviceDate: string;
  makeModel: string;
  plateNo: string;
  tintShadeInstalled: string;
  installer: string;
};

const QC_HANDOFF_FIELD_CLASS =
  'mt-1 w-full rounded-xl border-0 bg-slate-100/90 px-3 py-2.5 text-sm font-bold text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:font-semibold placeholder:text-slate-400/75 focus:bg-white focus:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.14)]';

function formatHandoffDefaultDate(job: QCJob): string {
  const raw = String((job as any).bookingDate || '').trim();
  if (raw) {
    const tryParse = new Date(raw);
    if (!Number.isNaN(tryParse.getTime())) {
      const mm = String(tryParse.getMonth() + 1).padStart(2, '0');
      const dd = String(tryParse.getDate()).padStart(2, '0');
      const yy = String(tryParse.getFullYear()).slice(-2);
      return `${mm}-${dd}-${yy}`;
    }
    if (/^\d{2}-\d{2}-\d{2}$/.test(raw)) return raw;
  }
  const created = job.submittedAt || (job as any).createdAt;
  if (created) {
    const d = new Date(created);
    if (!Number.isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `${mm}-${dd}-${yy}`;
    }
  }
  return '';
}

function defaultMakeModelLine(job: QCJob): string {
  const parts = [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean);
  const base = parts.join(' ').trim();
  const color = String(job.vehicleColor || '').trim();
  if (base && color) return `${base} (${color})`;
  return base || String(job.vehicle || '').trim();
}

/** Order plate must never show ciphertext or a mistaken 24-char ObjectId as a "plate". */
function sanitizeDisplayPlate(raw: string): string {
  const p = String(raw || '').trim();
  if (!p) return '';
  if (/^[a-f0-9]{24}$/i.test(p)) return '';
  if (/^[0-9a-f]{32}:[0-9a-f]+$/i.test(p)) return '';
  return p;
}

/**
 * QC gate expects 4 numeric digits — use the last 4 digits from the booking plate
 * (customer vehicle snapshot on the order), or from handoff `plateNo` if the order plate has no digits.
 */
function deriveQcFourDigitPlate(job: QCJob): string {
  const orderPlate = sanitizeDisplayPlate(String(job.plate || '').trim());
  let digits = orderPlate.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  const handoffPlate = sanitizeDisplayPlate(String((job as any).qcHandoffSheet?.plateNo || '').trim());
  digits = handoffPlate.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return digits.slice(0, 4);
}

/**
 * Per-field merge: saved `qcHandoffSheet` wins when that field is non-empty;
 * otherwise fall back to booking / garage snapshot on the order (same source as customer "add vehicle").
 */
function sheetFromJob(job: QCJob): QCHandoffFormState {
  const s = (job as any).qcHandoffSheet || {};
  const pick = (key: keyof QCHandoffFormState, fallback: string) => {
    const v = String(s[key] ?? '').trim();
    return v || fallback;
  };
  const plateFallback = sanitizeDisplayPlate(String(job.plate || '').trim());
  const tintFallback = String((job as any).existingFwsAndShade || '').trim();

  return {
    clientName: pick('clientName', String((job as any).customerName || job.customer || '').trim()),
    serviceDate: pick('serviceDate', formatHandoffDefaultDate(job)),
    makeModel: pick('makeModel', defaultMakeModelLine(job)),
    plateNo: pick('plateNo', plateFallback),
    tintShadeInstalled: pick('tintShadeInstalled', tintFallback),
    installer: pick(
      'installer',
      String(getLeadTechnician(job)).replace(/^-\s*$/, '').trim() || String(job.technician || '').trim()
    ),
  };
}

function isTerminalOrder(job: QCJob): boolean {
  const stage = String((job as any).serviceTrackingStage || '').toLowerCase();
  const status = String((job as any).orderStatus || '').toLowerCase();
  return stage === 'completed' || stage === 'released' || status === 'completed' || status === 'released';
}

function trackerSlotLabel(slot: StaffGateSlotKey): string {
  if (slot === TRACKER_PREASSESSMENT_SLOT_KEY) return 'Checklist';
  if (slot === TRACKER_QC_FORM_SLOT_KEY) return 'QC form';
  return toTitleCase(TRACKER_PHOTO_SLOT_SHORT[slot as TrackerPhotoSlotKey].toLowerCase());
}

function mostRecentOrderUpdateMs(job: QCJob): number {
  const evidenceTimes = getMediaList(job).map((item) => {
    const time = item.uploadedAt ? new Date(item.uploadedAt).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  });
  const candidates = [
    ...evidenceTimes,
    new Date(String((job as any).serviceTrackingUpdatedAt || '')).getTime(),
    new Date(String((job as any).updatedAt || '')).getTime(),
    new Date(String(job.submittedAt || '')).getTime(),
  ].filter((time) => Number.isFinite(time) && time > 0);
  return candidates.length ? Math.max(...candidates) : 0;
}

type LiveEvidenceSummary = {
  stage: ServiceStage;
  slots: { key: StaffGateSlotKey; label: string; complete: boolean }[];
  completed: number;
  required: number;
  missing: number;
  nextMissing: string | null;
  lastUpdateMs: number;
  stale: boolean;
  needsAttention: boolean;
  reason: string;
  actionLabel: string;
};

function getLiveEvidenceSummary(job: QCJob, viewerIsQualityChecker: boolean): LiveEvidenceSummary {
  const tracker = getTrackerState(job);
  const stage = tracker.currentGate.id;
  const media = getMediaList(job);
  const stageSlots = orderedStaffGateSlots(stage, viewerIsQualityChecker);
  const slots = stageSlots.map((key) => ({
    key,
    label: trackerSlotLabel(key),
    complete: Boolean(getMediaForSlot(media, stage, key)),
  }));
  const required = requiredSlotsCountForGate(stage, viewerIsQualityChecker);
  const completed = Math.min(required, slots.filter((slot) => slot.complete).length);
  const missing = Math.max(0, required - completed);
  const nextMissing = slots.find((slot) => !slot.complete)?.label || null;
  const lastUpdateMs = mostRecentOrderUpdateMs(job);
  const handoff = serviceHandoffState(job);
  const stale = !handoff && Boolean(lastUpdateMs && Date.now() - lastUpdateMs > CUSTOMER_UPDATE_STALE_MS);
  const qcPassed = qcChecklistPassedCount((job as any).qcChecklist);
  const qcChecklistMissing = stage === 'quality_check' && qcPassed < QC_CHECKLIST_ITEMS.length;

  let reason = '';
  if (missing > 0) {
    if (stage === 'received') reason = completed === 0 ? 'Arrival photos required' : `${missing} arrival photo${missing === 1 ? '' : 's'} missing`;
    else if (stage === 'quality_check') reason = 'QC photo required';
    else if (stage === 'ready_pickup') reason = `${missing} final photo${missing === 1 ? '' : 's'} missing`;
    else reason = `${missing} service photo${missing === 1 ? '' : 's'} missing`;
  } else if (qcChecklistMissing) {
    const remaining = Math.max(0, QC_CHECKLIST_ITEMS.length - qcPassed);
    reason = `${remaining} QC check${remaining === 1 ? '' : 's'} incomplete`;
  } else if (handoff === 'payment') {
    reason = 'Awaiting POS Payment · Transferred to Sales/POS · Collect Remaining Balance';
  } else if (handoff === 'handover') {
    reason = 'Payment Confirmed · Ready for Customer Handover';
  } else if (stale) {
    reason = `No update for ${formatDistanceToNow(new Date(lastUpdateMs))}`;
  }

  let actionLabel = 'View / verify';
  if (stage === 'received') actionLabel = missing > 0 ? 'Upload arrival photos' : 'View / verify';
  if (stage === 'in_progress') actionLabel = missing > 0 ? 'Upload evidence' : 'View / upload';
  if (stage === 'quality_check') actionLabel = missing > 0 || qcChecklistMissing ? 'Upload QC photos' : 'View / verify';
  if (stage === 'ready_pickup') actionLabel = missing > 0 ? 'Upload final evidence' : 'View / verify';

  return {
    stage,
    slots,
    completed,
    required,
    missing,
    nextMissing,
    lastUpdateMs,
    stale,
    needsAttention: missing > 0 || qcChecklistMissing || stale,
    reason,
    actionLabel,
  };
}

function latestEvidencePhoto(job: QCJob): string {
  const fromTracker = getMediaList(job)
    .filter((item) => mediaHasRenderablePhotoUrl(item))
    .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())[0]?.photoUrl;
  if (fromTracker) return sanitizeInlineTrackerPhotoUrl(fromTracker);
  const legacy = [...(job.photos?.after || []), ...(job.photos?.before || [])]
    .map(sanitizeInlineTrackerPhotoUrl)
    .find(Boolean);
  return legacy || '';
}

function EvidenceThumbnail({ job, compact = false }: { job: QCJob; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const photoUrl = latestEvidencePhoto(job);

  if (!photoUrl || failed) {
    return (
      <div className={`qc-live-evidence-media flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200/70 text-slate-400 ${compact ? 'h-16 w-24 shrink-0' : 'aspect-[16/7] w-full'}`}>
        <div className="flex flex-col items-center gap-1">
          <Car className={compact ? 'h-5 w-5' : 'h-8 w-8'} strokeWidth={1.5} />
          {!compact ? <span className="text-[10px] font-bold uppercase tracking-[0.12em]">No evidence photo</span> : null}
        </div>
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={`Latest evidence for ${formatVehicle(job)}`}
      onError={() => setFailed(true)}
      className={`qc-live-evidence-media rounded-xl object-cover ${compact ? 'h-16 w-24 shrink-0' : 'aspect-[16/7] w-full'}`}
    />
  );
}

function stageBadgeClasses(stage: ServiceStage) {
  if (stage === 'ready_pickup') return 'bg-emerald-50 text-emerald-700 ring-emerald-200/70';
  if (stage === 'quality_check') return 'bg-violet-50 text-violet-700 ring-violet-200/70';
  if (stage === 'in_progress') return 'bg-blue-50 text-blue-700 ring-blue-200/70';
  return 'bg-sky-50 text-sky-700 ring-sky-200/70';
}

function stageDisplayLabel(stage: ServiceStage) {
  if (stage === 'received') return 'Arrived';
  if (stage === 'in_progress') return 'In progress';
  if (stage === 'quality_check') return 'QC ready';
  if (stage === 'ready_pickup') return 'Ready';
  return displayNameForPipelineStage(stage);
}

function OperationalOrderCard({
  job,
  summary,
  compact,
  highlighted,
  onOpen,
}: {
  job: QCJob;
  summary: LiveEvidenceSummary;
  compact?: boolean;
  highlighted?: boolean;
  onOpen: () => void;
}) {
  const tracker = getTrackerState(job);
  const updateLabel = summary.lastUpdateMs ? relTime(new Date(summary.lastUpdateMs).toISOString()) : 'No update yet';
  const completionPct = summary.required > 0 ? Math.round((summary.completed / summary.required) * 100) : 100;

  if (compact) {
    return (
      <article
        id={`live-order-${job.id}`}
        className={`qc-live-order-card group rounded-2xl border bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${summary.needsAttention ? 'qc-live-order-card--attention' : ''} ${highlighted ? 'qc-live-order-card--selected border-blue-400 ring-4 ring-blue-100' : 'border-slate-200/80 shadow-sm'}`}
      >
        <button type="button" onClick={onOpen} className="w-full text-left focus:outline-none" aria-label={`Open ${job.jobId}`}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{truncateOrderId(job.jobId)}</p>
                <span className="text-[11px] font-black tabular-nums text-slate-500">{tracker.progressPct}%</span>
              </div>
              <h3 className="mt-1 truncate text-sm font-black text-slate-950">{formatCustomer(job.customerName || job.customer)}</h3>
              <p className="mt-1 truncate text-xs font-semibold text-slate-600">{formatVehicle(job)}</p>
              <p className="truncate text-[11px] font-medium text-slate-400">{formatService(job)}</p>
            </div>
            <EvidenceThumbnail job={job} compact />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ring-1 ${stageBadgeClasses(summary.stage)}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {stageDisplayLabel(summary.stage)}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">{updateLabel}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-slate-500">Evidence {summary.completed} / {summary.required}</span>
            <span className="font-black text-blue-600">{summary.actionLabel}</span>
          </div>
        </button>
      </article>
    );
  }

  return (
    <article
      id={`live-order-${job.id}`}
      className={`qc-live-order-card group flex min-h-[430px] flex-col rounded-2xl border bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl ${summary.needsAttention ? 'qc-live-order-card--attention' : ''} ${highlighted ? 'qc-live-order-card--selected border-blue-400 ring-4 ring-blue-100' : 'border-slate-200/80 shadow-sm'}`}
    >
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left focus:outline-none" aria-label={`Open ${job.jobId}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{truncateOrderId(job.jobId)}</p>
            <h3 className="mt-1.5 truncate text-[15px] font-black text-slate-950">{formatCustomer(job.customerName || job.customer)}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black tabular-nums text-slate-600">{tracker.progressPct}%</span>
        </div>
        <p className="mt-2 truncate text-[13px] font-bold text-slate-700">{formatVehicle(job)}</p>
        <p className="truncate text-xs font-semibold text-slate-500">{formatService(job)}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ring-1 ${stageBadgeClasses(summary.stage)}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {stageDisplayLabel(summary.stage)}
          </span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${summary.stale ? 'text-amber-700' : 'text-slate-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${summary.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {updateLabel}
          </span>
        </div>

        <div className="mt-3"><EvidenceThumbnail job={job} /></div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-black text-slate-700">Evidence progress</span>
          <span className="font-black tabular-nums text-slate-950">{summary.completed} / {summary.required}</span>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {summary.slots.map((slot) => (
            <div key={slot.key} className="min-w-0 text-center">
              <span className={`qc-live-evidence-dot mx-auto flex h-6 w-6 items-center justify-center rounded-full border ${slot.complete ? 'is-complete border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block truncate text-[8px] font-semibold text-slate-500" title={slot.label}>{slot.label}</span>
            </div>
          ))}
        </div>

        <div className={`mt-3 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${summary.needsAttention ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
          {summary.reason || (summary.nextMissing ? `Next: ${summary.nextMissing}` : summary.stage === 'ready_pickup' ? 'Evidence complete — waiting for release' : 'Evidence is up to date')}
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className={`qc-live-primary-action mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black uppercase tracking-[0.04em] transition focus:outline-none focus:ring-4 ${summary.stage === 'ready_pickup' && !summary.needsAttention ? 'is-success bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-100' : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-100'}`}
      >
        {summary.missing > 0 ? <UploadCloud className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
        {summary.actionLabel}
      </button>
    </article>
  );
}

function MilestoneStepper({
  job,
  selectedGateId,
  onSelectGate,
}: {
  job: QCJob;
  selectedGateId: ServiceStage;
  onSelectGate: (gate: ServiceStage) => void;
}) {
  const tracker = getTrackerState(job);

  return (
    <div className="shrink-0 bg-transparent px-6 py-4">
      <div className="rounded-[30px] bg-white/95 px-5 py-4 shadow-[0_22px_55px_-22px_rgba(15,23,42,0.12),0_8px_24px_-14px_rgba(15,23,42,0.07)]">
        <div className="grid grid-cols-4">
        {TRACKER_GATES.map((gate, index) => {
          const state = getGateState(job, index);
          const done = state === 'done';
          const active = state === 'active';
          const reviewable = done || active;
          const selected = selectedGateId === gate.id;
          const lineDone = index <= tracker.completedIndex;
          return (
            <button
              key={gate.id}
              type="button"
              onClick={() => onSelectGate(gate.id)}
              disabled={!reviewable}
              aria-pressed={selected}
              title={reviewable ? `Review ${gate.label} evidence` : `${gate.label} is not complete yet`}
              className={`group relative flex min-w-0 flex-col items-center text-center focus:outline-none ${
                reviewable
                  ? 'cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              {index < TRACKER_GATES.length - 1 ? (
                <div
                  className={`absolute left-1/2 top-3.5 h-1 w-full rounded-full transition-colors ${
                    lineDone ? 'bg-emerald-400/80' : 'bg-slate-100'
                  }`}
                />
              ) : null}
              <div
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black tabular-nums transition ${
                  done
                    ? 'bg-emerald-500 text-white shadow-[0_3px_10px_-2px_rgba(16,185,129,0.55)]'
                    : active
                      ? 'bg-slate-950 text-white shadow-[0_4px_14px_-2px_rgba(15,23,42,0.45)]'
                      : 'bg-white text-slate-400 shadow-[inset_0_1px_3px_rgba(15,23,42,0.08),0_2px_8px_-2px_rgba(15,23,42,0.06)]'
                } ${selected ? 'ring-4 ring-blue-100 ring-offset-2' : reviewable ? 'group-hover:scale-110' : ''}`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.8} /> : active ? index + 1 : null}
              </div>
              <p className={`mt-2 w-full truncate px-1 text-[11px] font-black ${selected ? 'text-blue-700' : done ? 'text-emerald-700' : active ? 'text-slate-950' : 'text-slate-400'}`}>
                {gate.label}
              </p>
            </button>
          );
        })}
        </div>
        <p className="mt-3 text-center text-[10px] font-bold text-slate-400">
          Select a completed step to review its uploaded evidence.
        </p>
      </div>
    </div>
  );
}

function CompletedGateEvidenceCard({
  job,
  gate,
  viewerIsQualityChecker,
  detailsLoading,
}: {
  job: QCJob;
  gate: TrackerGate;
  viewerIsQualityChecker: boolean;
  detailsLoading?: boolean;
}) {
  const mediaList = getMediaList(job);
  const slotRows = orderedStaffGateSlots(gate.id, viewerIsQualityChecker);
  const uploadedCount = countFilledGateSlots(mediaList, gate.id);
  const requiredCount = requiredSlotsCountForGate(gate.id, viewerIsQualityChecker);
  const GateIcon = gate.Icon;

  return (
    <section id={`qc-evidence-${job.id}`} className="qc-live-panel scroll-mt-5 rounded-[32px] bg-white/95 p-5 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">
            <ImageIcon className="h-3.5 w-3.5" />
            Saved gate evidence
          </div>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-black tracking-tight text-slate-950">
            <GateIcon className="h-5 w-5 text-slate-500" />
            {gate.label}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Uploaded photos for this completed step. Review only — the originals remain unchanged.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 tabular-nums">
          <ImageIcon className="h-3.5 w-3.5" />
          {uploadedCount}/{requiredCount} saved
        </span>
      </div>

      <div className={gate.id === 'quality_check' ? 'mt-5 flex justify-center gap-3' : 'mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3'}>
        {slotRows.map((slot) => {
          const isChecklist = slot === TRACKER_PREASSESSMENT_SLOT_KEY;
          const isQcForm = slot === TRACKER_QC_FORM_SLOT_KEY;
          const entry = getMediaForSlot(mediaList, gate.id, slot);
          const photoUrl = String(entry?.photoUrl || '').trim();
          const saved = mediaRepresentsSavedPhoto(entry);
          const label = isChecklist
            ? PREASSESSMENT_SLOT_SHORT
            : isQcForm
              ? QC_FORM_SLOT_SHORT
              : TRACKER_PHOTO_SLOT_SHORT[slot as TrackerPhotoSlotKey];
          const prompt = slotPromptForStaffGateSlot(gate.id, slot);
          const tileWidth = gate.id === 'quality_check' ? 'w-full max-w-md' : '';

          return (
            <figure
              key={slot}
              className={`overflow-hidden rounded-[24px] bg-slate-50/85 shadow-[0_10px_32px_-14px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.95)] ${tileWidth}`}
            >
              <figcaption className="flex items-center justify-between gap-2 bg-white/90 px-2.5 py-1.5">
                <span className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-slate-600">{label}</span>
                {saved ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={2.8} />
                    Saved
                  </span>
                ) : null}
              </figcaption>
              <div className="aspect-[4/3] w-full bg-slate-100">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={`${gate.label}: ${prompt}`}
                    className="h-full w-full object-contain bg-slate-950"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-slate-500">
                    {detailsLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImageIcon className="h-7 w-7" strokeWidth={1.75} />}
                    <span className="text-[10px] font-bold leading-snug">
                      {detailsLoading ? 'Loading saved photo...' : saved ? 'Saved photo unavailable' : 'No photo was saved'}
                    </span>
                  </div>
                )}
              </div>
              <p className="min-h-10 px-2.5 py-2 text-[10px] font-semibold leading-snug text-slate-500">{prompt}</p>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

function PhotoComplianceCard({
  job,
  viewerIsQualityChecker,
  focusedStage,
}: {
  job: QCJob;
  viewerIsQualityChecker: boolean;
  focusedStage?: ServiceStage;
}) {
  const mediaList = getMediaList(job);
  const tracker = getTrackerState(job);
  const selectedStage = focusedStage || tracker.currentGate.id;
  const currentNeed = requiredSlotsCountForGate(selectedStage, viewerIsQualityChecker);
  const currentCount = countFilledGateSlots(mediaList, selectedStage);

  return (
    <section className="qc-live-panel rounded-[30px] bg-white/95 p-4 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Photo compliance</p>
          <h3 className="mt-1 text-sm font-black text-slate-950">Required gates</h3>
        </div>
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white tabular-nums">
          {currentCount}/{currentNeed}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {TRACKER_GATES.map((gate, index) => {
          const m = countFilledGateSlots(mediaList, gate.id);
          const need = requiredSlotsCountForGate(gate.id, viewerIsQualityChecker);
          const complete = m >= need;
          const requiredNow = !complete && !tracker.isComplete && index === tracker.activeIndex;
          const statusLabel = complete ? 'Done' : requiredNow ? 'Required now' : 'Waiting';
          const GateIcon = gate.Icon;
          return (
            <div key={gate.id} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  complete ? 'bg-emerald-500' : requiredNow ? gate.dotClass : 'bg-slate-300'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-xs font-black text-slate-800">
                  <GateIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{gate.label}</span>
                </p>
                <p className="text-[10px] font-bold tabular-nums text-slate-600">
                  {m}/{need} photos
                  <span className={`ml-1.5 ${complete ? 'text-emerald-600' : requiredNow ? 'text-amber-600' : 'text-slate-400'}`}>
                    · {statusLabel}
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QCHandoffOrderCard({
  job,
  onSave,
  onLocalPatch,
}: {
  job: QCJob;
  onSave: (id: string, payload: QCHandoffFormState) => Promise<boolean>;
  onLocalPatch: (id: string, payload: QCHandoffFormState) => void;
}) {
  const warning = needsCustomerUpdate(job);
  const garageSeed = useMemo(
    () =>
      [
        job.plate,
        job.vehicleYear,
        job.vehicleMake,
        job.vehicleModel,
        job.vehicleColor,
        (job as any).customerName || job.customer,
        (job as any).existingFwsAndShade || '',
      ].join('\u001f'),
    [
      job.plate,
      job.vehicleYear,
      job.vehicleMake,
      job.vehicleModel,
      job.vehicleColor,
      (job as any).customerName,
      job.customer,
      (job as any).existingFwsAndShade,
    ]
  );
  const [form, setForm] = useState<QCHandoffFormState>(() => sheetFromJob(job));
  const [saveUi, setSaveUi] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>('');

  useEffect(() => {
    const next = sheetFromJob(job);
    setForm(next);
    setSaveUi('idle');
    lastSentRef.current = JSON.stringify(next);
  }, [job.id, garageSeed]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const flushSave = (next: QCHandoffFormState) => {
    const serialized = JSON.stringify(next);
    if (serialized === lastSentRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      setSaveUi('saving');
      const ok = await onSave(job.id, next);
      if (ok) {
        lastSentRef.current = serialized;
        setSaveUi('saved');
        window.setTimeout(() => setSaveUi('idle'), 1800);
      } else {
        setSaveUi('idle');
      }
    }, 750);
  };

  const updateField = (key: keyof QCHandoffFormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      onLocalPatch(job.id, next);
      flushSave(next);
      return next;
    });
  };

  const row = (id: string, label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <div className="rounded-2xl bg-slate-50/80 px-3 py-2.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_4px_16px_-10px_rgba(15,23,42,0.06)]">
      <label htmlFor={id} className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={QC_HANDOFF_FIELD_CLASS}
        autoComplete="off"
      />
    </div>
  );

  return (
    <section className="qc-live-panel rounded-[30px] bg-white/95 p-4 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-800 shadow-[0_4px_14px_-6px_rgba(14,165,233,0.35)]">
            <UserCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Order info</p>
            <h3 className="mt-0.5 text-sm font-black text-slate-950">Handoff details</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              AutoSPF · window tinting QC · vehicle record
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 text-[10px] font-black uppercase tracking-[0.1em] ${
            saveUi === 'saving' ? 'text-slate-500' : saveUi === 'saved' ? 'text-emerald-600' : 'text-transparent'
          }`}
        >
          {saveUi === 'saving' ? 'Saving…' : saveUi === 'saved' ? 'Saved' : '·'}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {row('qc-handoff-client', 'Client name', form.clientName, (v) => updateField('clientName', v), 'Customer name')}
        {row('qc-handoff-date', 'Date', form.serviceDate, (v) => updateField('serviceDate', v), 'MM-DD-YY')}
        {row('qc-handoff-make', 'Make / model', form.makeModel, (v) => updateField('makeModel', v), 'Year make model (color)')}
        {row('qc-handoff-plate', 'Plate no.', form.plateNo, (v) => updateField('plateNo', v), 'Plate number')}
        {row(
          'qc-handoff-tint',
          'Tint shade installed',
          form.tintShadeInstalled,
          (v) => updateField('tintShadeInstalled', v),
          'Film / shade'
        )}
        {row('qc-handoff-installer', 'Installer', form.installer, (v) => updateField('installer', v), 'Technician name')}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50/75 px-3 py-2.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_4px_16px_-10px_rgba(15,23,42,0.05)]">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Customer visibility</p>
        <p className={`mt-1 text-sm font-black ${warning ? 'text-amber-600' : 'text-emerald-600'}`}>
          {warning ? 'Needs update' : 'Current'}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-slate-500">
          Est. completion: {(job as any).estimatedCompletion || 'End of service day'}
        </p>
      </div>

      {String((job as any).paymentStatus || '').toLowerCase() === 'paid' && (job as any).invoiceId ? (
        <div className="mt-3 rounded-2xl bg-emerald-50/90 px-3 py-2.5 shadow-[0_8px_22px_-10px_rgba(16,185,129,0.25)]">
          <p className="font-bold text-emerald-700 text-[10px] uppercase tracking-wide">Digital receipt</p>
          <p className="mt-1 font-mono text-[11px] font-black text-emerald-900">{String((job as any).invoiceId)}</p>
          <p className="mt-1 text-[10px] font-semibold text-emerald-700/80">POS payment recorded — customer tracker updated.</p>
        </div>
      ) : null}
    </section>
  );
}

function buildQCGateSummaryRows(validation: QCGateValidation) {
  return [
    {
      label: validation.plateValid ? 'Plate validated' : 'Plate not validated (4 digits)',
      passed: validation.plateValid,
    },
    {
      label: validation.thresholdMet
        ? `Threshold met (≥${QC_PASS_THRESHOLD}%)`
        : `Below ${QC_PASS_THRESHOLD}% threshold (${validation.score}%)`,
      passed: validation.thresholdMet,
    },
    {
      label: validation.allItemsChecked
        ? `All checklist items done (${validation.totalCount}/${validation.totalCount})`
        : `${validation.checkedCount}/${validation.totalCount} items done`,
      passed: validation.allItemsChecked,
    },
    {
      label: validation.photoAttached ? 'QC checklist photo attached' : 'QC photo required',
      passed: validation.photoAttached,
    },
  ];
}

function QCPlateValidationCard({
  plateValue,
  onPlateChange,
  validation,
}: {
  plateValue: string;
  onPlateChange: (value: string) => void;
  validation: QCGateValidation;
}) {
  const plateStateClass = validation.plateValid
    ? 'bg-emerald-50/85 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_8px_24px_-10px_rgba(16,185,129,0.35)]'
    : 'bg-rose-50/85 text-rose-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_24px_-10px_rgba(244,63,94,0.28)]';

  return (
    <section className="qc-live-panel rounded-[30px] bg-white/95 p-4 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Plate number</p>
      <h3 className="mt-1 text-sm font-black text-slate-950">Validation</h3>
      <label htmlFor="qc-plate-input-aside" className="mt-3 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        4-digit plate
      </label>
      <div className="relative mt-2">
        <input
          id="qc-plate-input-aside"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={plateValue}
          onChange={(event) => onPlateChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Last 4 digits"
          className={`h-11 w-full rounded-2xl border-0 px-3 pr-10 text-base font-black tracking-[0.18em] outline-none transition focus-visible:ring-4 focus-visible:ring-violet-200/80 ${plateStateClass}`}
          aria-describedby="qc-plate-aside-msg"
        />
        <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${validation.plateValid ? 'text-emerald-600' : 'text-rose-500'}`}>
          {validation.plateValid ? <CheckCircle2 className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </span>
      </div>
      <p id="qc-plate-aside-msg" className={`mt-2 text-[11px] font-black ${validation.plateValid ? 'text-emerald-700' : 'text-rose-600'}`}>
        {validation.plateValid ? 'Valid — 4 numeric digits' : 'Enter exactly 4 numeric digits'}
      </p>
    </section>
  );
}

function QCValidationSummaryCard({ validation }: { validation: QCGateValidation }) {
  const rows = buildQCGateSummaryRows(validation);
  return (
    <section className="qc-live-panel rounded-[30px] bg-white/95 p-4 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Validation summary</p>
      <h3 className="mt-1 text-sm font-black text-slate-950">Gate readiness</h3>
      <div className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-2.5 text-xs font-black leading-snug text-slate-800">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                row.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
              }`}
            >
              {row.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">{row.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QCGateChecklistPanel({
  checklistHeading,
  checkedIds,
  onToggleItem,
  validation,
}: {
  checklistHeading: string;
  checkedIds: Set<string>;
  onToggleItem: (id: string) => void;
  validation: QCGateValidation;
}) {
  const scoreColor = validation.thresholdMet ? 'bg-emerald-500' : 'bg-rose-500';
  const scoreText = validation.thresholdMet ? 'text-emerald-700' : 'text-rose-600';

  return (
    <div className="mt-5 rounded-[30px] bg-white/95 p-5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.14),0_10px_32px_-16px_rgba(15,23,42,0.09)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Quality control checkpoints</p>
          <h4 className="mt-1 text-lg font-black tracking-tight text-slate-950">{checklistHeading}</h4>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-white tabular-nums">
            {validation.checkedCount}/{validation.totalCount} complete
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
              validation.ready
                ? 'bg-emerald-50 text-emerald-700 shadow-[0_4px_14px_-6px_rgba(16,185,129,0.35)]'
                : 'bg-rose-50 text-rose-700 shadow-[0_4px_14px_-6px_rgba(244,63,94,0.3)]'
            }`}
          >
            {validation.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {validation.ready ? 'Ready to advance' : 'Gate locked'}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50/90 p-4 shadow-[inset_0_2px_6px_rgba(255,255,255,0.75),0_6px_20px_-12px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={`text-4xl font-black tabular-nums leading-none ${scoreText}`}>{validation.score}%</p>
            <p className="mt-2 text-[11px] font-bold text-slate-500">QC completion score</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
              validation.thresholdMet
                ? 'bg-emerald-50 text-emerald-700 shadow-[0_3px_10px_-4px_rgba(16,185,129,0.35)]'
                : 'bg-rose-50 text-rose-700 shadow-[0_3px_10px_-4px_rgba(244,63,94,0.3)]'
            }`}
          >
            {validation.thresholdMet ? 'Above threshold' : 'Below threshold'}
          </span>
        </div>
        <div className="relative mt-4 pt-6">
          <span
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-amber-500 px-2 py-1 text-[9px] font-black uppercase tracking-[0.06em] text-white shadow-sm"
            style={{ left: `${QC_PASS_THRESHOLD}%` }}
            title={`Minimum ${QC_PASS_THRESHOLD}% of checklist items must pass`}
          >
            Minimum required: {QC_PASS_THRESHOLD}%
          </span>
          <div className="relative h-3.5 rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-all ${scoreColor}`} style={{ width: `${validation.score}%` }} />
            <span
              className="absolute -top-0.5 z-[1] h-5 w-1 -translate-x-1/2 rounded-full bg-amber-500 shadow-[0_0_0_2px_rgba(255,255,255,0.95)]"
              style={{ left: `${QC_PASS_THRESHOLD}%` }}
              aria-hidden
            />
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
          <span className="tabular-nums">
            {validation.checkedCount}/{validation.totalCount} checklist items
          </span>
          <span>Target ≥ {QC_PASS_THRESHOLD}%</span>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {QC_CHECKLIST_SECTIONS.map((section, sectionIndex) => {
          const passLabel = section.outcomeLabels.pass;
          const failLabel = section.outcomeLabels.fail;
          return (
            <div key={section.title} className="space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                {sectionIndex + 1}. {section.title}
              </p>
              <div className="space-y-2">
                <div
                  className="grid items-center gap-2 px-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 52px 52px' }}
                >
                  <span className="pl-0.5">Item</span>
                  <span className="text-center">{passLabel}</span>
                  <span className="text-center">{failLabel}</span>
                </div>
                {section.items.map((label, itemIndex) => {
                  const id = `${sectionIndex}-${itemIndex}`;
                  const checked = checkedIds.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onToggleItem(id)}
                      aria-pressed={checked}
                      className={`grid w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left shadow-[0_6px_20px_-12px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] transition ${
                        checked
                          ? 'bg-emerald-50/90 text-slate-950 hover:bg-emerald-50'
                          : 'bg-white/95 text-slate-800 hover:bg-rose-50/40'
                      }`}
                      style={{ gridTemplateColumns: 'minmax(0,1fr) 52px 52px' }}
                    >
                      <span className="min-w-0 text-sm font-bold leading-snug">{label}</span>
                      <span className="flex justify-center" aria-hidden={!checked}>
                        {checked ? (
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_2px_10px_-2px_rgba(16,185,129,0.45)]">
                            <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span className="h-8 w-8 rounded-xl bg-slate-100/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]" />
                        )}
                      </span>
                      <span className="flex justify-center" aria-hidden={checked}>
                        {!checked ? (
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100/95 text-rose-600 shadow-[0_2px_10px_-2px_rgba(244,63,94,0.2)]">
                            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span className="h-8 w-8 rounded-xl bg-slate-100/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CurrentGateCard({
  job,
  detailsLoading,
  viewerIsQualityChecker,
  qcCheckedIds,
  onToggleQcItem,
  qcValidation,
  onUploadStagePhoto,
  onDeleteTrackerStagePhoto,
  onLocalStageMedia,
  onUploadInteractionChange,
  readOnly = false,
}: {
  job: QCJob;
  detailsLoading?: boolean;
  viewerIsQualityChecker: boolean;
  qcCheckedIds: Set<string>;
  onToggleQcItem: (id: string) => void;
  qcValidation: QCGateValidation;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null },
    opts?: { skipJobsRefresh?: boolean }
  ) => Promise<QCStagePhotoUploadResult>;
  onDeleteTrackerStagePhoto: (
    orderId: string,
    payload: { stage: string; slot: string },
    opts?: { skipJobsRefresh?: boolean }
  ) => Promise<boolean>;
  onLocalStageMedia: (id: string, media: TrackerMedia) => void;
  onUploadInteractionChange?: (active: boolean) => void;
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimersRef = useRef<Partial<Record<string, ReturnType<typeof setTimeout>>>>({});
  const filePickerFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePickerFocusListenerRef = useRef<(() => void) | null>(null);
  const pendingSlotRef = useRef<StaffGateSlotKey | null>(null);
  const inFlightSlotsRef = useRef<Partial<Record<string, boolean>>>({});
  const previewUrlsRef = useRef<Partial<Record<string, string>>>({});
  const uploadInteractionHeldRef = useRef(false);
  const [pendingSlot, setPendingSlot] = useState<StaffGateSlotKey | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<string, string>>>({});
  const [uploadingSlots, setUploadingSlots] = useState<Partial<Record<string, boolean>>>({});
  const [removingSlots, setRemovingSlots] = useState<Partial<Record<string, boolean>>>({});
  const [successfulSlots, setSuccessfulSlots] = useState<Partial<Record<string, boolean>>>({});

  const tracker = getTrackerState(job);
  const mediaList = getMediaList(job);
  const currentStage = tracker.currentGate.id;
  const GateIcon = tracker.currentGate.Icon;
  const filledCount = countFilledGateSlots(mediaList, currentStage);
  const requiredForGate = requiredSlotsCountForGate(currentStage, viewerIsQualityChecker);
  const gateTitle = `${tracker.currentGate.label.toUpperCase()} — Gate ${tracker.activeIndex + 1} of ${TRACKER_GATES.length}`;
  /** Gate index is already shown in `gateTitle` above — avoid repeating "Gate X of Y" here. */
  const qcChecklistHeading = 'QC Checklist';
  const slotRows = orderedStaffGateSlots(currentStage, viewerIsQualityChecker);

  const clearFilePickerFallback = useCallback(() => {
    if (filePickerFallbackTimerRef.current) {
      clearTimeout(filePickerFallbackTimerRef.current);
      filePickerFallbackTimerRef.current = null;
    }
    if (filePickerFocusListenerRef.current) {
      window.removeEventListener('focus', filePickerFocusListenerRef.current);
      filePickerFocusListenerRef.current = null;
    }
  }, []);

  const beginUploadInteraction = useCallback(() => {
    if (uploadInteractionHeldRef.current) return;
    uploadInteractionHeldRef.current = true;
    onUploadInteractionChange?.(true);
  }, [onUploadInteractionChange]);

  const endUploadInteraction = useCallback(() => {
    if (!uploadInteractionHeldRef.current) return;
    uploadInteractionHeldRef.current = false;
    onUploadInteractionChange?.(false);
  }, [onUploadInteractionChange]);

  const setSlotPreview = useCallback((slot: StaffGateSlotKey, nextUrl?: string) => {
    const previousUrl = previewUrlsRef.current[slot];
    if (previousUrl && previousUrl !== nextUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    if (nextUrl) {
      previewUrlsRef.current = { ...previewUrlsRef.current, [slot]: nextUrl };
    } else {
      const next = { ...previewUrlsRef.current };
      delete next[slot];
      previewUrlsRef.current = next;
    }
    setPreviewUrls(previewUrlsRef.current);
  }, []);

  useEffect(() => {
    Object.values(previewUrlsRef.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    previewUrlsRef.current = {};
    inFlightSlotsRef.current = {};
    pendingSlotRef.current = null;
    setPreviewUrls({});
    setUploadingSlots({});
    setPendingSlot(null);
    clearFilePickerFallback();
    endUploadInteraction();
  }, [clearFilePickerFallback, currentStage, endUploadInteraction, job.id]);

  useEffect(() => {
    return () => {
      Object.values(successTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      Object.values(previewUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      previewUrlsRef.current = {};
      inFlightSlotsRef.current = {};
      clearFilePickerFallback();
      endUploadInteraction();
    };
  }, [clearFilePickerFallback, endUploadInteraction]);

  const clearSlotSuccess = (slot: StaffGateSlotKey) => {
    const timer = successTimersRef.current[slot];
    if (timer) clearTimeout(timer);
    delete successTimersRef.current[slot];
    setSuccessfulSlots((current) => {
      if (!current[slot]) return current;
      const next = { ...current };
      delete next[slot];
      return next;
    });
  };

  const markSlotSuccess = (slot: StaffGateSlotKey) => {
    clearSlotSuccess(slot);
    setSuccessfulSlots((current) => ({ ...current, [slot]: true }));
    successTimersRef.current[slot] = setTimeout(() => {
      setSuccessfulSlots((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      delete successTimersRef.current[slot];
    }, 1800);
  };

  const triggerUpload = (slot: StaffGateSlotKey) => {
    if (pendingSlotRef.current || inFlightSlotsRef.current[slot]) return;
    clearFilePickerFallback();
    pendingSlotRef.current = slot;
    setPendingSlot(slot);
    beginUploadInteraction();
    const clearAfterPickerReturns = () => {
      filePickerFocusListenerRef.current = null;
      filePickerFallbackTimerRef.current = setTimeout(() => {
        if (pendingSlotRef.current !== slot) return;
        pendingSlotRef.current = null;
        setPendingSlot(null);
        endUploadInteraction();
      }, 8000);
    };
    filePickerFocusListenerRef.current = clearAfterPickerReturns;
    window.addEventListener('focus', clearAfterPickerReturns, { once: true });
    requestAnimationFrame(() => inputRef.current?.click());
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    clearFilePickerFallback();
    const file = event.target.files?.[0];
    event.target.value = '';
    const slot = pendingSlotRef.current || pendingSlot;
    pendingSlotRef.current = null;
    setPendingSlot(null);
    if (!file || !slot) {
      endUploadInteraction();
      return;
    }
    if (inFlightSlotsRef.current[slot]) {
      endUploadInteraction();
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    inFlightSlotsRef.current[slot] = true;
    setSlotPreview(slot, previewUrl);
    setUploadingSlots((current) => ({ ...current, [slot]: true }));

    let result: QCStagePhotoUploadResult = { success: false };
    try {
      await waitForNextPaint();
      result = await onUploadStagePhoto(
        job.id,
        { stage: currentStage, slot, file },
        { skipJobsRefresh: true }
      );
    } catch {
      result = { success: false };
    } finally {
      delete inFlightSlotsRef.current[slot];
      setUploadingSlots((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      endUploadInteraction();
    }

    if (!result.success) {
      setSlotPreview(slot);
      return;
    }

    markSlotSuccess(slot);
  };

  const removeSlot = async (slot: StaffGateSlotKey) => {
    clearSlotSuccess(slot);
    setRemovingSlots((current) => ({ ...current, [slot]: true }));
    try {
      const ok = await onDeleteTrackerStagePhoto(job.id, { stage: currentStage, slot });
      if (ok) {
        setSlotPreview(slot);
        onLocalStageMedia(job.id, { stage: currentStage, slot, photoUrl: '' });
      }
    } finally {
      setRemovingSlots((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
    }
  };

  return (
    <section className="qc-live-panel rounded-[32px] bg-white/95 p-5 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      {!readOnly ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelected}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <GateIcon className="h-3.5 w-3.5" />
            {readOnly ? 'Released evidence' : 'Current gate'}
          </div>
          <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">{gateTitle}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{tracker.currentGate.sub}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <span className="inline-flex w-fit items-center gap-1.5 self-end rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white tabular-nums">
            <ImageIcon className="h-3.5 w-3.5 opacity-90" strokeWidth={2} />
            {requiredForGate} photos required
          </span>
          {viewerIsQualityChecker && currentStage === 'received' ? (
            <span className="inline-flex w-fit self-end rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-800 shadow-[0_4px_14px_-6px_rgba(245,158,11,0.35)]">
              +1 new slot
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
        <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden />
        <span className="tabular-nums text-slate-700">
          {filledCount}/{requiredForGate} uploaded
        </span>
      </div>

      {viewerIsQualityChecker && currentStage === 'received' ? (
        <div className="mt-4 flex gap-3 rounded-2xl bg-amber-50/95 px-4 py-3 text-amber-950 shadow-[0_10px_28px_-12px_rgba(234,88,12,0.2),inset_0_1px_0_rgba(255,255,255,0.85)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2.5} aria-hidden />
          <p className="text-xs font-semibold leading-snug text-amber-950/90">
            <span className="font-black">Pre-assessment form required</span> — Slot 6 is for the signed exterior vehicle
            checklist. Take a clear photo of the completed form before proceeding.
          </p>
        </div>
      ) : null}

      {currentStage === 'quality_check' ? (
        <div className="mt-4 flex gap-3 rounded-2xl bg-violet-50/95 px-4 py-3 text-violet-950 shadow-[0_10px_28px_-12px_rgba(139,92,246,0.18),inset_0_1px_0_rgba(255,255,255,0.88)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" strokeWidth={2.5} aria-hidden />
          <p className="text-xs font-semibold leading-snug text-violet-950/90">
            <span className="font-black">QC form / checklist</span> — One clear photo of the completed QC checklist or
            signed final inspection before advancing this gate.
          </p>
        </div>
      ) : null}

      {currentStage === 'quality_check' && viewerIsQualityChecker ? (
        <QCGateChecklistPanel
          checklistHeading={qcChecklistHeading}
          checkedIds={qcCheckedIds}
          onToggleItem={onToggleQcItem}
          validation={qcValidation}
        />
      ) : null}

      <div
        className={
          currentStage === 'quality_check'
            ? 'mt-5 flex justify-center gap-3'
            : 'mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3'
        }
      >
        {slotRows.map((slot) => {
          const isChecklist = slot === TRACKER_PREASSESSMENT_SLOT_KEY;
          const isQcForm = slot === TRACKER_QC_FORM_SLOT_KEY;
          const entry = getMediaForSlot(mediaList, currentStage, slot);
          const filled = mediaRepresentsSavedPhoto(entry);
          const previewUrl = previewUrls[slot];
          const displayUrl = previewUrl || String(entry?.photoUrl || '').trim();
          const canRenderImage = Boolean(displayUrl);
          const hasVisual = filled || Boolean(previewUrl);
          const uploading = !!uploadingSlots[slot];
          const removing = !!removingSlots[slot];
          const saved = !!successfulSlots[slot];
          const busy = uploading || removing;
          const prompt = slotPromptForStaffGateSlot(currentStage, slot);
          const shortLabel = isChecklist
            ? PREASSESSMENT_SLOT_SHORT
            : isQcForm
              ? QC_FORM_SLOT_SHORT
              : TRACKER_PHOTO_SLOT_SHORT[slot as TrackerPhotoSlotKey];
          const shellClass = isChecklist
            ? 'flex flex-col overflow-hidden rounded-[24px] bg-amber-50/45 shadow-[0_14px_36px_-14px_rgba(234,88,12,0.22),inset_0_1px_0_rgba(255,255,255,0.92)]'
            : isQcForm
              ? 'flex flex-col overflow-hidden rounded-[24px] bg-violet-50/45 shadow-[0_14px_36px_-14px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(255,255,255,0.92)]'
              : 'flex flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_10px_32px_-14px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.95)]';
          const qcTileWidth = currentStage === 'quality_check' && isQcForm ? ' w-full max-w-md' : '';
          return (
            <div id={`qc-evidence-${job.id}-${slot}`} key={slot} className={`${shellClass}${qcTileWidth} scroll-mt-5`}>
              <div
                className={`flex items-center justify-between gap-1 px-2.5 py-1.5 ${
                  isChecklist ? 'bg-amber-50/95' : isQcForm ? 'bg-violet-50/95' : 'bg-slate-50/95'
                }`}
              >
                <div className="min-w-0">
                  {isChecklist ? (
                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-700">Pre-assessment form</p>
                  ) : isQcForm ? (
                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-violet-700">QC form / checklist</p>
                  ) : null}
                  <span
                    className={`block truncate text-[9px] font-black uppercase tracking-[0.1em] ${
                      isChecklist ? 'text-amber-800' : isQcForm ? 'text-violet-800' : 'text-slate-500'
                    }`}
                  >
                    {shortLabel}
                  </span>
                </div>
                {filled && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => removeSlot(slot)}
                    disabled={busy}
                    className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    aria-label={`Remove ${slot} photo`}
                  >
                    {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  </button>
                ) : null}
              </div>
              {hasVisual ? (
                <div className="relative aspect-[4/3] w-full">
                  {canRenderImage ? (
                    <img src={displayUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 px-3 text-center text-slate-500">
                      {detailsLoading ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                      ) : (
                        <ImageIcon className="h-7 w-7" strokeWidth={1.75} />
                      )}
                      <span className="text-[10px] font-bold leading-snug text-slate-500">
                        {detailsLoading ? 'Loading saved photo...' : 'Photo saved'}
                      </span>
                    </div>
                  )}
                  {uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 text-white">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : null}
                  {saved ? (
                    <div
                      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white shadow-[0_8px_18px_-8px_rgba(16,185,129,0.8)]"
                      aria-live="polite"
                    >
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                      Saved
                    </div>
                  ) : null}
                </div>
              ) : readOnly ? (
                <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-50/80 px-2 text-center text-slate-500 shadow-[inset_0_2px_12px_rgba(15,23,42,0.05)]">
                  <ImageIcon className="h-7 w-7" strokeWidth={1.5} />
                  <span className="px-1 text-center text-[10px] font-bold leading-snug">No photo was saved</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => triggerUpload(slot)}
                  disabled={busy}
                  className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-b-[18px] px-2 shadow-[inset_0_2px_12px_rgba(15,23,42,0.05)] transition disabled:opacity-45 ${
                    isChecklist
                      ? 'bg-amber-50/80 text-amber-800 hover:bg-amber-50 hover:shadow-[inset_0_2px_14px_rgba(234,88,12,0.12)]'
                      : isQcForm
                        ? 'bg-violet-50/80 text-violet-900 hover:bg-violet-50 hover:shadow-[inset_0_2px_14px_rgba(139,92,246,0.12)]'
                        : 'bg-slate-50/80 text-slate-500 hover:bg-slate-50 hover:shadow-[inset_0_2px_14px_rgba(37,99,235,0.08)] hover:text-slate-800'
                  }`}
                >
                  {busy ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : isChecklist ? (
                    <FileCheck className="h-7 w-7 text-amber-600" strokeWidth={1.75} />
                  ) : isQcForm ? (
                    <FileCheck className="h-7 w-7 text-violet-600" strokeWidth={1.75} />
                  ) : (
                    <UploadCloud className="h-7 w-7" strokeWidth={1.5} />
                  )}
                  <span
                    className={`px-1 text-center text-[10px] font-bold leading-snug ${
                      isChecklist ? 'text-amber-800/95' : isQcForm ? 'text-violet-900/95' : 'text-slate-500'
                    }`}
                  >
                    {prompt}
                  </span>
                </button>
              )}
              {filled ? (
                <p
                  className={`line-clamp-2 px-2 py-1.5 text-[10px] font-semibold leading-snug ${
                    isChecklist ? 'bg-amber-50/85 text-amber-900/90' : isQcForm ? 'bg-violet-50/85 text-violet-900/90' : 'bg-slate-50/80 text-slate-500'
                  }`}
                >
                  {prompt}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {readOnly
            ? 'Released evidence is read-only'
            : `All ${requiredForGate} photo${requiredForGate === 1 ? '' : 's'} required before advancing this gate`}
        </p>
      </div>
    </section>
  );
}

function GateActionBar({
  onOpenPosQueue,
  job,
  viewerIsQualityChecker,
  qcValidation,
  onAdvance,
  onLocalStageUpdate,
}: {
  job: QCJob;
  viewerIsQualityChecker: boolean;
  qcValidation: QCGateValidation;
  onOpenPosQueue?: () => void;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onLocalStageUpdate: (id: string, stage: ServiceStage) => void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const tracker = getTrackerState(job);
  const mediaList = getMediaList(job);
  const currentStage = tracker.currentGate.id;
  const needCurrent = requiredSlotsCountForGate(currentStage, viewerIsQualityChecker);
  const gateReady = gateHasAllSlots(mediaList, currentStage, viewerIsQualityChecker);
  const isQcGate = viewerIsQualityChecker && currentStage === 'quality_check' && !tracker.isComplete;
  const canAdvanceCurrentGate = isQcGate ? qcValidation.ready : gateReady;
  const readyPickupComplete = gateHasAllSlots(mediaList, 'ready_pickup', false);
  const canRelease = tracker.isComplete && !tracker.isReleased;
  const posPaymentDone = String((job as any).paymentStatus || '').toLowerCase() === 'paid';
  const nextPipelineStage = getNextPipelineServiceStage(job);
  const advanceLabel =
    !nextPipelineStage || tracker.isComplete
      ? 'Complete gate & mark Ready for Pickup'
      : `Complete gate & advance to ${displayNameForPipelineStage(nextPipelineStage)}`;
  const lockedAdvanceLabel = isQcGate
    ? 'Complete QC requirements to advance'
    : `Upload all ${needCurrent} photos to advance`;

  const advanceGate = async () => {
    if (isQcGate && !qcValidation.ready) {
      toast.error('Complete QC requirements before advancing', {
        description: `Missing ${qcValidation.missing.join(', ')}.`,
      });
      return;
    }

    if (!tracker.isComplete && !gateReady) {
      toast.error(`Upload all ${needCurrent} photos to advance`, {
        description: `${tracker.currentGate.label} requires ${needCurrent} photo${needCurrent === 1 ? '' : 's'} before this gate can be completed.`,
      });
      return;
    }

    if (tracker.isComplete && !readyPickupComplete && !tracker.isReleased) {
      toast.error('Upload all 5 photos to advance', {
        description: 'Ready for Pickup requires five final photos before the vehicle can be marked released.',
      });
      return;
    }

    if (tracker.isComplete && readyPickupComplete && !tracker.isReleased && !posPaymentDone) {
      toast.error('POS payment required', {
        description: 'Collect the full balance in Sales POS before releasing the vehicle to the customer.',
      });
      return;
    }

    setAdvancing(true);
    const nextFromPipeline = getNextPipelineServiceStage(job);
    const target = tracker.isComplete
      ? ('released' as ServiceStage)
      : ((nextFromPipeline || currentStage) as ServiceStage);
    const ok = await onAdvance(job.id, target);
    if (ok) onLocalStageUpdate(job.id, target);
    setAdvancing(false);
  };

  return (
    <div className="sticky bottom-0 z-20 shrink-0 bg-white/90 px-6 py-4 shadow-[0_-18px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      {tracker.isComplete && !tracker.isReleased ? <div className="mb-3"><QCPaymentHandoff job={job} /></div> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-slate-400">Gate action</p>
          <p className="truncate text-sm font-black text-slate-950">
            {tracker.isReleased ? 'Customer Handover Completed' : tracker.isComplete ? posPaymentDone ? 'Ready for Customer Handover' : 'Ready for Pickup' : tracker.currentGate.label}
          </p>
          {isQcGate ? (
            <p className={`mt-1 text-xs font-bold leading-snug ${qcValidation.ready ? 'text-emerald-600' : 'text-rose-600'}`}>
              {qcValidation.ready
                ? 'Plate, checklist, threshold, and QC photo verified.'
                : `Cannot advance — missing: ${qcValidation.missing.join('; ')}.`}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {tracker.isComplete && !tracker.isReleased && !posPaymentDone && readyPickupComplete && onOpenPosQueue ? (
            <button type="button" onClick={onOpenPosQueue} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200">Open POS Payment Queue <ArrowUpRight className="h-4 w-4" /></button>
          ) : tracker.isComplete ? (
            <button
              type="button"
              onClick={() => advanceGate()}
              disabled={advancing || tracker.isReleased || !readyPickupComplete || !posPaymentDone}
              className={`inline-flex h-11 min-w-[220px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition disabled:opacity-50 ${
                tracker.isReleased
                  ? 'bg-slate-100 text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]'
                  : readyPickupComplete && posPaymentDone
                    ? 'bg-[#E8650A] text-white shadow-md hover:opacity-95'
                    : 'bg-slate-200 text-slate-500 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.12)]'
              }`}
            >
              {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {canRelease
                ? posPaymentDone
                  ? 'Complete Customer Handover'
                  : readyPickupComplete ? 'Awaiting POS Payment' : 'Complete final pickup evidence'
                : 'Vehicle released'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => advanceGate()}
              disabled={advancing || !canAdvanceCurrentGate}
              className={`inline-flex h-11 min-w-[280px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition disabled:opacity-50 ${
                canAdvanceCurrentGate
                  ? 'bg-[#E8650A] text-white shadow-md hover:opacity-95'
                  : 'bg-slate-200 text-slate-500 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.12)]'
              }`}
            >
              {advancing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : canAdvanceCurrentGate ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {canAdvanceCurrentGate ? advanceLabel : lockedAdvanceLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShopFloorLogCard({
  job,
  onAddStaffNote,
  onLocalStaffNote,
}: {
  job: QCJob;
  onAddStaffNote: (orderId: string, content: string) => Promise<boolean>;
  onLocalStaffNote: (id: string, content: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const updates = useMemo(() => buildShopFloorUpdates(job), [job]);

  const submitUpdate = async () => {
    if (!noteDraft.trim()) return;
    setPosting(true);
    const content = noteDraft.trim();
    const ok = await onAddStaffNote(job.id, content);
    if (ok) {
      onLocalStaffNote(job.id, content);
      setNoteDraft('');
    }
    setPosting(false);
  };

  return (
    <section className="qc-live-panel rounded-[32px] bg-white/95 p-5 shadow-[0_20px_50px_-22px_rgba(15,23,42,0.11),0_8px_24px_-12px_rgba(15,23,42,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Shop floor log
          </div>
          <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Latest service updates</h3>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
          {updates.length} entries
        </span>
      </div>

      <div className="mt-4 rounded-[26px] bg-slate-50/90 p-3 shadow-[inset_0_2px_12px_rgba(15,23,42,0.04)]">
        <label className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Post update</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={2}
            placeholder="Add a concise shop-floor update"
            className="min-h-[44px] flex-1 resize-none rounded-2xl bg-white px-3 py-2 text-sm text-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.06)] placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={submitUpdate}
            disabled={posting || !noteDraft.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-slate-800 disabled:opacity-45"
          >
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Post update
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {updates.length === 0 ? (
          <div className="rounded-[26px] bg-slate-50/90 px-4 py-8 text-center shadow-[inset_0_2px_16px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-black text-slate-700">No updates posted yet.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Service notes will appear here chronologically.</p>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="rounded-[26px] bg-slate-50/80 px-4 py-3 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.07)]">
              <p className="text-sm font-bold leading-snug text-slate-900">{update.content}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {update.author} - {relTime(update.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type SelectedOrderPanelProps = {
  job: QCJob;
  detailsLoading?: boolean;
  viewerIsQualityChecker: boolean;
  onOpenPosQueue?: () => void;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null },
    opts?: { skipJobsRefresh?: boolean }
  ) => Promise<QCStagePhotoUploadResult>;
  onDeleteTrackerStagePhoto: (
    orderId: string,
    payload: { stage: string; slot: string },
    opts?: { skipJobsRefresh?: boolean }
  ) => Promise<boolean>;
  onAddStaffNote: (orderId: string, content: string) => Promise<boolean>;
  onLocalStageUpdate: (id: string, stage: ServiceStage) => void;
  onLocalStageMedia: (id: string, media: TrackerMedia) => void;
  onLocalStaffNote: (id: string, content: string) => void;
  onSaveQCHandoffSheet: (id: string, payload: QCHandoffFormState) => Promise<boolean>;
  onLocalHandoffPatch: (id: string, payload: QCHandoffFormState) => void;
  onPersistQcChecklist?: (
    orderId: string,
    items: { item: string; passed: boolean; note?: string }[]
  ) => Promise<boolean>;
  onClose?: () => void;
  onUploadInteractionChange?: (active: boolean) => void;
  notificationTarget?: QCLiveTrackerDeepLink | null;
  titleId?: string;
};

function SelectedOrderPanel({
  onOpenPosQueue,
  job,
  detailsLoading,
  viewerIsQualityChecker,
  onAdvance,
  onUploadStagePhoto,
  onDeleteTrackerStagePhoto,
  onAddStaffNote,
  onLocalStageUpdate,
  onLocalStageMedia,
  onLocalStaffNote,
  onSaveQCHandoffSheet,
  onLocalHandoffPatch,
  onPersistQcChecklist,
  onClose,
  onUploadInteractionChange,
  notificationTarget,
  titleId,
}: SelectedOrderPanelProps) {
  const tracker = getTrackerState(job);
  const warning = needsCustomerUpdate(job);
  const vehicleDisplay = formatVehicle(job);
  const serviceDisplay = formatService(job);
  const mediaList = getMediaList(job);
  const [reviewedGateId, setReviewedGateId] = useState<ServiceStage>(() => tracker.currentGate.id);
  const reviewedGate = TRACKER_GATES.find((gate) => gate.id === reviewedGateId) || tracker.currentGate;
  const reviewingHistoricalGate = reviewedGate.id !== tracker.currentGate.id;
  const plateAutoSeed = useMemo(
    () => deriveQcFourDigitPlate(job),
    [job.id, job.plate, String((job as any).qcHandoffSheet?.plateNo ?? '').trim()]
  );
  const [qcPlateValue, setQcPlateValue] = useState(() => plateAutoSeed);
  const qcPlateManualRef = useRef(false);

  useEffect(() => {
    qcPlateManualRef.current = false;
  }, [job.id]);

  useEffect(() => {
    if (qcPlateManualRef.current) return;
    setQcPlateValue(plateAutoSeed);
  }, [job.id, plateAutoSeed]);

  useEffect(() => {
    setReviewedGateId(tracker.currentGate.id);
  }, [job.id, tracker.currentGate.id]);

  useEffect(() => {
    if (!notificationTarget || notificationTarget.jobId !== job.id) return;
    const requestedStage = String(notificationTarget.stage || '').trim() as ServiceStage;
    const targetIndex = TRACKER_GATES.findIndex((gate) => gate.id === requestedStage);
    if (
      targetIndex >= 0
      && (targetIndex <= tracker.completedIndex || targetIndex === tracker.activeIndex)
    ) {
      setReviewedGateId(requestedStage);
    }
    const focusId = notificationTarget.slot
      ? `qc-evidence-${job.id}-${notificationTarget.slot}`
      : `qc-evidence-${job.id}`;
    const timer = window.setTimeout(() => {
      document.getElementById(focusId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [job.id, notificationTarget, tracker.activeIndex, tracker.completedIndex]);

  const handleSelectGate = useCallback(
    (gateId: ServiceStage) => {
      const targetIndex = TRACKER_GATES.findIndex((gate) => gate.id === gateId);
      const isReviewable =
        targetIndex >= 0 &&
        (targetIndex <= tracker.completedIndex || targetIndex === tracker.activeIndex);
      if (isReviewable) setReviewedGateId(gateId);
    },
    [tracker.activeIndex, tracker.completedIndex]
  );

  const [qcCheckedIds, setQcCheckedIds] = useState<Set<string>>(() => new Set());
  const qcCheckedIdsRef = useRef<Set<string>>(qcCheckedIds);
  const qcPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qcChecklistDirtyRef = useRef(false);
  const onPersistQcChecklistRef = useRef(onPersistQcChecklist);
  onPersistQcChecklistRef.current = onPersistQcChecklist;

  useEffect(() => {
    const cached = qcChecklistUiCache.get(job.id);
    const raw = (job as any).qcChecklist;
    const fromServer = qcChecklistRowsToCheckedSet(raw);
    const initial =
      cached && cached.size >= fromServer.size ? new Set(cached) : new Set(fromServer);
    qcChecklistUiCache.set(job.id, initial);
    qcChecklistDirtyRef.current = false;
    qcCheckedIdsRef.current = initial;
    setQcCheckedIds(initial);
  }, [job.id]);

  useEffect(() => {
    qcCheckedIdsRef.current = qcCheckedIds;
  }, [qcCheckedIds]);

  const flushQcChecklistPersist = useCallback(() => {
    if (qcPersistTimerRef.current) {
      clearTimeout(qcPersistTimerRef.current);
      qcPersistTimerRef.current = null;
    }
    const persist = onPersistQcChecklistRef.current;
    if (!persist) return;
    void persist(job.id, checkedSetToQcChecklistPayload(qcCheckedIdsRef.current));
  }, [job.id]);

  const scheduleQcChecklistPersist = useCallback(() => {
    if (!onPersistQcChecklistRef.current) return;
    if (qcPersistTimerRef.current) clearTimeout(qcPersistTimerRef.current);
    qcPersistTimerRef.current = setTimeout(() => {
      qcPersistTimerRef.current = null;
      flushQcChecklistPersist();
    }, 800);
  }, [flushQcChecklistPersist]);

  useEffect(() => {
    return () => {
      if (qcPersistTimerRef.current) {
        clearTimeout(qcPersistTimerRef.current);
        qcPersistTimerRef.current = null;
      }
      const persist = onPersistQcChecklistRef.current;
      if (persist && qcChecklistDirtyRef.current) {
        void persist(job.id, checkedSetToQcChecklistPayload(qcCheckedIdsRef.current));
      }
    };
  }, [job.id]);

  const qcValidation = useMemo(
    () => buildQCGateValidation(qcPlateValue, qcCheckedIds, mediaList),
    [qcCheckedIds, mediaList, qcPlateValue]
  );

  const handleQcPlateChange = useCallback((value: string) => {
    qcPlateManualRef.current = true;
    setQcPlateValue(value.replace(/\D/g, '').slice(0, 4));
  }, []);

  const handleToggleQcItem = useCallback(
    (itemId: string) => {
      qcChecklistDirtyRef.current = true;
      setQcCheckedIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        qcCheckedIdsRef.current = next;
        qcChecklistUiCache.set(job.id, next);
        scheduleQcChecklistPersist();
        return next;
      });
    },
    [scheduleQcChecklistPersist]
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[36px] bg-gradient-to-b from-slate-50/70 via-white to-slate-50/70">
      <div className="shrink-0 bg-white/80 px-6 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.035)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{job.jobId}</p>
            <h2 id={titleId} className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">{formatCustomer(job.customer)}</h2>
            <p className="mt-1 truncate text-sm font-bold text-slate-600">{vehicleDisplay}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">{serviceDisplay}</p>
          </div>

          <div className="flex items-start gap-3 xl:justify-end">
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 shadow-[0_4px_14px_-6px_rgba(16,185,129,0.3)]">
                <Wifi className="h-3.5 w-3.5" />
                Live
              </span>
              {warning ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 shadow-[0_4px_14px_-6px_rgba(245,158,11,0.35)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Needs Customer Update
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 shadow-[0_4px_14px_-6px_rgba(59,130,246,0.28)]">
                <span className={`h-2 w-2 rounded-full ${tracker.currentGate.dotClass}`} />
                {tracker.currentGate.label}
              </span>
              <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-black tabular-nums text-white">
                {tracker.progressPct}%
              </span>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-100"
                aria-label="Close order detail"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <MilestoneStepper job={job} selectedGateId={reviewedGate.id} onSelectGate={handleSelectGate} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
          <div className="min-w-0 space-y-5">
            {reviewingHistoricalGate ? (
              <CompletedGateEvidenceCard
                job={job}
                gate={reviewedGate}
                viewerIsQualityChecker={viewerIsQualityChecker}
                detailsLoading={detailsLoading}
              />
            ) : (
              <CurrentGateCard
                job={job}
                detailsLoading={detailsLoading}
                viewerIsQualityChecker={viewerIsQualityChecker}
                qcCheckedIds={qcCheckedIds}
                onToggleQcItem={handleToggleQcItem}
                qcValidation={qcValidation}
                onUploadStagePhoto={onUploadStagePhoto}
                onDeleteTrackerStagePhoto={onDeleteTrackerStagePhoto}
                onLocalStageMedia={onLocalStageMedia}
                onUploadInteractionChange={onUploadInteractionChange}
                readOnly={tracker.isReleased}
              />
            )}
            <ShopFloorLogCard job={job} onAddStaffNote={onAddStaffNote} onLocalStaffNote={onLocalStaffNote} />
          </div>

          <aside className="h-fit space-y-5 self-start lg:sticky lg:top-0">
            {viewerIsQualityChecker && tracker.currentGate.id === 'quality_check' ? (
              <>
                <PhotoComplianceCard job={job} viewerIsQualityChecker={viewerIsQualityChecker} focusedStage={reviewedGate.id} />
                <QCPlateValidationCard
                  plateValue={qcPlateValue}
                  onPlateChange={handleQcPlateChange}
                  validation={qcValidation}
                />
                <QCHandoffOrderCard job={job} onSave={onSaveQCHandoffSheet} onLocalPatch={onLocalHandoffPatch} />
                <QCValidationSummaryCard validation={qcValidation} />
              </>
            ) : (
              <>
                <QCHandoffOrderCard job={job} onSave={onSaveQCHandoffSheet} onLocalPatch={onLocalHandoffPatch} />
                <PhotoComplianceCard job={job} viewerIsQualityChecker={viewerIsQualityChecker} focusedStage={reviewedGate.id} />
              </>
            )}
          </aside>
        </div>
      </div>

      <GateActionBar
        onOpenPosQueue={onOpenPosQueue}
        job={job}
        viewerIsQualityChecker={viewerIsQualityChecker}
        qcValidation={qcValidation}
        onAdvance={onAdvance}
        onLocalStageUpdate={onLocalStageUpdate}
      />
    </div>
  );
}

type LiveTrackerOrderModalProps = Omit<SelectedOrderPanelProps, 'onClose' | 'titleId'> & {
  onClose: () => void;
  isUploadInteractionActive?: boolean;
};

function LiveTrackerOrderModal({ onClose, isUploadInteractionActive = false, ...panelProps }: LiveTrackerOrderModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'live-tracker-order-modal-title';

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
    // Mount-only: avoid re-focusing the dialog when parent re-renders during upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={overlayRef}
      className="qc-live-order-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        const targetIsBackdrop = event.target === overlayRef.current;
        if (targetIsBackdrop && !isUploadInteractionActive) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="qc-live-order-modal h-[90vh] max-h-[90vh] w-full max-w-[1100px] overflow-hidden rounded-[36px] bg-white shadow-[0_34px_90px_-26px_rgba(15,23,42,0.55),0_18px_42px_-24px_rgba(15,23,42,0.35)] focus:outline-none"
      >
        <SelectedOrderPanel
          {...panelProps}
          onClose={onClose}
          titleId={titleId}
        />
      </div>
    </div>
  );
}

export default function QCLiveTrackerView({
  onOpenPosQueue,
  jobs,
  searchQuery = '',
  loading,
  onAdvance,
  onUploadStagePhoto,
  onDeleteTrackerStagePhoto,
  onAddStaffNote,
  onSaveQCHandoffSheet,
  onPersistQcChecklist,
}: {
  jobs: QCJob[];
  searchQuery?: string;
  loading: boolean;
  onOpenPosQueue?: () => void;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null },
    opts?: { skipJobsRefresh?: boolean }
  ) => Promise<QCStagePhotoUploadResult>;
  onDeleteTrackerStagePhoto: (
    orderId: string,
    payload: { stage: string; slot: string },
    opts?: { skipJobsRefresh?: boolean }
  ) => Promise<boolean>;
  onAddStaffNote: (orderId: string, content: string) => Promise<boolean>;
  onSaveQCHandoffSheet: (id: string, payload: QCHandoffFormState) => Promise<boolean>;
  onPersistQcChecklist?: (
    orderId: string,
    items: { item: string; passed: boolean; note?: string }[]
  ) => Promise<boolean>;
}) {
  const { user } = useAuth();
  const viewerIsQualityChecker = getSafeUserRole(user?.role) === STAFF_QC_ROLE;
  const [localJobs, setLocalJobs] = useState<QCJob[]>(jobs);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [notificationTarget, setNotificationTarget] = useState<QCLiveTrackerDeepLink | null>(null);
  const [isUploadInteractionActive, setIsUploadInteractionActive] = useState(false);
  const [selectedOrderDetailsLoading, setSelectedOrderDetailsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<LiveOrderFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'attention' | 'up-to-date'>('all');
  const [sortBy, setSortBy] = useState<LiveOrderSort>('priority');
  const [density, setDensity] = useState<LiveOrderDensity>('grid');
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [showCompletedToday, setShowCompletedToday] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const lastSelectedJobRef = useRef<QCJob | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);
  const isOrderModalOpenRef = useRef(false);
  const isUploadInteractionActiveRef = useRef(false);
  const uploadLockCountRef = useRef(0);
  const selectedDetailRequestRef = useRef(0);
  const detailRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (detailRefreshTimerRef.current) clearTimeout(detailRefreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    selectedJobIdRef.current = selectedJobId;
  }, [selectedJobId]);

  useEffect(() => {
    isOrderModalOpenRef.current = isOrderModalOpen;
  }, [isOrderModalOpen]);

  useEffect(() => {
    isUploadInteractionActiveRef.current = isUploadInteractionActive;
  }, [isUploadInteractionActive]);

  const handleUploadInteractionChange = useCallback((active: boolean) => {
    if (active) {
      uploadLockCountRef.current += 1;
      if (uploadLockCountRef.current === 1) {
        isUploadInteractionActiveRef.current = true;
        setIsUploadInteractionActive(true);
        pauseQcJobsRefetchForUpload(20_000);
        selectedDetailRequestRef.current += 1;
        if (detailRefreshTimerRef.current) {
          clearTimeout(detailRefreshTimerRef.current);
          detailRefreshTimerRef.current = null;
        }
      }
    } else {
      uploadLockCountRef.current = Math.max(0, uploadLockCountRef.current - 1);
      if (uploadLockCountRef.current === 0) {
        isUploadInteractionActiveRef.current = false;
        setIsUploadInteractionActive(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isUploadInteractionActiveRef.current) {
      return;
    }
    setLocalJobs((prev) => {
      if (jobs.length === 0 && prev.length > 0) return prev;

      const prevById = new Map(prev.map((j) => [j.id, j]));
      const nextJobs = jobs.map((job) => {
        const old = prevById.get(job.id);
        if (!old) return job;
        const mergedMedia = mergeTrackerStageMediaLists(getMediaList(old), getMediaList(job));
        return {
          ...job,
          trackerStageMedia: mergedMedia,
          qcChecklist: mergeOrderQcChecklistPayload(old as QCJob, (job as any).qcChecklist) as any,
        } as QCJob;
      });

      if (selectedJobId && !nextJobs.some((job) => job.id === selectedJobId)) {
        const selectedSnapshot = prevById.get(selectedJobId) || lastSelectedJobRef.current;
        if (selectedSnapshot) nextJobs.push(selectedSnapshot);
      }

      return nextJobs;
    });
  }, [jobs, selectedJobId]);

  const trackedOrders = useMemo(() => {
    return localJobs
      .filter((job) => TRACKED_ORDER_STATUSES.includes(String((job as any).orderStatus || '')) && !isTerminalOrder(job))
      .sort((a, b) => {
        const aState = getTrackerState(a);
        const bState = getTrackerState(b);
        if (aState.isComplete !== bState.isComplete) return aState.isComplete ? 1 : -1;
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [localJobs]);

  const evidenceByJobId = useMemo(() => {
    const summaries = new Map<string, LiveEvidenceSummary>();
    trackedOrders.forEach((job) => summaries.set(job.id, getLiveEvidenceSummary(job, viewerIsQualityChecker)));
    return summaries;
  }, [trackedOrders, viewerIsQualityChecker]);

  const completedToday = useMemo(() => {
    const today = new Date();
    return localJobs.filter((job) => {
      if (!isTerminalOrder(job)) return false;
      const raw = String(
        (job as any).releasedAt ||
        (job as any).completedAt ||
        (job as any).serviceTrackingUpdatedAt ||
        (job as any).updatedAt ||
        ''
      );
      if (!raw) return false;
      const date = new Date(raw);
      return !Number.isNaN(date.getTime())
        && date.getFullYear() === today.getFullYear()
        && date.getMonth() === today.getMonth()
        && date.getDate() === today.getDate();
    });
  }, [localJobs]);

  const filterCounts = useMemo(() => {
    const counts: Record<LiveOrderFilter, number> = {
      all: trackedOrders.length,
      'needs-evidence': 0,
      received: 0,
      in_progress: 0,
      quality_check: 0,
      ready_pickup: 0,
    };
    trackedOrders.forEach((job) => {
      const summary = evidenceByJobId.get(job.id);
      if (!summary) return;
      if (summary.needsAttention) counts['needs-evidence'] += 1;
      if (summary.stage in counts) counts[summary.stage as LiveOrderFilter] += 1;
    });
    return counts;
  }, [evidenceByJobId, trackedOrders]);

  const displayedOrders = useMemo(() => {
    const searched = filterQCJobsBySearch(trackedOrders, searchQuery);
    const filtered = searched.filter((job) => {
      const summary = evidenceByJobId.get(job.id);
      if (!summary) return false;
      if (activeFilter === 'needs-evidence' && !summary.needsAttention) return false;
      if (!['all', 'needs-evidence'].includes(activeFilter) && summary.stage !== activeFilter) return false;
      if (urgencyFilter === 'attention' && !summary.needsAttention) return false;
      if (urgencyFilter === 'up-to-date' && summary.needsAttention) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aSummary = evidenceByJobId.get(a.id)!;
      const bSummary = evidenceByJobId.get(b.id)!;
      if (sortBy === 'latest') return bSummary.lastUpdateMs - aSummary.lastUpdateMs;
      if (sortBy === 'oldest') return aSummary.lastUpdateMs - bSummary.lastUpdateMs;
      if (sortBy === 'customer') return formatCustomer(a.customerName || a.customer).localeCompare(formatCustomer(b.customerName || b.customer));
      if (sortBy === 'stage') return TRACKER_GATES.findIndex((gate) => gate.id === aSummary.stage) - TRACKER_GATES.findIndex((gate) => gate.id === bSummary.stage);
      if (aSummary.needsAttention !== bSummary.needsAttention) return aSummary.needsAttention ? -1 : 1;
      if (aSummary.stale !== bSummary.stale) return aSummary.stale ? -1 : 1;
      if (aSummary.missing !== bSummary.missing) return bSummary.missing - aSummary.missing;
      return aSummary.lastUpdateMs - bSummary.lastUpdateMs;
    });
  }, [activeFilter, evidenceByJobId, searchQuery, sortBy, trackedOrders, urgencyFilter]);

  const needsActionOrders = useMemo(
    () => displayedOrders.filter((job) => evidenceByJobId.get(job.id)?.needsAttention),
    [displayedOrders, evidenceByJobId]
  );
  const otherLiveOrders = useMemo(
    () => displayedOrders.filter((job) => !evidenceByJobId.get(job.id)?.needsAttention),
    [displayedOrders, evidenceByJobId]
  );
  const actionCenterOrders = useMemo(
    () => [...trackedOrders]
      .filter((job) => evidenceByJobId.get(job.id)?.needsAttention)
      .sort((a, b) => {
        const av = evidenceByJobId.get(a.id)!;
        const bv = evidenceByJobId.get(b.id)!;
        if (av.stale !== bv.stale) return av.stale ? -1 : 1;
        if (av.missing !== bv.missing) return bv.missing - av.missing;
        return av.lastUpdateMs - bv.lastUpdateMs;
      })
      .slice(0, 4),
    [evidenceByJobId, trackedOrders]
  );

  const recentActivity = useMemo(() => {
    const rows: { id: string; title: string; subtitle: string; timestamp: number }[] = [];
    localJobs.forEach((job) => {
      getMediaList(job).forEach((media, index) => {
        const timestamp = media.uploadedAt ? new Date(media.uploadedAt).getTime() : 0;
        if (!timestamp || !Number.isFinite(timestamp)) return;
        const slot = normalizeStaffGateSlot(media.slot, media.stage);
        rows.push({
          id: `${job.id}-photo-${index}-${timestamp}`,
          title: 'Photo uploaded',
          subtitle: `${truncateOrderId(job.jobId)}${slot ? ` — ${trackerSlotLabel(slot)}` : ''}`,
          timestamp,
        });
      });
      const stageUpdatedAt = new Date(String((job as any).serviceTrackingUpdatedAt || '')).getTime();
      if (Number.isFinite(stageUpdatedAt) && stageUpdatedAt > 0) {
        rows.push({
          id: `${job.id}-stage-${stageUpdatedAt}`,
          title: `${stageDisplayLabel(getTrackerState(job).currentGate.id)} stage updated`,
          subtitle: truncateOrderId(job.jobId),
          timestamp: stageUpdatedAt,
        });
      }
    });
    return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  }, [localJobs]);

  const activeCount = trackedOrders.length;

  const searchActive = Boolean(searchQuery.trim());

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return (
      trackedOrders.find((job) => job.id === selectedJobId) ||
      localJobs.find((job) => job.id === selectedJobId) ||
      (lastSelectedJobRef.current?.id === selectedJobId ? lastSelectedJobRef.current : null)
    );
  }, [localJobs, selectedJobId, trackedOrders]);

  useEffect(() => {
    if (selectedJob) {
      lastSelectedJobRef.current = selectedJob;
      return;
    }
  }, [selectedJob]);

  const openSelectedOrder = useCallback((job: QCJob, target: QCLiveTrackerDeepLink | null = null) => {
    lastSelectedJobRef.current = job;
    selectedJobIdRef.current = job.id;
    isOrderModalOpenRef.current = true;
    setSelectedJobId(job.id);
    setNotificationTarget(target);
    setIsOrderModalOpen(true);
    try {
      sessionStorage.setItem(QC_LIVE_MODAL_PERSIST_KEY, JSON.stringify({ jobId: job.id }));
    } catch {
      /* ignore quota errors */
    }
  }, []);

  const focusOrderFromActionCenter = useCallback((job: QCJob) => {
    setActiveFilter('all');
    setUrgencyFilter('all');
    setHighlightedJobId(job.id);
    window.setTimeout(() => {
      document.getElementById(`live-order-${job.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    window.setTimeout(() => setHighlightedJobId((current) => current === job.id ? null : current), 2400);
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      if (trackedOrders.some((job) => job.id === selectedJobId)) {
        clearLiveTrackerDeepLinkJobId();
      }
      return;
    }

    if (trackedOrders.length === 0) return;
    const deepLink = readLiveTrackerDeepLink();
    const deepLinkedJob = deepLink ? trackedOrders.find((job) => job.id === deepLink.jobId) : null;
    if (deepLinkedJob) {
      openSelectedOrder(deepLinkedJob, deepLink);
      clearLiveTrackerDeepLinkJobId();
      return;
    }
  }, [openSelectedOrder, selectedJobId, trackedOrders]);

  useEffect(() => {
    if (selectedJobId || isOrderModalOpen || trackedOrders.length === 0) return;
    try {
      const raw = sessionStorage.getItem(QC_LIVE_MODAL_PERSIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { jobId?: string };
      const jobId = typeof parsed?.jobId === 'string' ? parsed.jobId : '';
      if (!jobId) return;
      const job = trackedOrders.find((entry) => entry.id === jobId);
      if (!job) return;
      openSelectedOrder(job);
    } catch {
      /* ignore corrupt session payload */
    }
  }, [isOrderModalOpen, openSelectedOrder, selectedJobId, trackedOrders]);

  const refreshSelectedOrderDetails = useCallback(async (id: string, options?: { silent?: boolean }) => {
    if (isUploadInteractionActiveRef.current) return false;
    const requestId = ++selectedDetailRequestRef.current;
    const silent = Boolean(options?.silent);
    if (!silent) setSelectedOrderDetailsLoading(true);

    try {
      const response = await OrderService.getOrderById(id);
      const detail = response?.success ? response.data : null;
      if (!detail) return false;

      if (isUploadInteractionActiveRef.current || requestId !== selectedDetailRequestRef.current) {
        return false;
      }

      setLocalJobs((current) =>
        current.map((job) => {
          if (job.id !== id) return job;

          const existingMedia = getMediaList(job);
          const fetchedMedia = (Array.isArray((detail as any).trackerStageMedia)
            ? ((detail as any).trackerStageMedia as TrackerMedia[])
            : []
          )
            .filter(Boolean)
            .map(sanitizeTrackerMediaEntry);

          const mergedMedia = mergeTrackerStageMediaLists(existingMedia, fetchedMedia);

          return {
            ...job,
            orderStatus: ((detail as any).status || (detail as any).orderStatus || (job as any).orderStatus) as any,
            serviceTrackingStage: ((detail as any).serviceTrackingStage || (job as any).serviceTrackingStage) as any,
            paymentStatus: ((detail as any).paymentStatus ?? (job as any).paymentStatus) as any,
            posQueueStatus: (detail as any).posQueueStatus ?? null,
            readyForPaymentAt: (detail as any).readyForPaymentAt ?? job.readyForPaymentAt,
            readyForPickupEvidenceComplete: (detail as any).readyForPickupEvidenceComplete ?? job.readyForPickupEvidenceComplete,
            invoiceId: ((detail as any).invoiceId ?? (job as any).invoiceId) as any,
            serviceTrackingUpdatedAt:
              ((detail as any).serviceTrackingUpdatedAt || (detail as any).updatedAt || (job as any).serviceTrackingUpdatedAt) as any,
            serviceStaffAssignments:
              ((detail as any).serviceStaffAssignments || (job as any).serviceStaffAssignments || []) as any,
            trackerStageMedia: mergedMedia,
            qcChecklist: mergeOrderQcChecklistPayload(job, (detail as any).qcChecklist) as any,
            staffNotes: Array.isArray((detail as any).staffNotes) ? (detail as any).staffNotes : job.staffNotes,
            notes: typeof (detail as any).notes === 'string' ? (detail as any).notes : job.notes,
            photos: (detail as any).photos || job.photos,
            bookingDate: (detail as any).bookingDate ?? (job as any).bookingDate,
            bookingTime: (detail as any).bookingTime ?? (job as any).bookingTime,
            customerName: (detail as any).customerName ?? job.customerName ?? job.customer,
            qcHandoffSheet: (detail as any).qcHandoffSheet ?? (job as any).qcHandoffSheet,
            vehicleYear: (detail as any).vehicleYear ?? job.vehicleYear,
            vehicleMake: (detail as any).vehicleMake ?? job.vehicleMake,
            vehicleModel: (detail as any).vehicleModel ?? job.vehicleModel,
            vehicleColor: (detail as any).vehicleColor ?? job.vehicleColor,
            vehicle: (detail as any).vehicleInfo ?? job.vehicle,
            plate: sanitizeDisplayPlate(String((detail as any).vehiclePlate || '').trim()) || job.plate,
            existingFwsAndShade: String(
              (detail as any).warrantyAndReceipt?.existingFwsAndShade ?? (job as any).existingFwsAndShade ?? ''
            ).trim(),
          } as QCJob;
        })
      );

      return true;
    } catch (error) {
      console.error('[QCLiveTrackerView] Failed to hydrate selected order details', error);
      return false;
    } finally {
      if (requestId === selectedDetailRequestRef.current) {
        setSelectedOrderDetailsLoading(false);
      }
    }
  }, []);

  const updateLocalStage = useCallback((id: string, stage: ServiceStage) => {
    setLocalJobs((current) =>
      current.map((job) =>
        job.id === id
          ? ({
              ...job,
              orderStatus: stageToOrderStatus(stage, (job as any).orderStatus),
              serviceTrackingStage: stage,
              serviceTrackingUpdatedAt: new Date().toISOString(),
            } as QCJob)
          : job
      )
    );
  }, []);

  useEffect(() => {
    if (!selectedJob?.id) return;
    void refreshSelectedOrderDetails(selectedJob.id);
  }, [refreshSelectedOrderDetails, selectedJob?.id]);

  const handleAdvance = useCallback(
    async (id: string, stage: ServiceStage) => {
      const ok = await onAdvance(id, stage);
      if (ok) void refreshSelectedOrderDetails(id, { silent: true });
      return ok;
    },
    [onAdvance, refreshSelectedOrderDetails]
  );

  const scheduleSilentDetailRefresh = useCallback(
    (orderId: string) => {
      if (detailRefreshTimerRef.current) clearTimeout(detailRefreshTimerRef.current);
      detailRefreshTimerRef.current = setTimeout(() => {
        detailRefreshTimerRef.current = null;
        if (isUploadInteractionActiveRef.current) {
          return;
        }
        void refreshSelectedOrderDetails(orderId, { silent: true });
      }, 2500);
    },
    [refreshSelectedOrderDetails]
  );

  const upsertLocalMedia = useCallback((id: string, media: TrackerMedia) => {
    setLocalJobs((current) =>
      current.map((job) => {
        if (job.id !== id) return job;
        const existing = getMediaList(job);
        const next = existing.filter((item) => !matchesStageSlotRow(item, media));
        if (media.photoUrl !== '') {
          next.push({ ...media });
        }
        return { ...job, trackerStageMedia: next } as QCJob;
      })
    );
  }, []);

  const handleUploadStagePhoto = useCallback(
    async (
      orderId: string,
      payload: { stage: string; slot?: string; description?: string; file?: File | null },
      opts?: { skipJobsRefresh?: boolean }
    ) => {
      const result = await onUploadStagePhoto(orderId, payload, { ...opts, skipJobsRefresh: true });
      if (result?.success && result.savedMedia) {
        upsertLocalMedia(orderId, sanitizeTrackerMediaEntry(result.savedMedia));
      }
      return result;
    },
    [onUploadStagePhoto, upsertLocalMedia]
  );

  const handleDeleteTrackerStagePhoto = useCallback(
    async (orderId: string, payload: { stage: string; slot: string }) => {
      const ok = await onDeleteTrackerStagePhoto(orderId, payload, { skipJobsRefresh: true });
      if (ok) scheduleSilentDetailRefresh(orderId);
      return ok;
    },
    [onDeleteTrackerStagePhoto, scheduleSilentDetailRefresh]
  );

  const handleAddStaffNote = useCallback(
    async (orderId: string, content: string) => {
      const ok = await onAddStaffNote(orderId, content);
      if (ok) void refreshSelectedOrderDetails(orderId, { silent: true });
      return ok;
    },
    [onAddStaffNote, refreshSelectedOrderDetails]
  );

  const addLocalStaffNote = useCallback((id: string, content: string) => {
    setLocalJobs((current) =>
      current.map((job) => {
        if (job.id !== id) return job;
        return {
          ...job,
          staffNotes: [
            ...(job.staffNotes || []),
            {
              content,
              detailerName: 'QC Checker',
              createdAt: new Date().toISOString(),
            },
          ],
        };
      })
    );
  }, []);

  const patchLocalHandoff = useCallback((id: string, payload: QCHandoffFormState) => {
    setLocalJobs((current) =>
      current.map((job) => {
        if (job.id !== id) return job;
        return {
          ...job,
          qcHandoffSheet: {
            ...((job as any).qcHandoffSheet || {}),
            ...payload,
            updatedAt: new Date().toISOString(),
          },
        } as QCJob;
      })
    );
  }, []);

  const handleSaveQCHandoffSheet = useCallback(
    async (id: string, payload: QCHandoffFormState) => {
      const ok = await onSaveQCHandoffSheet(id, payload);
      if (ok) void refreshSelectedOrderDetails(id, { silent: true });
      return ok;
    },
    [onSaveQCHandoffSheet, refreshSelectedOrderDetails]
  );

  const closeSelectedOrder = useCallback(() => {
    if (isUploadInteractionActiveRef.current) return;
    isOrderModalOpenRef.current = false;
    isUploadInteractionActiveRef.current = false;
    selectedJobIdRef.current = null;
    lastSelectedJobRef.current = null;
    setIsOrderModalOpen(false);
    setNotificationTarget(null);
    setIsUploadInteractionActive(false);
    setSelectedJobId(null);
    try {
      sessionStorage.removeItem(QC_LIVE_MODAL_PERSIST_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const modalJob = selectedJob || lastSelectedJobRef.current;
  const modalPinned = Boolean(isOrderModalOpenRef.current || isOrderModalOpen || modalJob);

  if (loading && !modalPinned) {
    return (
      <div className="qc-live-shell w-full animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-8 w-36 rounded-lg bg-slate-200" />
          <div className="h-6 w-16 rounded-full bg-emerald-100" />
        </div>
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-slate-100" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-2xl border border-slate-100 bg-white" />)}
        </div>
        <div className="mt-4 h-14 rounded-2xl border border-slate-100 bg-white" />
        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-[420px] rounded-2xl border border-slate-100 bg-white" />)}
          </div>
          <div className="h-96 rounded-2xl border border-slate-100 bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="qc-live-shell w-full text-slate-900">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Live Orders</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 ring-1 ring-emerald-200/60">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">Real-time overview of all detailing jobs and evidence updates</p>
        </div>
        {searchActive ? (
          <span className="text-xs font-bold text-slate-500">Showing {displayedOrders.length} of {trackedOrders.length} matching live orders</span>
        ) : null}
      </header>

      <section className="qc-live-kpi-grid mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Live order summary">
        <button type="button" onClick={() => setActiveFilter('all')} className="qc-live-kpi group flex min-h-24 items-center gap-4 rounded-2xl border border-blue-200/70 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Radio className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="block text-2xl font-black tabular-nums text-blue-700">{activeCount}</strong><span className="block text-xs font-black text-slate-900">Live Orders</span><span className="block text-[11px] font-medium text-slate-400">In progress today</span></span>
        </button>
        <button type="button" onClick={() => setActiveFilter('needs-evidence')} className="qc-live-kpi group flex min-h-24 items-center gap-4 rounded-2xl border border-amber-200/70 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-amber-100">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><AlertTriangle className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="block text-2xl font-black tabular-nums text-amber-600">{filterCounts['needs-evidence']}</strong><span className="block text-xs font-black text-slate-900">Needs Evidence</span><span className="block text-[11px] font-medium text-slate-400">Require your action</span></span>
        </button>
        <button type="button" onClick={() => setActiveFilter('ready_pickup')} className="qc-live-kpi group flex min-h-24 items-center gap-4 rounded-2xl border border-emerald-200/70 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-100">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><PackageCheck className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="block text-2xl font-black tabular-nums text-emerald-600">{filterCounts.ready_pickup}</strong><span className="block text-xs font-black text-slate-900">Ready for Pickup</span><span className="block text-[11px] font-medium text-slate-400">Payment &amp; customer handover</span></span>
        </button>
        <button type="button" onClick={() => setShowCompletedToday(true)} className="qc-live-kpi group flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-slate-100">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><CheckCircle2 className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="block text-2xl font-black tabular-nums text-slate-700">{completedToday.length}</strong><span className="block text-xs font-black text-slate-900">Completed Today</span><span className="block text-[11px] font-medium text-slate-400">View released jobs</span></span>
        </button>
      </section>

      <section className="qc-live-toolbar mt-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between" aria-label="Live order filters">
        <div className="min-w-0 overflow-x-auto pb-1 lg:pb-0">
          <div className="flex min-w-max items-center gap-1.5">
            {([
              ['all', 'All', filterCounts.all],
              ['needs-evidence', 'Needs Evidence', filterCounts['needs-evidence']],
              ['received', 'Arrived', filterCounts.received],
              ['in_progress', 'In Progress', filterCounts.in_progress],
              ['quality_check', 'QC', filterCounts.quality_check],
              ['ready_pickup', 'Ready', filterCounts.ready_pickup],
            ] as [LiveOrderFilter, string, number][]).map(([value, label, count]) => (
              <button key={value} type="button" onClick={() => setActiveFilter(value)} aria-pressed={activeFilter === value} className={`qc-live-filter-pill rounded-full px-3 py-2 text-[11px] font-black transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${activeFilter === value ? value === 'needs-evidence' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                {label} <span className="tabular-nums">({count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value as typeof urgencyFilter)} aria-label="Filter by attention status" className="qc-live-control h-9 rounded-xl border border-slate-200 bg-white pl-8 pr-8 text-[11px] font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100">
              <option value="all">All urgency</option><option value="attention">Needs attention</option><option value="up-to-date">Up to date</option>
            </select>
          </label>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as LiveOrderSort)} aria-label="Sort live orders" className="qc-live-control h-9 rounded-xl border border-slate-200 bg-white pl-8 pr-8 text-[11px] font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100">
              <option value="priority">Priority</option><option value="latest">Latest update</option><option value="oldest">Oldest update</option><option value="customer">Customer name</option><option value="stage">Current stage</option>
            </select>
          </label>
          <div className="qc-live-view-toggle flex rounded-xl border border-slate-200 bg-slate-50 p-0.5" aria-label="Order view">
            <button type="button" onClick={() => setDensity('grid')} aria-label="Grid view" aria-pressed={density === 'grid'} className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${density === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}><Grid2X2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setDensity('compact')} aria-label="Compact view" aria-pressed={density === 'compact'} className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${density === 'compact' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <div className="mt-4 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
        <main className="min-w-0 space-y-4">
          {displayedOrders.length === 0 ? (
            <section className="qc-live-empty-state flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Radio className="h-6 w-6" /></span>
              <h2 className="mt-4 text-base font-black text-slate-900">{trackedOrders.length === 0 ? 'No live orders' : 'No matching orders'}</h2>
              <p className="mt-1 max-w-md text-sm font-medium text-slate-500">{trackedOrders.length === 0 ? 'New active detailing jobs will appear here. Released jobs remain available in completed records.' : 'Adjust the search, status, or attention filters to see other active jobs.'}</p>
            </section>
          ) : null}

          {needsActionOrders.length > 0 ? (
            <section className="qc-live-section rounded-2xl border border-slate-200/80 bg-white/60 p-3 sm:p-4" aria-labelledby="needs-action-heading">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><h2 id="needs-action-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-900"><AlertTriangle className="h-4 w-4 text-amber-500" />Needs Action ({needsActionOrders.length})</h2><p className="mt-1 pl-6 text-[11px] font-medium text-slate-500">Orders that need evidence or updates</p></div>
              </div>
              <div className={density === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4' : 'grid gap-3 md:grid-cols-2'}>
                {needsActionOrders.map((job) => <OperationalOrderCard key={job.id} job={job} summary={evidenceByJobId.get(job.id)!} compact={density === 'compact'} highlighted={highlightedJobId === job.id} onOpen={() => openSelectedOrder(job)} />)}
              </div>
            </section>
          ) : activeFilter === 'needs-evidence' && displayedOrders.length > 0 ? (
            <section className="qc-live-success-state rounded-2xl border border-emerald-200 bg-emerald-50/50 px-6 py-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><h2 className="mt-3 text-sm font-black text-slate-900">All evidence is up to date</h2><p className="mt-1 text-xs font-medium text-slate-500">No active jobs currently require evidence.</p></section>
          ) : null}

          {otherLiveOrders.length > 0 ? (
            <section className="qc-live-section rounded-2xl border border-slate-200/80 bg-white/60 p-3 sm:p-4" aria-labelledby="other-orders-heading">
              <div className="mb-3"><h2 id="other-orders-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-900"><RefreshCw className="h-3.5 w-3.5 text-slate-500" />All Other Live Orders ({otherLiveOrders.length})</h2><p className="mt-1 pl-5 text-[11px] font-medium text-slate-500">Other active jobs</p></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {otherLiveOrders.map((job) => <OperationalOrderCard key={job.id} job={job} summary={evidenceByJobId.get(job.id)!} compact highlighted={highlightedJobId === job.id} onOpen={() => openSelectedOrder(job)} />)}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-0">
          <section className="qc-live-side-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="action-center-heading">
            <div className="flex items-start justify-between gap-2"><div><h2 id="action-center-heading" className="text-sm font-black text-slate-950">Action Center</h2><p className="mt-0.5 text-[11px] font-medium text-slate-500">What needs your attention</p></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black tabular-nums text-amber-700">{filterCounts['needs-evidence']}</span></div>
            <div className="mt-4 space-y-2">
              {actionCenterOrders.length > 0 ? actionCenterOrders.map((job) => {
                const summary = evidenceByJobId.get(job.id)!;
                return <button key={job.id} type="button" onClick={() => focusOrderFromActionCenter(job)} className="qc-live-action-item flex w-full items-start gap-3 rounded-xl bg-slate-50 p-3 text-left transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100"><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${summary.stale ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>{summary.stale ? <Clock3 className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}</span><span className="min-w-0 flex-1"><span className="block truncate font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600">{truncateOrderId(job.jobId)}</span><span className="mt-0.5 block truncate text-[11px] font-black text-slate-900">{formatCustomer(job.customerName || job.customer)}</span><span className={`mt-1 block text-[10px] font-bold leading-snug ${summary.stale ? 'text-amber-700' : 'text-blue-600'}`}>{summary.reason}</span><span className="mt-0.5 block text-[9px] font-medium text-slate-400">{summary.lastUpdateMs ? relTime(new Date(summary.lastUpdateMs).toISOString()) : 'No update yet'}</span></span><ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" /></button>;
              }) : <div className="rounded-xl bg-emerald-50 px-4 py-6 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" /><p className="mt-2 text-xs font-black text-slate-800">All caught up</p><p className="mt-1 text-[10px] text-slate-500">No live orders need immediate attention.</p></div>}
            </div>
            {filterCounts['needs-evidence'] > 0 ? <button type="button" onClick={() => { setActiveFilter('needs-evidence'); setUrgencyFilter('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="qc-live-secondary-button mt-3 h-9 w-full rounded-xl border border-blue-200 text-[10px] font-black uppercase tracking-[0.06em] text-blue-600 transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100">View all ({filterCounts['needs-evidence']})</button> : null}
          </section>

          <section className="qc-live-side-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="recent-activity-heading">
            <h2 id="recent-activity-heading" className="text-xs font-black uppercase tracking-[0.08em] text-slate-900">Recent Activity</h2>
            <div className="mt-3 space-y-1">
              {recentActivity.length > 0 ? recentActivity.slice(0, showAllActivity ? 20 : 5).map((item) => <div key={item.id} className="qc-live-activity-item flex items-start gap-2.5 px-1 py-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><ImageIcon className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-black text-slate-800">{item.title}</span><span className="mt-0.5 block truncate text-[9px] font-medium text-slate-500">{item.subtitle}</span></span><time className="shrink-0 text-[9px] font-medium text-slate-400">{new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>) : <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-[10px] font-medium text-slate-500">Activity will appear as real evidence and stage updates are recorded.</p>}
            </div>
            {recentActivity.length > 5 ? <button type="button" onClick={() => setShowAllActivity((value) => !value)} className="qc-live-secondary-button mt-2 h-9 w-full rounded-xl border border-blue-200 text-[10px] font-black uppercase tracking-[0.06em] text-blue-600 transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100">{showAllActivity ? 'Show recent' : 'View all activity'}</button> : null}
          </section>
        </aside>
      </div>

      {showCompletedToday ? createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="completed-today-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCompletedToday(false); }}>
          <div className="qc-live-dialog max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5"><div><h2 id="completed-today-title" className="text-lg font-black text-slate-950">Completed Today</h2><p className="mt-1 text-xs font-medium text-slate-500">Released jobs are kept out of Live Orders and remain available as records.</p></div><button type="button" onClick={() => setShowCompletedToday(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200" aria-label="Close completed jobs"><X className="h-4 w-4" /></button></div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {completedToday.length > 0 ? <div className="space-y-2">{completedToday.map((job) => <button key={job.id} type="button" onClick={() => { setShowCompletedToday(false); openSelectedOrder(job); }} className="qc-live-completed-row flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{formatCustomer(job.customerName || job.customer)}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{truncateOrderId(job.jobId)} · {formatVehicle(job)}</span></span><span className="text-[10px] font-black uppercase text-blue-600">View record</span></button>)}</div> : <div className="px-6 py-14 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-800">No completed jobs today</p><p className="mt-1 text-xs font-medium text-slate-500">Jobs appear here only after they are officially released or completed.</p></div>}
            </div>
          </div>
        </div>, document.body
      ) : null}

      {isOrderModalOpen && modalJob
        ? createPortal(
            <LiveTrackerOrderModal
              onOpenPosQueue={onOpenPosQueue}
              job={modalJob}
              detailsLoading={selectedOrderDetailsLoading}
              viewerIsQualityChecker={viewerIsQualityChecker}
              isUploadInteractionActive={isUploadInteractionActive}
              notificationTarget={notificationTarget}
              onAdvance={handleAdvance}
              onUploadStagePhoto={handleUploadStagePhoto}
              onDeleteTrackerStagePhoto={handleDeleteTrackerStagePhoto}
              onAddStaffNote={handleAddStaffNote}
              onLocalStageUpdate={updateLocalStage}
              onLocalStageMedia={upsertLocalMedia}
              onLocalStaffNote={addLocalStaffNote}
              onSaveQCHandoffSheet={handleSaveQCHandoffSheet}
              onLocalHandoffPatch={patchLocalHandoff}
              onPersistQcChecklist={onPersistQcChecklist}
              onUploadInteractionChange={handleUploadInteractionChange}
              onClose={closeSelectedOrder}
            />,
            document.body
          )
        : null}
    </div>
  );
}
