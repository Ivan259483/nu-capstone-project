import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardCheck,
  ImageIcon,
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
  TRACKER_PHOTO_SLOT_KEYS,
  normalizeTrackerSlotKey,
  TRACKER_PHOTO_SLOT_SHORT,
  slotPromptForGate,
  type TrackerPhotoSlotKey,
} from '@/lib/tracker-gate-photo-slots';

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

const TRACKER_GATE_STAGE_IDS = TRACKER_GATES.map((gate) => gate.id);
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

const REQUIRED_SLOT_COUNT = 5;

function countFilledGateSlots(mediaList: TrackerMedia[], stage: string): number {
  const keys = new Set<string>();
  for (const m of mediaList) {
    if (m.stage !== stage) continue;
    if (!mediaRepresentsSavedPhoto(m)) continue;
    const slot = normalizeTrackerSlotKey(m.slot);
    if (slot) keys.add(slot);
    else keys.add('__legacy__');
  }
  return keys.size;
}

function gateHasAllSlots(mediaList: TrackerMedia[], stage: string): boolean {
  return countFilledGateSlots(mediaList, stage) >= REQUIRED_SLOT_COUNT;
}

/** Match server: legacy slotless row counts as front for this slot only. */
function getMediaForSlot(
  mediaList: TrackerMedia[],
  stage: string,
  slot: TrackerPhotoSlotKey
): TrackerMedia | undefined {
  const explicit = mediaList.find(
    (m) => m.stage === stage && normalizeTrackerSlotKey(m.slot) === slot && mediaRepresentsSavedPhoto(m)
  );
  if (explicit) return explicit;
  if (slot === 'front') {
    return mediaList.find(
      (m) => m.stage === stage && mediaRepresentsSavedPhoto(m) && !normalizeTrackerSlotKey(m.slot)
    );
  }
  return undefined;
}

function matchesStageSlotRow(item: TrackerMedia, media: TrackerMedia): boolean {
  if (item.stage !== media.stage) return false;
  const islot = normalizeTrackerSlotKey(item.slot);
  const mslot = normalizeTrackerSlotKey(media.slot);
  if (mslot && islot === mslot) return true;
  if (mslot === 'front' && !islot && mediaRepresentsSavedPhoto(item)) return true;
  return false;
}

function getCompletedGateIndex(stage?: ServiceStage | null) {
  if (!stage || stage === 'confirmed') return -1;
  if (stage === 'completed' || stage === 'released') return TRACKER_GATES.length - 1;
  return TRACKER_GATE_STAGE_IDS.indexOf(stage);
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
  const awaitingPosBalance = rawStatus === 'ready_for_payment';
  const normalizedStage = rawStage === 'released' || rawStage === 'completed' ? 'ready_pickup' : rawStage;
  const statusComplete = rawStatus === 'completed' || rawStatus === 'released';
  const stageComplete = rawStage === 'ready_pickup' || rawStage === 'completed' || rawStage === 'released';
  const completedIndex = Math.max(getCompletedGateIndex(normalizedStage), statusComplete ? TRACKER_GATES.length - 1 : -1);
  const isComplete = stageComplete || statusComplete || completedIndex >= TRACKER_GATES.length - 1;
  const isReleased = rawStage === 'released' || rawStatus === 'released';
  const activeIndex = isComplete ? TRACKER_GATES.length - 1 : Math.min(Math.max(completedIndex + 1, 0), TRACKER_GATES.length - 1);
  let progressPct = Math.max(0, Math.min(100, (completedIndex + 1) * 25));
  if (awaitingPosBalance && rawStage === 'ready_pickup') progressPct = 100;

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
      className={`group w-full rounded-2xl py-3.5 pl-3.5 pr-3.5 text-left transition-all duration-200 ${
        selected
          ? 'bg-blue-50/70 shadow-[0_12px_36px_-8px_rgba(37,99,235,0.22)]'
          : 'bg-white shadow-[0_8px_28px_-6px_rgba(15,23,42,0.08)] hover:bg-white hover:shadow-[0_14px_40px_-8px_rgba(37,99,235,0.14)]'
      } ${tracker.isComplete ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
            {truncateOrderId(job.jobId)}
          </p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{formatCustomer(job.customer)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600">
          {tracker.progressPct}%
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-slate-500">
        {vehicleDisplay} + {serviceDisplay}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${tracker.currentGate.dotClass}`} />
          <span className="truncate">{tracker.currentGate.shortLabel}</span>
        </span>
        {warning ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-100">
            <AlertTriangle className="h-3 w-3" />
            Update
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        <MiniProgressBar job={job} />
      </div>
    </button>
  );
}

function MilestoneStepper({ job }: { job: QCJob }) {
  const tracker = getTrackerState(job);

  return (
    <div className="shrink-0 bg-transparent px-6 py-4">
      <div className="rounded-[24px] bg-white/90 px-5 py-4 shadow-[0_12px_40px_-10px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.95)]">
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
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-black tabular-nums transition ${
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : active
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-300 bg-white text-slate-400'
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

function PhotoComplianceCard({ job }: { job: QCJob }) {
  const mediaList = getMediaList(job);
  const tracker = getTrackerState(job);
  const currentCount = countFilledGateSlots(mediaList, tracker.currentGate.id);

  return (
    <section className="qc-live-panel rounded-[24px] bg-white/95 p-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.1)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Photo compliance</p>
          <h3 className="mt-1 text-sm font-black text-slate-950">Required gates</h3>
        </div>
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white tabular-nums">
          {currentCount}/5
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {TRACKER_GATES.map((gate, index) => {
          const m = countFilledGateSlots(mediaList, gate.id);
          const complete = m >= REQUIRED_SLOT_COUNT;
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
                  {m}/5 photos
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

function OrderInfoCard({ job }: { job: QCJob }) {
  const warning = needsCustomerUpdate(job);
  return (
    <section className="qc-live-panel rounded-[24px] bg-white/95 p-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.1)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <UserCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Order info</p>
          <h3 className="mt-1 text-sm font-black text-slate-950">Handoff details</h3>
        </div>
      </div>

      <dl className="mt-4 space-y-3 text-xs">
        <div className="rounded-2xl bg-slate-50/75 px-3 py-2.5">
          <dt className="font-bold text-slate-400">Technician</dt>
          <dd className="mt-1 font-black text-slate-900">{formatTitle(getLeadTechnician(job), '-')}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-400">Est. completion</dt>
          <dd className="mt-1 font-black text-slate-900">{(job as any).estimatedCompletion || 'End of service day'}</dd>
        </div>
        <div>
          <dt className="font-bold text-slate-400">Customer visibility</dt>
          <dd className={`mt-1 font-black ${warning ? 'text-amber-600' : 'text-emerald-600'}`}>
            {warning ? 'Needs update' : 'Current'}
          </dd>
        </div>
        {String((job as any).paymentStatus || '').toLowerCase() === 'paid' && (job as any).invoiceId ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
            <dt className="font-bold text-emerald-700">Digital receipt</dt>
            <dd className="mt-1 font-mono text-[11px] font-black text-emerald-900">{String((job as any).invoiceId)}</dd>
            <p className="mt-1 text-[10px] font-semibold text-emerald-700/80">POS payment recorded — customer tracker updated.</p>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function CurrentGateCard({
  job,
  detailsLoading,
  onUploadStagePhoto,
  onDeleteTrackerStagePhoto,
  onLocalStageMedia,
}: {
  job: QCJob;
  detailsLoading?: boolean;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; slot?: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onDeleteTrackerStagePhoto: (orderId: string, payload: { stage: string; slot: string }) => Promise<boolean>;
  onLocalStageMedia: (id: string, media: TrackerMedia) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingSlot, setPendingSlot] = useState<TrackerPhotoSlotKey | null>(null);
  const [uploadingSlots, setUploadingSlots] = useState<Partial<Record<TrackerPhotoSlotKey, boolean>>>({});
  const [removingSlots, setRemovingSlots] = useState<Partial<Record<TrackerPhotoSlotKey, boolean>>>({});

  const tracker = getTrackerState(job);
  const mediaList = getMediaList(job);
  const currentStage = tracker.currentGate.id;
  const GateIcon = tracker.currentGate.Icon;
  const filledCount = countFilledGateSlots(mediaList, currentStage);
  const gateTitle = `${tracker.currentGate.label.toUpperCase()} — Gate ${tracker.activeIndex + 1} of ${TRACKER_GATES.length}`;

  const triggerUpload = (slot: TrackerPhotoSlotKey) => {
    setPendingSlot(slot);
    requestAnimationFrame(() => inputRef.current?.click());
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const slot = pendingSlot;
    setPendingSlot(null);
    if (!file || !slot) return;

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
    }

    if (!ok) {
      onLocalStageMedia(job.id, { stage: currentStage, slot, photoUrl: '' });
      URL.revokeObjectURL(previewUrl);
    }
  };

  const removeSlot = async (slot: TrackerPhotoSlotKey) => {
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
    <section className="qc-live-panel rounded-[26px] bg-white/95 p-5 shadow-[0_12px_44px_-12px_rgba(15,23,42,0.1)]">
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
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white tabular-nums">
          <ImageIcon className="h-3.5 w-3.5 opacity-90" strokeWidth={2} />
          {filledCount}/5 photos
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TRACKER_PHOTO_SLOT_KEYS.map((slot) => {
          const entry = getMediaForSlot(mediaList, currentStage, slot);
          const filled = mediaRepresentsSavedPhoto(entry);
          const canRenderImage = mediaHasRenderablePhotoUrl(entry);
          const uploading = !!uploadingSlots[slot];
          const removing = !!removingSlots[slot];
          const busy = uploading || removing;
          const prompt = slotPromptForGate(currentStage, slot);
          return (
            <div
              key={slot}
              className="flex flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_6px_28px_-6px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]"
            >
              <div className="flex items-center justify-between gap-1 bg-slate-50/95 px-2.5 py-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                  {TRACKER_PHOTO_SLOT_SHORT[slot]}
                </span>
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
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => triggerUpload(slot)}
                  disabled={busy}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-b-[18px] bg-slate-50/80 px-2 text-slate-500 shadow-[inset_0_2px_12px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 hover:shadow-[inset_0_2px_14px_rgba(37,99,235,0.08)] hover:text-slate-800 disabled:opacity-45"
                >
                  {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" strokeWidth={1.5} />}
                  <span className="px-1 text-center text-[10px] font-bold leading-snug text-slate-500">{prompt}</span>
                </button>
              )}
              {filled ? (
                <p className="line-clamp-2 bg-slate-50/80 px-2 py-1.5 text-[10px] font-semibold leading-snug text-slate-500">
                  {prompt}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        All 5 angles required before advancing this gate
      </p>
    </section>
  );
}

function GateActionBar({
  job,
  onAdvance,
  onLocalStageUpdate,
}: {
  job: QCJob;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onLocalStageUpdate: (id: string, stage: ServiceStage) => void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const tracker = getTrackerState(job);
  const mediaList = getMediaList(job);
  const currentStage = tracker.currentGate.id;
  const gateReady = gateHasAllSlots(mediaList, currentStage);
  const readyPickupComplete = gateHasAllSlots(mediaList, 'ready_pickup');
  const canRelease = tracker.isComplete && !tracker.isReleased;
  const advanceLabel = tracker.nextGate
    ? `Complete gate & advance to ${tracker.nextGate.label}`
    : 'Complete gate & mark Ready for Pickup';

  const advanceGate = async () => {
    if (!tracker.isComplete && !gateReady) {
      toast.error('Upload all 5 photos to advance', {
        description: `${tracker.currentGate.label} requires five angle photos before this gate can be completed.`,
      });
      return;
    }

    if (tracker.isComplete && !readyPickupComplete && !tracker.isReleased) {
      toast.error('Upload all 5 photos to advance', {
        description: 'Ready for Pickup requires five final photos before the vehicle can be marked released.',
      });
      return;
    }

    setAdvancing(true);
    const target = tracker.isComplete ? ('released' as ServiceStage) : currentStage;
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
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {tracker.isComplete ? (
            <button
              type="button"
              onClick={() => advanceGate()}
              disabled={advancing || tracker.isReleased || !readyPickupComplete}
              className={`inline-flex h-11 min-w-[220px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition disabled:opacity-50 ${
                tracker.isReleased
                  ? 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'
                  : readyPickupComplete
                    ? 'bg-[#E8650A] text-white shadow-md hover:opacity-95'
                    : 'bg-slate-200 text-slate-500 ring-1 ring-slate-300/80'
              }`}
            >
              {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {canRelease ? 'Mark vehicle as released' : 'Vehicle released'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => advanceGate()}
              disabled={advancing || !gateReady}
              className={`inline-flex h-11 min-w-[280px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition disabled:opacity-50 ${
                gateReady
                  ? 'bg-[#E8650A] text-white shadow-md hover:opacity-95'
                  : 'bg-slate-200 text-slate-500 ring-1 ring-slate-300/80'
              }`}
            >
              {advancing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : gateReady ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {gateReady ? advanceLabel : 'Upload all 5 photos to advance'}
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
    <section className="qc-live-panel rounded-[26px] bg-white/95 p-5 shadow-[0_12px_44px_-12px_rgba(15,23,42,0.1)]">
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

      <div className="mt-4 rounded-[22px] bg-slate-50/90 p-3 shadow-[inset_0_2px_12px_rgba(15,23,42,0.04)]">
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
          <div className="rounded-[22px] bg-slate-50/90 px-4 py-8 text-center shadow-[inset_0_2px_16px_rgba(15,23,42,0.04)]">
            <p className="text-sm font-black text-slate-700">No updates posted yet.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Service notes will appear here chronologically.</p>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="rounded-[22px] bg-slate-50/80 px-4 py-3 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.07)]">
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

function SelectedOrderPanel({
  job,
  detailsLoading,
  onAdvance,
  onUploadStagePhoto,
  onDeleteTrackerStagePhoto,
  onAddStaffNote,
  onLocalStageUpdate,
  onLocalStageMedia,
  onLocalStaffNote,
}: {
  job: QCJob;
  detailsLoading?: boolean;
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
}) {
  const tracker = getTrackerState(job);
  const warning = needsCustomerUpdate(job);
  const vehicleDisplay = formatVehicle(job);
  const serviceDisplay = formatService(job);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-gradient-to-b from-slate-50/70 via-white to-slate-50/70">
      <div className="shrink-0 bg-white/80 px-6 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.035)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{job.jobId}</p>
            <h2 className="mt-1 truncate text-xl font-black tracking-tight text-slate-950">{formatCustomer(job.customer)}</h2>
            <p className="mt-1 truncate text-sm font-bold text-slate-600">{vehicleDisplay}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">{serviceDisplay}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
              <Wifi className="h-3.5 w-3.5" />
              Live
            </span>
            {warning ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                Needs Customer Update
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 ring-1 ring-blue-100">
              <span className={`h-2 w-2 rounded-full ${tracker.currentGate.dotClass}`} />
              {tracker.currentGate.label}
            </span>
            <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-black tabular-nums text-white">
              {tracker.progressPct}%
            </span>
          </div>
        </div>
      </div>

      <MilestoneStepper job={job} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 280px)' }}>
          <div className="min-w-0 space-y-5">
            <CurrentGateCard
              key={`${job.id}-${tracker.currentGate.id}`}
              job={job}
              detailsLoading={detailsLoading}
              onUploadStagePhoto={onUploadStagePhoto}
              onDeleteTrackerStagePhoto={onDeleteTrackerStagePhoto}
              onLocalStageMedia={onLocalStageMedia}
            />
            <ShopFloorLogCard job={job} onAddStaffNote={onAddStaffNote} onLocalStaffNote={onLocalStaffNote} />
          </div>

          <aside className="sticky top-0 h-fit space-y-5 self-start">
            <OrderInfoCard job={job} />
            <PhotoComplianceCard job={job} />
          </aside>
        </div>
      </div>

      <GateActionBar job={job} onAdvance={onAdvance} onLocalStageUpdate={onLocalStageUpdate} />
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
}) {
  const [localJobs, setLocalJobs] = useState<QCJob[]>(jobs);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedOrderDetailsLoading, setSelectedOrderDetailsLoading] = useState(false);
  const selectedDetailRequestRef = useRef(0);

  useEffect(() => {
    setLocalJobs((prev) => {
      if (jobs.length === 0 && prev.length > 0) return prev;

      const prevById = new Map(prev.map((j) => [j.id, j]));
      return jobs.map((job) => {
        const old = prevById.get(job.id);
        if (!old) return job;
        const nServer = countTrackerPhotoUrls(job.trackerStageMedia as TrackerMedia[] | undefined);
        const nLocal = countTrackerPhotoUrls(old.trackerStageMedia as TrackerMedia[] | undefined);
        const renderableServer = countRenderableTrackerPhotoUrls(job.trackerStageMedia as TrackerMedia[] | undefined);
        const renderableLocal = countRenderableTrackerPhotoUrls(old.trackerStageMedia as TrackerMedia[] | undefined);
        if (nLocal > nServer || renderableLocal > renderableServer) {
          return { ...job, trackerStageMedia: old.trackerStageMedia };
        }
        return job;
      });
    });
  }, [jobs]);

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

  useEffect(() => {
    if (trackedOrders.length === 0) {
      if (selectedJobId) setSelectedJobId(null);
      return;
    }

    if (selectedJobId && trackedOrders.some((job) => job.id === selectedJobId)) return;

    const firstActive = trackedOrders.find((job) => !getTrackerState(job).isComplete);
    setSelectedJobId((firstActive || trackedOrders[0]).id);
  }, [selectedJobId, trackedOrders]);

  const selectedJob = useMemo(
    () => trackedOrders.find((job) => job.id === selectedJobId) || trackedOrders[0] || null,
    [selectedJobId, trackedOrders]
  );

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
            staffNotes: Array.isArray((detail as any).staffNotes) ? (detail as any).staffNotes : job.staffNotes,
            notes: typeof (detail as any).notes === 'string' ? (detail as any).notes : job.notes,
            photos: (detail as any).photos || job.photos,
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
      const ok = await onUploadStagePhoto(orderId, payload);
      if (ok) void refreshSelectedOrderDetails(orderId, { silent: true });
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

  if (loading) {
    return (
      <div className="qc-live-shell h-[calc(100vh-96px)] w-full overflow-hidden rounded-[34px] bg-white/95 p-3 shadow-[0_24px_70px_-16px_rgba(15,23,42,0.14)]">
        <div className="flex h-full gap-3">
          <div className="w-[300px] shrink-0 rounded-[26px] bg-slate-50/80 p-4">
            <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-5 space-y-3">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-32 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          </div>
          <div className="flex-1 p-5">
            <div className="h-full animate-pulse rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (trackedOrders.length === 0) {
    return (
      <div className="qc-live-panel flex h-[calc(100vh-96px)] flex-col items-center justify-center rounded-[34px] bg-white/95 text-center shadow-[0_20px_60px_-14px_rgba(15,23,42,0.12)]">
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
    <div className="qc-live-shell h-[calc(100vh-96px)] w-full overflow-hidden rounded-[34px] bg-white/95 p-3 shadow-[0_24px_70px_-16px_rgba(15,23,42,0.14)]">
      <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
        <aside className="flex h-[320px] w-full shrink-0 flex-col overflow-hidden rounded-[28px] bg-slate-50/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] lg:h-full lg:w-[300px]">
          <div className="flex items-center justify-between gap-3 px-5 py-5">
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950">Live Orders</p>
              <p className="text-xs font-semibold text-slate-400">Today active lane</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black tabular-nums text-emerald-700 ring-1 ring-emerald-100">
              {activeCount}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {trackedOrders.map((job) => (
              <OrderSidebarCard
                key={job.id}
                job={job}
                selected={job.id === selectedJob?.id}
                onSelect={() => setSelectedJobId(job.id)}
              />
            ))}
          </div>
        </aside>

        {selectedJob ? (
          <SelectedOrderPanel
            key={selectedJob.id}
            job={selectedJob}
            detailsLoading={selectedOrderDetailsLoading}
            onAdvance={handleAdvance}
            onUploadStagePhoto={handleUploadStagePhoto}
            onDeleteTrackerStagePhoto={handleDeleteTrackerStagePhoto}
            onAddStaffNote={handleAddStaffNote}
            onLocalStageUpdate={updateLocalStage}
            onLocalStageMedia={upsertLocalMedia}
            onLocalStaffNote={addLocalStaffNote}
          />
        ) : null}
      </div>
    </div>
  );
}
