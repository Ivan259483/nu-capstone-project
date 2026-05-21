import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  ImageIcon,
  Info,
  Loader2,
  Lock,
  PackageCheck,
  Plus,
  Radio,
  ShieldCheck,
  UploadCloud,
  UserCheck,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { QCJob } from '@/hooks/useQCData';
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
import { clearLiveTrackerDeepLinkJobId, readLiveTrackerDeepLinkJobId } from '@/lib/qc-job-workflow';
import { useAuth } from '@/contexts/AuthContext';
import { getSafeUserRole, STAFF_QC_ROLE } from '@/lib/roles';
import {
  getCompletedGateIndexFromServiceStage,
  getTrackerPipelineProgressPct,
} from '@/lib/tracker-pipeline-progress';

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

const TRACKED_ORDER_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'ready_for_payment', 'completed', 'released'];
const CUSTOMER_UPDATE_STALE_MS = 24 * 60 * 60 * 1000;

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
  const isReleased = rawStage === 'released' || rawStatus === 'released';
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

function MiniProgressBar({ job }: { job: QCJob }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {TRACKER_GATES.map((gate, index) => {
        const state = getGateState(job, index);
        return (
          <span
            key={gate.id}
            className={`h-1.5 rounded-full transition-colors ${
              state === 'done'
                ? 'bg-emerald-500'
                : state === 'active'
                  ? 'bg-slate-900'
                  : 'bg-slate-200'
            }`}
          />
        );
      })}
    </div>
  );
}

function OrderSidebarCard({
  job,
  selected,
  onSelect,
}: {
  job: QCJob;
  selected: boolean;
  onSelect: () => void;
}) {
  const tracker = getTrackerState(job);
  const vehicleDisplay = formatVehicle(job);
  const serviceDisplay = formatService(job);
  const warning = needsCustomerUpdate(job);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-[30px] p-5 text-left transition-all duration-200 ${
        selected
          ? 'bg-blue-50/80 shadow-[0_14px_40px_-10px_rgba(37,99,235,0.24)]'
          : 'bg-white shadow-[0_10px_32px_-8px_rgba(15,23,42,0.08)] hover:bg-white hover:shadow-[0_16px_44px_-10px_rgba(37,99,235,0.15)]'
      } ${tracker.isComplete ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-black uppercase tracking-[0.08em] text-slate-500">
            {truncateOrderId(job.jobId)}
          </p>
          <p className="mt-1.5 truncate text-base font-black text-slate-950">{formatCustomer(job.customer)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black tabular-nums text-slate-600">
          {tracker.progressPct}%
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-slate-500">
        {vehicleDisplay} + {serviceDisplay}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${tracker.currentGate.dotClass}`} />
          <span className="truncate">{tracker.currentGate.shortLabel}</span>
        </span>
        {warning ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-700 shadow-[0_4px_14px_-6px_rgba(245,158,11,0.35)]">
            <AlertTriangle className="h-3 w-3" />
            Update
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <MiniProgressBar job={job} />
      </div>
    </button>
  );
}

function MilestoneStepper({ job }: { job: QCJob }) {
  const tracker = getTrackerState(job);

  return (
    <div className="shrink-0 bg-transparent px-6 py-4">
      <div className="rounded-[30px] bg-white/95 px-5 py-4 shadow-[0_22px_55px_-22px_rgba(15,23,42,0.12),0_8px_24px_-14px_rgba(15,23,42,0.07)]">
        <div className="grid grid-cols-4">
        {TRACKER_GATES.map((gate, index) => {
          const state = getGateState(job, index);
          const done = state === 'done';
          const active = state === 'active';
          const lineDone = index <= tracker.completedIndex;
          return (
            <div key={gate.id} className="relative flex min-w-0 flex-col items-center text-center">
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
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.8} /> : active ? index + 1 : null}
              </div>
              <p className={`mt-2 w-full truncate px-1 text-[11px] font-black ${done ? 'text-emerald-700' : active ? 'text-slate-950' : 'text-slate-400'}`}>
                {gate.label}
              </p>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

function PhotoComplianceCard({ job, viewerIsQualityChecker }: { job: QCJob; viewerIsQualityChecker: boolean }) {
  const mediaList = getMediaList(job);
  const tracker = getTrackerState(job);
  const currentNeed = requiredSlotsCountForGate(tracker.currentGate.id, viewerIsQualityChecker);
  const currentCount = countFilledGateSlots(mediaList, tracker.currentGate.id);

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
  onPhotoUploadSuccess,
  onUploadInteractionChange,
}: {
  job: QCJob;
  detailsLoading?: boolean;
  viewerIsQualityChecker: boolean;
  qcCheckedIds: Set<string>;
  onToggleQcItem: (id: string) => void;
  qcValidation: QCGateValidation;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onDeleteTrackerStagePhoto: (orderId: string, payload: { stage: string; slot: string }) => Promise<boolean>;
  onLocalStageMedia: (id: string, media: TrackerMedia) => void;
  onPhotoUploadSuccess?: () => void;
  onUploadInteractionChange?: (active: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const successTimersRef = useRef<Partial<Record<string, ReturnType<typeof setTimeout>>>>({});
  const filePickerFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePickerFocusListenerRef = useRef<(() => void) | null>(null);
  const pendingSlotRef = useRef<StaffGateSlotKey | null>(null);
  const [pendingSlot, setPendingSlot] = useState<StaffGateSlotKey | null>(null);
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

  useEffect(() => {
    return () => {
      Object.values(successTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      clearFilePickerFallback();
      onUploadInteractionChange?.(false);
    };
  }, [clearFilePickerFallback, onUploadInteractionChange]);

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
    clearFilePickerFallback();
    pendingSlotRef.current = slot;
    setPendingSlot(slot);
    onUploadInteractionChange?.(true);
    const clearAfterPickerReturns = () => {
      filePickerFocusListenerRef.current = null;
      filePickerFallbackTimerRef.current = setTimeout(() => {
        if (pendingSlotRef.current !== slot) return;
        pendingSlotRef.current = null;
        setPendingSlot(null);
        onUploadInteractionChange?.(false);
      }, 800);
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
      onUploadInteractionChange?.(false);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setUploadingSlots((current) => ({ ...current, [slot]: true }));
    onLocalStageMedia(job.id, {
      stage: currentStage,
      slot,
      photoUrl: previewUrl,
      uploadedAt: new Date().toISOString(),
    });

    let ok = false;
    try {
      await waitForNextPaint();
      ok = await onUploadStagePhoto(job.id, {
        stage: currentStage,
        slot,
        file,
      });
    } finally {
      setUploadingSlots((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      onUploadInteractionChange?.(false);
    }

    if (!ok) {
      onLocalStageMedia(job.id, { stage: currentStage, slot, photoUrl: '' });
      URL.revokeObjectURL(previewUrl);
      return;
    }

    markSlotSuccess(slot);
    onPhotoUploadSuccess?.();
  };

  const removeSlot = async (slot: StaffGateSlotKey) => {
    clearSlotSuccess(slot);
    setRemovingSlots((current) => ({ ...current, [slot]: true }));
    try {
      const ok = await onDeleteTrackerStagePhoto(job.id, { stage: currentStage, slot });
      if (ok) {
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelected}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <GateIcon className="h-3.5 w-3.5" />
            Current gate
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
          const canRenderImage = mediaHasRenderablePhotoUrl(entry);
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
            <div key={slot} className={`${shellClass}${qcTileWidth}`}>
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
                {filled ? (
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
              {filled ? (
                <div className="relative aspect-[4/3] w-full">
                  {canRenderImage ? (
                    <img src={entry!.photoUrl} alt="" className="h-full w-full object-cover" />
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
          All {requiredForGate} photo{requiredForGate === 1 ? '' : 's'} required before advancing this gate
        </p>
      </div>
    </section>
  );
}

function GateActionBar({
  job,
  viewerIsQualityChecker,
  qcValidation,
  onAdvance,
  onLocalStageUpdate,
}: {
  job: QCJob;
  viewerIsQualityChecker: boolean;
  qcValidation: QCGateValidation;
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-slate-400">Gate action</p>
          <p className="truncate text-sm font-black text-slate-950">
            {tracker.isComplete ? 'Ready for handoff' : tracker.currentGate.label}
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
          {tracker.isComplete ? (
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
                  ? 'Mark vehicle as released'
                  : 'Awaiting POS payment'
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
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onDeleteTrackerStagePhoto: (orderId: string, payload: { stage: string; slot: string }) => Promise<boolean>;
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
  onPhotoUploadSuccess?: () => void;
  onUploadInteractionChange?: (active: boolean) => void;
  titleId?: string;
};

function SelectedOrderPanel({
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
  onPhotoUploadSuccess,
  onUploadInteractionChange,
  titleId,
}: SelectedOrderPanelProps) {
  const tracker = getTrackerState(job);
  const warning = needsCustomerUpdate(job);
  const vehicleDisplay = formatVehicle(job);
  const serviceDisplay = formatService(job);
  const mediaList = getMediaList(job);
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

  const [qcCheckedIds, setQcCheckedIds] = useState<Set<string>>(() => new Set());
  const qcCheckedIdsRef = useRef<Set<string>>(qcCheckedIds);
  const qcPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qcChecklistDirtyRef = useRef(false);

  useEffect(() => {
    qcChecklistDirtyRef.current = false;
    const raw = (job as any).qcChecklist;
    const initial = qcChecklistRowsToCheckedSet(raw);
    const rowsLen = Array.isArray(raw) ? raw.length : -1;
    // #region agent log
    fetch('http://127.0.0.1:7942/ingest/8cc35304-90ec-4f44-b68b-faf6fcc2fdcb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '968466' },
      body: JSON.stringify({
        sessionId: '968466',
        hypothesisId: 'H-hydrate',
        location: 'QCLiveTrackerView.tsx:SelectedOrderPanel',
        message: 'hydrate qc checklist from job',
        data: {
          idSuffix: job.id ? String(job.id).slice(-6) : '',
          rowsLen,
          initialCheckedSize: initial.size,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
    if (!onPersistQcChecklist) return;
    void onPersistQcChecklist(job.id, checkedSetToQcChecklistPayload(qcCheckedIdsRef.current));
  }, [job.id, onPersistQcChecklist]);

  const scheduleQcChecklistPersist = useCallback(() => {
    if (!onPersistQcChecklist) return;
    if (qcPersistTimerRef.current) clearTimeout(qcPersistTimerRef.current);
    qcPersistTimerRef.current = setTimeout(() => {
      qcPersistTimerRef.current = null;
      flushQcChecklistPersist();
    }, 420);
  }, [flushQcChecklistPersist, onPersistQcChecklist]);

  useEffect(() => {
    return () => {
      if (qcPersistTimerRef.current) {
        clearTimeout(qcPersistTimerRef.current);
        qcPersistTimerRef.current = null;
      }
      if (onPersistQcChecklist && qcChecklistDirtyRef.current) {
        void onPersistQcChecklist(job.id, checkedSetToQcChecklistPayload(qcCheckedIdsRef.current));
      }
    };
  }, [job.id, onPersistQcChecklist]);

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
      // #region agent log
      fetch('http://127.0.0.1:7942/ingest/8cc35304-90ec-4f44-b68b-faf6fcc2fdcb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '968466' },
        body: JSON.stringify({
          sessionId: '968466',
          hypothesisId: 'H-toggle',
          runId: 'diag',
          location: 'QCLiveTrackerView.tsx:handleToggleQcItem',
          message: 'qc checklist toggle click',
          data: { itemPrefix: String(itemId).slice(0, 12) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      qcChecklistDirtyRef.current = true;
      setQcCheckedIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        qcCheckedIdsRef.current = next;
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

      <MilestoneStepper job={job} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
          <div className="min-w-0 space-y-5">
            <CurrentGateCard
              key={`${job.id}-${tracker.currentGate.id}`}
              job={job}
              detailsLoading={detailsLoading}
              viewerIsQualityChecker={viewerIsQualityChecker}
              qcCheckedIds={qcCheckedIds}
              onToggleQcItem={handleToggleQcItem}
              qcValidation={qcValidation}
              onUploadStagePhoto={onUploadStagePhoto}
              onDeleteTrackerStagePhoto={onDeleteTrackerStagePhoto}
              onLocalStageMedia={onLocalStageMedia}
              onPhotoUploadSuccess={onPhotoUploadSuccess}
              onUploadInteractionChange={onUploadInteractionChange}
            />
            <ShopFloorLogCard job={job} onAddStaffNote={onAddStaffNote} onLocalStaffNote={onLocalStaffNote} />
          </div>

          <aside className="h-fit space-y-5 self-start lg:sticky lg:top-0">
            {viewerIsQualityChecker && tracker.currentGate.id === 'quality_check' ? (
              <>
                <PhotoComplianceCard job={job} viewerIsQualityChecker={viewerIsQualityChecker} />
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
                <PhotoComplianceCard job={job} viewerIsQualityChecker={viewerIsQualityChecker} />
              </>
            )}
          </aside>
        </div>
      </div>

      <GateActionBar
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

  const focusDialog = useCallback(() => {
    requestAnimationFrame(() => {
      dialogRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    focusDialog();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [focusDialog, onClose]);

  return (
    <div
      ref={overlayRef}
      className="qc-live-order-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        const targetIsBackdrop = event.target === overlayRef.current;
        console.log('[BACKDROP CLICK]', { targetIsBackdrop, isUploadInteractionActive });
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
          onPhotoUploadSuccess={focusDialog}
          titleId={titleId}
        />
      </div>
    </div>
  );
}

export default function QCLiveTrackerView({
  jobs,
  loading,
  onAdvance,
  onUploadStagePhoto,
  onDeleteTrackerStagePhoto,
  onAddStaffNote,
  onSaveQCHandoffSheet,
  onPersistQcChecklist,
}: {
  jobs: QCJob[];
  loading: boolean;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onDeleteTrackerStagePhoto: (orderId: string, payload: { stage: string; slot: string }) => Promise<boolean>;
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
  const [isUploadInteractionActive, setIsUploadInteractionActive] = useState(false);
  const [selectedOrderDetailsLoading, setSelectedOrderDetailsLoading] = useState(false);
  const lastSelectedJobRef = useRef<QCJob | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);
  const isOrderModalOpenRef = useRef(false);
  const isUploadInteractionActiveRef = useRef(false);
  const selectedDetailRequestRef = useRef(0);
  const qcDebugMountIdRef = useRef(0);

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
    isUploadInteractionActiveRef.current = active;
    setIsUploadInteractionActive(active);
  }, []);

  useEffect(() => {
    qcDebugMountIdRef.current += 1;
    const mountId = qcDebugMountIdRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7942/ingest/8cc35304-90ec-4f44-b68b-faf6fcc2fdcb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '968466' },
      body: JSON.stringify({
        sessionId: '968466',
        hypothesisId: 'H-lifecycle',
        runId: 'diag',
        location: 'QCLiveTrackerView.tsx:mount',
        message: 'QCLiveTrackerView mounted/remounted',
        data: { mountId },
        timestamp: Date.now(),
      }),
      keepalive: true,
    }).catch(() => {});
    // #endregion

    const sendUnload = (reason: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7942/ingest/8cc35304-90ec-4f44-b68b-faf6fcc2fdcb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '968466' },
        body: JSON.stringify({
          sessionId: '968466',
          hypothesisId: 'H-full-unload',
          runId: 'diag',
          location: 'QCLiveTrackerView.tsx:unload-signal',
          message: reason,
          data: { mountId },
          timestamp: Date.now(),
        }),
        keepalive: true,
      }).catch(() => {});
      // #endregion
    };

    const onBeforeUnload = () => sendUnload('beforeunload');
    const onPageHide = (e: PageTransitionEvent) => sendUnload(e.persisted ? 'pagehide-bfcache' : 'pagehide');

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  useEffect(() => {
    setLocalJobs((prev) => {
      if (jobs.length === 0 && prev.length > 0) return prev;

      const prevById = new Map(prev.map((j) => [j.id, j]));
      // #region agent log
      try {
        const j0 = jobs[0] as any;
        const raw = j0?.qcChecklist;
        fetch('http://127.0.0.1:7942/ingest/8cc35304-90ec-4f44-b68b-faf6fcc2fdcb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '968466' },
          body: JSON.stringify({
            sessionId: '968466',
            hypothesisId: 'H-projection',
            location: 'QCLiveTrackerView.tsx:jobs-merge',
            message: 'incoming jobs sample',
            data: {
              nJobs: jobs.length,
              idSuffix: j0?.id ? String(j0.id).slice(-6) : '',
              qcChecklistLen: Array.isArray(raw) ? raw.length : -1,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch {
        /* ignore */
      }
      // #endregion
      const nextJobs = jobs.map((job) => {
        const old = prevById.get(job.id);
        if (!old) return job;
        const nServer = countTrackerPhotoUrls(job.trackerStageMedia as TrackerMedia[] | undefined);
        const nLocal = countTrackerPhotoUrls(old.trackerStageMedia as TrackerMedia[] | undefined);
        const renderableServer = countRenderableTrackerPhotoUrls(job.trackerStageMedia as TrackerMedia[] | undefined);
        const renderableLocal = countRenderableTrackerPhotoUrls(old.trackerStageMedia as TrackerMedia[] | undefined);
        if (nLocal > nServer || renderableLocal > renderableServer) {
          return {
            ...job,
            trackerStageMedia: old.trackerStageMedia,
            qcChecklist: mergeOrderQcChecklistPayload(old as QCJob, (job as any).qcChecklist) as any,
          } as QCJob;
        }
        return {
          ...job,
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
      .filter((job) => TRACKED_ORDER_STATUSES.includes(String((job as any).orderStatus || '')))
      .sort((a, b) => {
        const aState = getTrackerState(a);
        const bState = getTrackerState(b);
        if (aState.isComplete !== bState.isComplete) return aState.isComplete ? 1 : -1;
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [localJobs]);

  const activeCount = useMemo(
    () => trackedOrders.filter((job) => !getTrackerState(job).isComplete).length,
    [trackedOrders]
  );

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

  const openSelectedOrder = useCallback((job: QCJob) => {
    lastSelectedJobRef.current = job;
    selectedJobIdRef.current = job.id;
    isOrderModalOpenRef.current = true;
    setSelectedJobId(job.id);
    setIsOrderModalOpen(true);
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      if (trackedOrders.some((job) => job.id === selectedJobId)) {
        clearLiveTrackerDeepLinkJobId();
      }
      return;
    }

    if (trackedOrders.length === 0) return;
    const deepLinkId = readLiveTrackerDeepLinkJobId();
    const deepLinkedJob = deepLinkId ? trackedOrders.find((job) => job.id === deepLinkId) : null;
    if (deepLinkedJob) {
      openSelectedOrder(deepLinkedJob);
      clearLiveTrackerDeepLinkJobId();
      return;
    }
  }, [openSelectedOrder, selectedJobId, trackedOrders]);

  const refreshSelectedOrderDetails = useCallback(async (id: string, options?: { silent?: boolean }) => {
    const requestId = ++selectedDetailRequestRef.current;
    const silent = Boolean(options?.silent);
    if (!silent) setSelectedOrderDetailsLoading(true);

    try {
      const response = await OrderService.getOrderById(id);
      const detail = response?.success ? response.data : null;
      if (!detail) return false;

      setLocalJobs((current) =>
        current.map((job) => {
          if (job.id !== id) return job;

          const existingMedia = getMediaList(job);
          const fetchedMedia = (Array.isArray((detail as any).trackerStageMedia)
            ? ((detail as any).trackerStageMedia as TrackerMedia[])
            : []
          ).filter(Boolean);

          const mergedMedia = fetchedMedia.map((media) => {
            const existing = existingMedia.find((item) => matchesStageSlotRow(item, media));
            const existingUrl = String(existing?.photoUrl || '').trim();
            const fetchedUrl = String(media?.photoUrl || '').trim();
            if (existingUrl.startsWith('blob:') && !fetchedUrl) return existing;
            return media;
          });

          for (const existing of existingMedia) {
            const existingUrl = String(existing?.photoUrl || '').trim();
            if (!existingUrl.startsWith('blob:')) continue;
            if (mergedMedia.some((item) => matchesStageSlotRow(item, existing))) continue;
            mergedMedia.push(existing);
          }

          return {
            ...job,
            orderStatus: ((detail as any).status || (detail as any).orderStatus || (job as any).orderStatus) as any,
            serviceTrackingStage: ((detail as any).serviceTrackingStage || (job as any).serviceTrackingStage) as any,
            paymentStatus: ((detail as any).paymentStatus ?? (job as any).paymentStatus) as any,
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

  const handleUploadStagePhoto = useCallback(
    async (
      orderId: string,
      payload: { stage: string; slot?: string; description?: string; file?: File | null }
    ) => {
      console.log('[UPLOAD] Before upload - selectedJobId:', selectedJobIdRef.current);
      console.log('[UPLOAD] Modal open state before:', isOrderModalOpenRef.current);
      const ok = await onUploadStagePhoto(orderId, payload);
      if (ok) {
        console.log('[UPLOAD] After upload success - selectedJobId:', selectedJobIdRef.current);
        console.log('[UPLOAD] Modal open state after:', isOrderModalOpenRef.current);
        void refreshSelectedOrderDetails(orderId, { silent: true });
      }
      return ok;
    },
    [onUploadStagePhoto, refreshSelectedOrderDetails]
  );

  const handleDeleteTrackerStagePhoto = useCallback(
    async (orderId: string, payload: { stage: string; slot: string }) => {
      const ok = await onDeleteTrackerStagePhoto(orderId, payload);
      if (ok) void refreshSelectedOrderDetails(orderId, { silent: true });
      return ok;
    },
    [onDeleteTrackerStagePhoto, refreshSelectedOrderDetails]
  );

  const handleAddStaffNote = useCallback(
    async (orderId: string, content: string) => {
      const ok = await onAddStaffNote(orderId, content);
      if (ok) void refreshSelectedOrderDetails(orderId, { silent: true });
      return ok;
    },
    [onAddStaffNote, refreshSelectedOrderDetails]
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
    console.log('[SELECTION CLEARED] Called from:', new Error().stack, {
      isUploadInteractionActive: isUploadInteractionActiveRef.current,
    });
    isOrderModalOpenRef.current = false;
    isUploadInteractionActiveRef.current = false;
    selectedJobIdRef.current = null;
    lastSelectedJobRef.current = null;
    setIsOrderModalOpen(false);
    setIsUploadInteractionActive(false);
    setSelectedJobId(null);
  }, []);

  const modalJob = selectedJob || lastSelectedJobRef.current;

  if (loading && !(isOrderModalOpen && modalJob)) {
    return (
      <div className="qc-live-shell h-[calc(100vh-96px)] w-full overflow-hidden rounded-[40px] bg-white/95 p-3 shadow-[0_24px_70px_-16px_rgba(15,23,42,0.14)]">
        <div className="flex h-full flex-col overflow-hidden rounded-[36px] bg-slate-50/85">
          <div className="flex items-center justify-between gap-3 px-6 py-6">
            <div>
              <div className="h-7 w-32 animate-pulse rounded-lg bg-slate-100" />
              <div className="mt-2 h-4 w-28 animate-pulse rounded-md bg-slate-100" />
            </div>
            <div className="h-7 w-12 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 pb-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-[30px] bg-white shadow-[0_10px_32px_-8px_rgba(15,23,42,0.08)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (trackedOrders.length === 0 && !(isOrderModalOpen && modalJob)) {
    return (
      <div className="qc-live-panel flex h-[calc(100vh-96px)] flex-col items-center justify-center rounded-[40px] bg-white/95 text-center shadow-[0_20px_60px_-14px_rgba(15,23,42,0.12)]">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100/90 text-slate-400 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.1)]">
          <Radio size={26} strokeWidth={1.5} />
        </div>
        <p className="text-lg font-black text-slate-900">No active orders</p>
        <p className="mt-2 max-w-sm text-sm font-semibold text-slate-500">
          Approved bookings appear here for live tracking and QC handoffs.
        </p>
      </div>
    );
  }

  return (
    <div className="qc-live-shell h-[calc(100vh-96px)] w-full overflow-hidden rounded-[40px] bg-white/95 p-3 shadow-[0_24px_70px_-16px_rgba(15,23,42,0.14)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[36px] bg-slate-50/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-6 py-6">
            <div>
              <p className="text-xl font-black tracking-tight text-slate-950">Live Orders</p>
              <p className="text-sm font-semibold text-slate-400">Today active lane</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-black tabular-nums text-emerald-700 shadow-[0_4px_14px_-6px_rgba(16,185,129,0.3)]">
              {activeCount}
            </span>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 pb-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {trackedOrders.map((job) => (
              <OrderSidebarCard
                key={job.id}
                job={job}
                selected={job.id === selectedJobId}
                onSelect={() => openSelectedOrder(job)}
              />
            ))}
          </div>
        </section>

        {isOrderModalOpen && modalJob ? (
          <LiveTrackerOrderModal
            key={modalJob.id}
            job={modalJob}
            detailsLoading={selectedOrderDetailsLoading}
            viewerIsQualityChecker={viewerIsQualityChecker}
            isUploadInteractionActive={isUploadInteractionActive}
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
          />
        ) : null}
      </div>
    </div>
  );
}
