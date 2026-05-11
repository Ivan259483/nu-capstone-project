import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  ImageIcon,
  Loader2,
  PackageCheck,
  Plus,
  Radio,
  ShieldCheck,
  UploadCloud,
  UserCheck,
  Wifi,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import type { QCJob } from '@/hooks/useQCData';
import type { ServiceStage } from './QCServiceControlPanel';

type TrackerMedia = {
  stage?: string;
  photoUrl?: string;
  description?: string;
  uploadedAt?: string;
  uploadedBy?: string;
};

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
const TRACKED_ORDER_STATUSES = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'completed', 'released'];
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

function hasStagePhoto(mediaList: TrackerMedia[], stage: string): boolean {
  return mediaList.some((media) => media.stage === stage && !!media.photoUrl?.trim());
}

function getStagePhoto(mediaList: TrackerMedia[], stage: string): TrackerMedia | undefined {
  return mediaList.find((media) => media.stage === stage && !!media.photoUrl?.trim());
}

function getCompletedGateIndex(stage?: ServiceStage | null) {
  if (!stage || stage === 'confirmed') return -1;
  if (stage === 'completed' || stage === 'released') return TRACKER_GATES.length - 1;
  return TRACKER_GATE_STAGE_IDS.indexOf(stage);
}

function stageToOrderStatus(stage: ServiceStage, fallback?: string) {
  if (stage === 'received') return 'received';
  if (stage === 'in_progress' || stage === 'quality_check' || stage === 'ready_pickup') return 'in_progress';
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
  const completedIndex = Math.max(getCompletedGateIndex(normalizedStage), statusComplete ? TRACKER_GATES.length - 1 : -1);
  const isComplete = stageComplete || statusComplete || completedIndex >= TRACKER_GATES.length - 1;
  const isReleased = rawStage === 'released' || rawStatus === 'released';
  const activeIndex = isComplete ? TRACKER_GATES.length - 1 : Math.min(Math.max(completedIndex + 1, 0), TRACKER_GATES.length - 1);
  const progressPct = Math.max(0, Math.min(100, (completedIndex + 1) * 25));

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
      className={`group w-full rounded-xl border py-3 pl-3 pr-3 text-left transition ${
        selected
          ? 'border-slate-300 border-l-[3px] border-l-slate-950 bg-slate-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
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
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
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
    <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
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
                  className={`absolute left-1/2 top-3.5 h-0.5 w-full transition-colors ${
                    lineDone ? 'bg-emerald-500' : 'bg-slate-200'
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
  );
}

function PhotoComplianceCard({ job }: { job: QCJob }) {
  const mediaList = getMediaList(job);
  const uploadedCount = TRACKER_GATES.filter((gate) => hasStagePhoto(mediaList, gate.id)).length;
  const tracker = getTrackerState(job);

  return (
    <section className="qc-live-panel rounded-2xl border border-slate-200/80 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Photo compliance</p>
          <h3 className="mt-1 text-sm font-black text-slate-950">Required gates</h3>
        </div>
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white">
          {uploadedCount}/4
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {TRACKER_GATES.map((gate, index) => {
          const uploaded = hasStagePhoto(mediaList, gate.id);
          const requiredNow = !uploaded && !tracker.isComplete && index === tracker.activeIndex;
          const statusLabel = uploaded ? 'Done' : requiredNow ? 'Required now' : 'Waiting';
          const GateIcon = gate.Icon;
          return (
            <div key={gate.id} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  uploaded ? 'bg-emerald-500' : requiredNow ? gate.dotClass : 'bg-slate-300'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-xs font-black text-slate-800">
                  <GateIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{gate.label}</span>
                </p>
                <p className={`text-[10px] font-bold ${uploaded ? 'text-emerald-600' : requiredNow ? 'text-amber-600' : 'text-slate-400'}`}>
                  {statusLabel}
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
    <section className="qc-live-panel rounded-2xl border border-slate-200/80 bg-white p-4">
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
        <div className="border-t border-slate-100 pt-3">
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
      </dl>
    </section>
  );
}

function CurrentGateCard({
  job,
  onUploadStagePhoto,
  onLocalStageMedia,
}: {
  job: QCJob;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onLocalStageMedia: (id: string, media: TrackerMedia) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const tracker = getTrackerState(job);
  const mediaList = getMediaList(job);
  const currentStage = tracker.currentGate.id;
  const currentPhoto = getStagePhoto(mediaList, currentStage);
  const caption = captionDrafts[currentStage] ?? currentPhoto?.description ?? '';
  const GateIcon = tracker.currentGate.Icon;

  const gateTitle = `${tracker.currentGate.label} - Gate ${tracker.activeIndex + 1} of ${TRACKER_GATES.length}`;

  const triggerUpload = () => {
    inputRef.current?.click();
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    const ok = await onUploadStagePhoto(job.id, {
      stage: currentStage,
      description: caption,
      file,
    });
    if (ok) {
      const previewUrl = URL.createObjectURL(file);
      onLocalStageMedia(job.id, {
        stage: currentStage,
        photoUrl: previewUrl,
        description: caption,
        uploadedAt: new Date().toISOString(),
      });
    }
    setUploading(false);
  };

  return (
    <section className="qc-live-panel rounded-2xl border border-slate-200/80 bg-white p-5">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelected} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <GateIcon className="h-3.5 w-3.5" />
            Current gate
          </div>
          <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">{gateTitle}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{tracker.currentGate.sub}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-100">
          <CircleAlert className="h-3.5 w-3.5" />
          Photo required
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          {currentPhoto?.photoUrl ? (
            <img src={currentPhoto.photoUrl} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-slate-400">
              <ImageIcon className="h-8 w-8 opacity-60" strokeWidth={1.4} />
              <p className="text-xs font-black uppercase tracking-[0.12em]">No photo yet</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={triggerUpload}
          disabled={uploading}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-slate-400 hover:bg-white hover:text-slate-800 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <UploadCloud className="h-8 w-8" strokeWidth={1.6} />}
          <span className="text-xs font-black uppercase tracking-[0.14em]">{currentPhoto?.photoUrl ? 'Replace photo' : 'Upload photo'}</span>
        </button>
      </div>

      <div className="mt-4">
        <label className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Photo caption</label>
        <textarea
          value={caption}
          onChange={(event) => setCaptionDrafts((prev) => ({ ...prev, [currentStage]: event.target.value }))}
          placeholder="Short caption (optional, customer-facing)"
          rows={2}
          className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/70"
        />
      </div>
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
  const missingCurrentPhoto = !hasStagePhoto(mediaList, currentStage);
  const canRelease = tracker.isComplete && !tracker.isReleased;
  const advanceLabel = tracker.nextGate
    ? `Complete gate & advance to ${tracker.nextGate.label}`
    : 'Complete gate & mark Ready for Pickup';

  const advanceGate = async (skipPhoto = false) => {
    if (!skipPhoto && missingCurrentPhoto && !tracker.isComplete) {
      toast.error('Upload the milestone photo first', {
        description: `${tracker.currentGate.label} requires a customer-facing photo before the primary gate completion.`,
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
    <div className="sticky bottom-0 z-20 shrink-0 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-14px_34px_rgba(15,23,42,0.06)]">
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
              onClick={() => advanceGate(false)}
              disabled={advancing || tracker.isReleased}
              className="inline-flex h-11 min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-45"
            >
              {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {canRelease ? 'Mark vehicle as released' : 'Vehicle released'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => advanceGate(false)}
                disabled={advancing || missingCurrentPhoto}
                className="inline-flex h-11 min-w-[280px] items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-45"
              >
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {advanceLabel}
              </button>
              <button
                type="button"
                onClick={() => advanceGate(true)}
                disabled={advancing}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-45"
              >
                Skip photo
              </button>
            </>
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
    <section className="qc-live-panel rounded-2xl border border-slate-200/80 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Shop floor log
          </div>
          <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">Latest service updates</h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
          {updates.length} entries
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        <label className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Post update</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={2}
            placeholder="Add a concise shop-floor update"
            className="min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/70"
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
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
            <p className="text-sm font-black text-slate-700">No updates posted yet.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Service notes will appear here chronologically.</p>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
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
  onAdvance,
  onUploadStagePhoto,
  onAddStaffNote,
  onLocalStageUpdate,
  onLocalStageMedia,
  onLocalStaffNote,
}: {
  job: QCJob;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
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
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 220px' }}>
          <div className="min-w-0 space-y-5">
            <CurrentGateCard
              key={`${job.id}-${tracker.currentGate.id}`}
              job={job}
              onUploadStagePhoto={onUploadStagePhoto}
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
  onAddStaffNote,
}: {
  jobs: QCJob[];
  loading: boolean;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onSaveStaff: (id: string, assignments: { slot: string; name: string; role: string }[]) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onAddStaffNote: (orderId: string, content: string) => Promise<boolean>;
}) {
  const [localJobs, setLocalJobs] = useState<QCJob[]>(jobs);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    setLocalJobs(jobs);
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

  const upsertLocalMedia = useCallback((id: string, media: TrackerMedia) => {
    setLocalJobs((current) =>
      current.map((job) => {
        if (job.id !== id) return job;
        const existing = getMediaList(job);
        const next = [
          ...existing.filter((item) => item.stage !== media.stage),
          {
            ...existing.find((item) => item.stage === media.stage),
            ...media,
          },
        ];
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
      <div className="qc-live-shell h-[calc(100vh-108px)] overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="flex h-full">
          <div className="w-[240px] shrink-0 border-r border-slate-200 bg-white p-4">
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
      <div className="qc-live-panel flex h-[calc(100vh-108px)] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200/90 bg-white text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
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
    <div className="qc-live-shell h-[calc(100vh-108px)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside className="flex h-[320px] w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:h-full lg:w-[240px] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950">Live Orders</p>
              <p className="text-xs font-semibold text-slate-400">Today active lane</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black tabular-nums text-emerald-700 ring-1 ring-emerald-100">
              {activeCount}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
            onAdvance={onAdvance}
            onUploadStagePhoto={onUploadStagePhoto}
            onAddStaffNote={onAddStaffNote}
            onLocalStageUpdate={updateLocalStage}
            onLocalStageMedia={upsertLocalMedia}
            onLocalStaffNote={addLocalStaffNote}
          />
        ) : null}
      </div>
    </div>
  );
}
