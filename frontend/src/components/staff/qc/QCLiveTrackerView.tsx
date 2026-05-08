import React, { useState, useRef, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Car,
  ChevronDown,
  CircleAlert,
  Clock,
  ClipboardCheck,
  LogOut,
  CheckCircle2,
  Users,
  UserCheck,
  Loader2,
  MapPin,
  Wrench,
  ShieldCheck,
  PackageCheck,
  Radio,
  PlayCircle,
  Flag,
  CalendarCheck,
  Camera,
  Plus,
  ImageIcon,
  Gauge,
  Images,
  UploadCloud,
  Wifi,
} from 'lucide-react';
import type { QCJob } from '@/hooks/useQCData';
import type { ServiceStage } from './QCServiceControlPanel';
import { SERVICE_STAFF_ROSTER } from './QCServiceControlPanel';
import { toast } from 'sonner';

/**
 * Service progress stepper — four defense milestones (photos required per stage in Milestone vehicle photos).
 * Maps 1:1 to backend `serviceTrackingStage` after intake.
 */
const SERVICE_PROGRESS_MILESTONES = [
  { pct: 25, label: 'Vehicle Arrive' },
  { pct: 50, label: 'Service In Progress' },
  { pct: 75, label: 'Quality Check' },
  { pct: 100, label: 'Ready for Pickup' },
] as const;

const BACKEND_FLOW: ServiceStage[] = ['received', 'in_progress', 'quality_check', 'ready_pickup'];

const STAGES: {
  id: ServiceStage;
  label: string;
  sub: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  dot: string;
}[] = [
  {
    id: 'received',
    label: 'Vehicle Arrive',
    sub: 'Vehicle at shop / intake',
    Icon: Car,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#e2e8f0',
    dot: '#0f172a',
  },
  {
    id: 'in_progress',
    label: 'Service In Progress',
    sub: 'Active work on vehicle',
    Icon: Wrench,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#e2e8f0',
    dot: '#0f172a',
  },
  {
    id: 'quality_check',
    label: 'Quality Check',
    sub: 'Final inspection',
    Icon: ShieldCheck,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#e2e8f0',
    dot: '#0f172a',
  },
  {
    id: 'ready_pickup',
    label: 'Ready for Pickup',
    sub: 'Ready for customer pickup',
    Icon: PackageCheck,
    color: '#0f172a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    dot: '#15803d',
  },
];
const STAGE_ORDER: ServiceStage[] = STAGES.map(s => s.id);
function stageIdx(s?: ServiceStage | null) {
  return s ? STAGE_ORDER.indexOf(s) : -1;
}

/** Stepper: four milestones; doneMax/current index into SERVICE_PROGRESS_MILESTONES. */
function enterpriseStepState(stage: ServiceStage | null | undefined): {
  doneMax: number;
  current: number;
  progressPct: number;
  statusLine: string;
} {
  const st = stage ?? null;
  if (!st || st === 'confirmed') {
    return { doneMax: -1, current: 0, progressPct: 0, statusLine: 'Awaiting vehicle arrive' };
  }
  if (st === 'received') {
    return { doneMax: -1, current: 0, progressPct: 25, statusLine: '25% · Vehicle Arrive' };
  }
  if (st === 'in_progress') {
    return { doneMax: 0, current: 1, progressPct: 50, statusLine: '50% · Service In Progress' };
  }
  if (st === 'quality_check') {
    return { doneMax: 1, current: 2, progressPct: 75, statusLine: '75% · Quality Check' };
  }
  if (st === 'ready_pickup') {
    return { doneMax: 2, current: 3, progressPct: 100, statusLine: '100% · Ready for Pickup' };
  }
  if (st === 'completed') {
    return { doneMax: 2, current: 3, progressPct: 100, statusLine: '100% · Ready for Pickup' };
  }
  return { doneMax: -1, current: 0, progressPct: 0, statusLine: 'Scheduled' };
}

const STAGE_PHOTO_UPLOAD_ROWS: { stage: ServiceStage; label: string; hint: string; Icon: LucideIcon }[] = [
  { stage: 'confirmed', label: 'Appointment confirmed', hint: 'Optional note for the customer (photo not required).', Icon: CalendarCheck },
  ...STAGES.map((s) => ({
    stage: s.id,
    label: `${s.label} — customer photo`,
    hint: `Upload the image customers see at this milestone (${s.sub}).`,
    Icon: s.Icon,
  })),
];

function relTime(iso?: string) {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

const toTitleCase = (str: string) =>
  str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

function formatTitle(value?: string | null, fallback = '—') {
  const formatted = toTitleCase(String(value ?? '').trim());
  return formatted || fallback;
}

function formatPlate(value?: string | null, fallback = '—') {
  const formatted = String(value ?? '').trim().toUpperCase();
  return formatted || fallback;
}

function formatVehicle(job: QCJob) {
  return (
    [job.vehicleYear, formatTitle(job.vehicleMake || job.make, ''), formatTitle(job.vehicleModel, '')]
      .filter(Boolean)
      .join(' ') ||
    formatTitle(job.vehicle, '—')
  );
}

function formatCustomer(value?: string | null) {
  return formatTitle(value, 'Customer');
}

function stageLabel(stage?: string | null) {
  return STAGES.find((s) => s.id === stage)?.label || 'Awaiting vehicle arrive';
}

type FeedItem = { id: string; title: string; sub: string; badge: string; sortKey: number };

function buildServiceFeed(job: QCJob): FeedItem[] {
  const items: FeedItem[] = [];
  const notes = job.staffNotes || [];
  notes.forEach((n, i) => {
    const t = (n as any).createdAt ? new Date((n as any).createdAt).getTime() : 0;
    const content = String((n as any).content || '').trim();
    if (!content || content.startsWith('[QC_RETURN]')) return;
    items.push({
      id: `note-${i}-${t}`,
      title: content.length > 72 ? `${content.slice(0, 72)}…` : content,
      sub: relTime((n as any).createdAt) || 'Recently',
      badge: 'Update',
      sortKey: t || Date.now() - i,
    });
  });
  const media = ((job as any).trackerStageMedia || []) as { stage?: string; photoUrl?: string; description?: string; uploadedAt?: string }[];
  media.forEach((m, i) => {
    const t = m.uploadedAt ? new Date(m.uploadedAt).getTime() : 0;
    const title = m.description?.trim() || (m.photoUrl ? `Tracker photo · ${m.stage || 'stage'}` : 'Tracker update');
    items.push({
      id: `media-${i}-${t}`,
      title,
      sub: relTime(m.uploadedAt) || 'Recently',
      badge: m.photoUrl ? 'Completed' : 'In progress',
      sortKey: t || 0,
    });
  });
  return items.sort((a, b) => b.sortKey - a.sortKey).slice(0, 12);
}

/** Defense requirement: real vehicle photo at each major milestone (25% → 100%). */
const VEHICLE_MILESTONE_PHOTOS: {
  stage: ServiceStage;
  pct: number;
  defenseLabel: string;
  sub: string;
  Icon: LucideIcon;
}[] = [
  { stage: 'received', pct: 25, defenseLabel: 'Vehicle Arrive', sub: 'Photo of vehicle at intake', Icon: Car },
  { stage: 'in_progress', pct: 50, defenseLabel: 'Service In Progress', sub: 'Photo during active work', Icon: Wrench },
  { stage: 'quality_check', pct: 75, defenseLabel: 'Quality Check', sub: 'Photo at QC / inspection', Icon: ShieldCheck },
  { stage: 'ready_pickup', pct: 100, defenseLabel: 'Ready for Pickup', sub: 'Photo before handoff', Icon: PackageCheck },
];

function hasStagePhoto(
  mediaList: { stage?: string; photoUrl?: string }[],
  stage: string
): boolean {
  return mediaList.some((m) => m.stage === stage && !!m.photoUrl?.trim());
}

// ── Staff Picker ───────────────────────────────────────────────────────────────
function StaffPicker({
  slotLabel,
  value,
  onChange,
}: {
  slotLabel: string;
  value: string;
  onChange: (name: string, role: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const initials = value ? value.split(' ').map((p) => p[0]).join('').slice(0, 2) : '?';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 outline-none focus:ring-2 focus:ring-slate-200 ${
          value
            ? 'border-slate-200 bg-white shadow-sm hover:border-slate-300'
            : 'border-slate-200/90 bg-slate-50/50 hover:border-slate-300'
        }`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            value ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
          }`}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{slotLabel}</p>
          <p className={`truncate text-xs font-medium ${value ? 'text-slate-900' : 'text-slate-400'}`}>
            {value || 'Assign'}
          </p>
        </div>
        <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="max-h-52 overflow-y-auto">
            {SERVICE_STAFF_ROSTER.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  onChange(s.name, s.role);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left text-xs hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{s.name}</span>
                <span className="text-slate-400">{s.role}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('', '');
              setOpen(false);
            }}
            className="w-full py-2 text-center text-[11px] font-medium text-rose-600 hover:bg-rose-50"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

const SLOTS = [
  { slot: 'staff1', label: 'Lead' },
  { slot: 'staff2', label: 'Exterior' },
  { slot: 'staff3', label: 'Interior' },
  { slot: 'staff4', label: 'Specialist' },
];

function JobTrackerCard({
  job,
  onAdvance,
  onSaveStaff,
  onUploadStagePhoto,
  onAddStaffNote,
}: {
  job: QCJob;
  onAdvance: (id: string, stage: ServiceStage) => Promise<boolean>;
  onSaveStaff: (id: string, assignments: { slot: string; name: string; role: string }[]) => Promise<boolean>;
  onUploadStagePhoto: (
    orderId: string,
    payload: { stage: string; description?: string; file?: File | null }
  ) => Promise<boolean>;
  onAddStaffNote: (orderId: string, content: string) => Promise<boolean>;
}) {
  const currentStage = (job as any).serviceTrackingStage as ServiceStage | null;
  const normalizedStageForFlow = currentStage === 'completed' ? 'ready_pickup' : currentStage;
  const curIdx = stageIdx(normalizedStageForFlow);
  const nextStage = currentStage === 'completed' ? undefined : (BACKEND_FLOW[curIdx + 1] as ServiceStage | undefined);
  const nextCfg = nextStage ? STAGES.find((s) => s.id === nextStage) : null;

  const mediaList = ((job as any).trackerStageMedia || []) as {
    stage: string;
    photoUrl?: string;
    description?: string;
    uploadedAt?: string;
  }[];

  const [staffSlots, setStaffSlots] = useState(() =>
    SLOTS.map((s) => {
      const ex = ((job as any).serviceStaffAssignments || []).find((a: any) => a.slot === s.slot);
      return { ...s, name: ex?.name || '', role: ex?.role || '' };
    })
  );
  const [advancingTo, setAdvancingTo] = useState<ServiceStage | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [stageNotes, setStageNotes] = useState<Record<string, string>>({});
  const [uploadingStage, setUploadingStage] = useState<string | null>(null);
  const [uploadTargetStage, setUploadTargetStage] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const hiddenPhotoInputRef = useRef<HTMLInputElement>(null);

  const feed = useMemo(() => buildServiceFeed(job), [job]);

  const stepState = enterpriseStepState(currentStage);
  const isPipelineComplete = !nextStage && (currentStage === 'ready_pickup' || currentStage === 'completed');

  const photoGateStage: ServiceStage | null =
    currentStage && ['received', 'in_progress', 'quality_check', 'ready_pickup'].includes(currentStage)
      ? currentStage
      : null;
  const blockedByMissingMilestonePhoto =
    !!photoGateStage && !hasStagePhoto(mediaList, photoGateStage);
  const releaseBlockedByPhoto = isPipelineComplete && !hasStagePhoto(mediaList, 'ready_pickup');

  const currentMilestonePhotoUrl =
    photoGateStage && hasStagePhoto(mediaList, photoGateStage)
      ? mediaList.find((m) => m.stage === photoGateStage && m.photoUrl)?.photoUrl
      : undefined;
  const previewPhoto =
    currentMilestonePhotoUrl ||
    [...mediaList].filter((m) => m.photoUrl).sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return tb - ta;
    })[0]?.photoUrl;

  const handleAdvance = async (stage: ServiceStage) => {
    setAdvancingTo(stage);
    await onAdvance(job.id, stage);
    setAdvancingTo(null);
  };

  const tryForwardAdvance = (target: ServiceStage) => {
    if (photoGateStage && !hasStagePhoto(mediaList, photoGateStage)) {
      const m = VEHICLE_MILESTONE_PHOTOS.find((x) => x.stage === photoGateStage);
      toast.error('Upload the milestone photo first', {
        description: m
          ? `${m.pct}% — ${m.defenseLabel}: add a real vehicle photo in the milestone row above, then advance.`
          : 'Add a photo for this stage before advancing.',
      });
      return;
    }
    void handleAdvance(target);
  };

  const tryRelease = () => {
    if (!hasStagePhoto(mediaList, 'ready_pickup')) {
      toast.error('Upload the 100% milestone photo first', {
        description: 'Ready for pickup — vehicle photo is required before marking released.',
      });
      return;
    }
    void handleAdvance('released' as ServiceStage);
  };

  const handleSaveStaff = async () => {
    setSavingStaff(true);
    await onSaveStaff(
      job.id,
      staffSlots.map(({ slot, name, role }) => ({ slot, name, role }))
    );
    setSavingStaff(false);
  };

  const triggerPhotoPick = (stage: string) => {
    setUploadTargetStage(stage);
    hiddenPhotoInputRef.current?.click();
  };

  const onHiddenPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const stage = uploadTargetStage;
    setUploadTargetStage(null);
    if (!stage) return;
    setUploadingStage(stage);
    await onUploadStagePhoto(job.id, {
      stage,
      description: stageNotes[stage],
      file: file || null,
    });
    setUploadingStage(null);
  };

  const submitStaffNote = async () => {
    if (!noteDraft.trim()) return;
    setAddingNote(true);
    const ok = await onAddStaffNote(job.id, noteDraft);
    if (ok) setNoteDraft('');
    setAddingNote(false);
  };

  const assignedCount = staffSlots.filter((s) => s.name).length;
  const vehicleDisplay = formatVehicle(job);
  const plateDisplay = job.plate?.length && job.plate.length > 20 ? '—' : formatPlate(job.plate);
  const customerDisplay = formatCustomer(job.customer);
  const serviceDisplay = String(job.serviceType || job.service || 'Service').trim() || 'Service';
  const leadTech = staffSlots.find((s) => s.name)?.name || job.technician || '—';

  const lastMediaAt = mediaList
    .map((m) => (m.uploadedAt ? new Date(m.uploadedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const visibilityFresh =
    lastMediaAt && Date.now() - lastMediaAt < 24 * 60 * 60 * 1000;
  const uploadedMilestoneCount = VEHICLE_MILESTONE_PHOTOS.filter((m) => hasStagePhoto(mediaList, m.stage)).length;
  const photoCompliancePct = Math.round((uploadedMilestoneCount / VEHICLE_MILESTONE_PHOTOS.length) * 100);
  const currentStageLabel =
    currentStage === 'completed'
      ? 'Ready for Pickup'
      : currentStage && currentStage !== 'confirmed'
        ? stageLabel(currentStage)
        : 'Awaiting arrival';
  const nextActionLabel = isPipelineComplete
    ? 'Release handoff'
    : nextCfg?.label || (!currentStage || currentStage === 'confirmed' ? 'Vehicle Arrive' : 'Final review');
  const lastPhotoLabel = lastMediaAt
    ? relTime(mediaList.find((m) => m.uploadedAt && new Date(m.uploadedAt).getTime() === lastMediaAt)?.uploadedAt)
    : 'No photos yet';

  const primaryCta = () => {
    if (isPipelineComplete) {
      return (
        <button
          type="button"
          onClick={tryRelease}
          disabled={!!advancingTo || releaseBlockedByPhoto}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {advancingTo === ('released' as ServiceStage) ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" strokeWidth={2} />
          )}
          Mark vehicle as released
        </button>
      );
    }
    if (!currentStage || currentStage === 'confirmed') {
      return (
        <button
          type="button"
          onClick={() => tryForwardAdvance('received')}
          disabled={!!advancingTo}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {advancingTo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Start service tracking
        </button>
      );
    }
    if (currentStage === 'quality_check' && nextStage) {
      return (
        <button
          type="button"
          onClick={() => tryForwardAdvance(nextStage)}
          disabled={!!advancingTo || blockedByMissingMilestonePhoto}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {advancingTo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Complete quality review
        </button>
      );
    }
    if (nextStage && nextCfg) {
      return (
        <button
          type="button"
          onClick={() => tryForwardAdvance(nextStage)}
          disabled={!!advancingTo || blockedByMissingMilestonePhoto}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {advancingTo ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ArrowRight className="h-4 w-4" />
              <span>Advance to {nextCfg.label}</span>
            </>
          )}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="qc-live-job-card overflow-hidden rounded-[30px] border border-slate-200/80 bg-white">
      <input
        ref={hiddenPhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onHiddenPhotoChange}
      />

      <div className="qc-live-hero relative overflow-hidden border-b border-slate-200/70 px-5 py-5 sm:px-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-950 via-blue-600 to-emerald-500" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">
                <Wifi size={12} strokeWidth={2.4} />
                Live service session
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                  visibilityFresh
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                    : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                }`}
              >
                {visibilityFresh ? <BadgeCheck size={12} /> : <CircleAlert size={12} />}
                {visibilityFresh ? 'Customer view current' : 'Needs customer update'}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{job.jobId}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
              <span className="text-slate-900">{vehicleDisplay}</span>
              {plateDisplay !== '—' && (
                <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[12px] font-black text-slate-700 shadow-sm">
                  {plateDisplay}
                </span>
              )}
              <span className="text-slate-300">/</span>
              <span>{customerDisplay}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                {serviceDisplay}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="qc-live-mini-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                  <Gauge size={13} />
                  Current gate
                </div>
                <p className="mt-2 truncate text-sm font-black text-slate-900">{currentStageLabel}</p>
              </div>
              <div className="qc-live-mini-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                  <Images size={13} />
                  Photo compliance
                </div>
                <p className="mt-2 text-sm font-black tabular-nums text-slate-900">
                  {uploadedMilestoneCount}/{VEHICLE_MILESTONE_PHOTOS.length} captured
                </p>
              </div>
              <div className="qc-live-mini-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                  <Clock size={13} />
                  Last photo
                </div>
                <p className="mt-2 truncate text-sm font-black text-slate-900">{lastPhotoLabel}</p>
              </div>
            </div>
          </div>

          <aside className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Service progress</p>
                <p className="mt-1 text-lg font-black text-slate-950">{stepState.statusLine}</p>
              </div>
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full p-1"
                style={{
                  background: `conic-gradient(#0f172a ${stepState.progressPct * 3.6}deg, #e2e8f0 0deg)`,
                }}
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-xl font-black tabular-nums text-slate-950">
                  {stepState.progressPct}%
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-bold text-slate-500">Next action</span>
                <span className="font-black text-slate-900">{nextActionLabel}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-slate-950 via-blue-600 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, stepState.progressPct))}%` }}
                />
              </div>
            </div>
            <div className="mt-4">{primaryCta()}</div>
            {blockedByMissingMilestonePhoto && photoGateStage ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-900">
                <CircleAlert className="mr-1 inline h-3.5 w-3.5" />
                Capture the {VEHICLE_MILESTONE_PHOTOS.find((x) => x.stage === photoGateStage)?.pct}% photo before advancing.
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <section className="qc-live-panel rounded-[24px] border border-slate-200/80 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <Activity size={13} />
                Milestone timeline
              </div>
              <h3 className="mt-1 text-base font-black tracking-tight text-slate-950">Service progress</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.13em] text-slate-600">
              {stepState.progressPct}% complete
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-slate-950 via-blue-600 to-emerald-500 transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, stepState.progressPct))}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            {SERVICE_PROGRESS_MILESTONES.map((m, idx) => {
              const stage = BACKEND_FLOW[idx];
              const stageCfg = STAGES.find((s) => s.id === stage);
              const done = idx <= stepState.doneMax;
              const current = idx === stepState.current;
              const hasPhoto = hasStagePhoto(mediaList, stage);
              const Icon = stageCfg?.Icon || ClipboardCheck;
              return (
                <div
                  key={m.label}
                  className={`rounded-2xl border p-4 transition-all ${
                    current
                      ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/10'
                      : done
                        ? 'border-emerald-200 bg-emerald-50/70'
                        : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        current ? 'bg-white/12 text-white' : done ? 'bg-white text-emerald-700 ring-1 ring-emerald-100' : 'bg-white text-slate-400 ring-1 ring-slate-200'
                      }`}
                    >
                      {done ? <CheckCircle2 size={18} strokeWidth={2.5} /> : <Icon size={18} strokeWidth={2.2} />}
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black tabular-nums ${
                        current ? 'bg-white/12 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400 ring-1 ring-slate-200'
                      }`}
                    >
                      {m.pct}%
                    </span>
                  </div>
                  <p className={`mt-3 text-sm font-black ${current ? 'text-white' : done ? 'text-emerald-950' : 'text-slate-600'}`}>
                    {m.label}
                  </p>
                  <p className={`mt-1 text-[11px] font-semibold ${current ? 'text-white/70' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {hasPhoto ? 'Photo captured' : current ? 'Photo required now' : 'Awaiting gate'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="qc-live-panel rounded-[24px] border border-slate-200/80 bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <Camera size={13} />
                Customer evidence
              </div>
              <h3 className="mt-1 text-base font-black tracking-tight text-slate-950">Milestone vehicle photos</h3>
            </div>
            <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                <span>Required coverage</span>
                <span>{photoCompliancePct}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${photoCompliancePct}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {VEHICLE_MILESTONE_PHOTOS.map((m) => {
            const existing = mediaList.find((x) => x.stage === m.stage && x.photoUrl);
            const isActiveMilestone = photoGateStage === m.stage;
            return (
              <div
                key={m.stage}
                className={`qc-live-photo-card flex flex-col overflow-hidden rounded-[22px] border ${
                  isActiveMilestone ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/10' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3 px-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                    <span className={`rounded-lg px-2 py-1 text-[10px] font-black tabular-nums ${isActiveMilestone ? 'bg-white/12 text-white' : 'bg-slate-950 text-white'}`}>
                      {m.pct}%
                    </span>
                    {hasStagePhoto(mediaList, m.stage) ? (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] ${isActiveMilestone ? 'text-emerald-200' : 'text-emerald-600'}`}>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-label="Photo uploaded" />
                        Uploaded
                      </span>
                    ) : (
                      <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${isActiveMilestone ? 'text-amber-200' : 'text-amber-700'}`}>Required</span>
                    )}
                  </div>
                    <p className={`mt-2 truncate text-sm font-black ${isActiveMilestone ? 'text-white' : 'text-slate-950'}`}>{m.defenseLabel}</p>
                    <p className={`mt-0.5 text-[11px] leading-snug ${isActiveMilestone ? 'text-white/65' : 'text-slate-500'}`}>{m.sub}</p>
                  </div>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActiveMilestone ? 'bg-white/12 text-white' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'}`}>
                    <m.Icon className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                </div>
                <div className={`mx-4 aspect-[4/3] overflow-hidden rounded-2xl border ${isActiveMilestone ? 'border-white/15 bg-white/8' : 'border-slate-200 bg-slate-100'}`}>
                  {existing?.photoUrl ? (
                    <button
                      type="button"
                      onClick={() => triggerPhotoPick(m.stage)}
                      disabled={!!uploadingStage}
                      className="group/photo relative h-full w-full overflow-hidden text-left disabled:opacity-60"
                    >
                      <img src={existing.photoUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover/photo:scale-[1.02]" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover/photo:opacity-100">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-900">
                          <UploadCloud size={12} />
                          Replace photo
                        </span>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => triggerPhotoPick(m.stage)}
                      disabled={!!uploadingStage}
                      className={`flex h-full w-full flex-col items-center justify-center gap-2 transition disabled:opacity-50 ${
                        isActiveMilestone ? 'text-white/70 hover:bg-white/10' : 'text-slate-400 hover:bg-slate-200/50 hover:text-slate-600'
                      }`}
                    >
                      {uploadingStage === m.stage ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                      ) : (
                        <>
                          <UploadCloud className="h-7 w-7 opacity-70" />
                          <span className="text-[11px] font-black uppercase tracking-[0.14em]">Upload photo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                {existing?.photoUrl ? (
                  <button
                    type="button"
                    onClick={() => triggerPhotoPick(m.stage)}
                    disabled={!!uploadingStage}
                    className={`mx-4 mt-3 rounded-xl border py-2 text-[11px] font-black uppercase tracking-[0.12em] transition disabled:opacity-50 ${
                      isActiveMilestone
                        ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Replace photo
                  </button>
                ) : null}
                <textarea
                  value={stageNotes[m.stage] ?? ''}
                  onChange={(e) => setStageNotes((prev) => ({ ...prev, [m.stage]: e.target.value }))}
                  placeholder="Short caption (optional, customer-facing)"
                  rows={2}
                  className={`mx-4 mb-4 mt-3 w-[calc(100%-2rem)] resize-none rounded-2xl border px-3 py-2 text-[11px] focus:outline-none focus:ring-2 ${
                    isActiveMilestone
                      ? 'border-white/15 bg-white/10 text-white placeholder:text-white/45 focus:ring-white/15'
                      : 'border-slate-200 bg-slate-50/70 text-slate-800 placeholder:text-slate-400 focus:ring-slate-200'
                  }`}
                />
              </div>
            );
          })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_380px]">
          <section className="qc-live-panel rounded-[24px] border border-slate-200/80 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  <ClipboardCheck size={13} />
                  Shop-floor log
                </div>
                <h3 className="mt-1 text-base font-black tracking-tight text-slate-950">Latest service updates</h3>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.13em] text-slate-500">
                {feed.length} entries
              </span>
          </div>
            <div className="mt-4 space-y-2">
            {feed.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                  <p className="text-sm font-bold text-slate-700">No service notes posted yet.</p>
                  <p className="mt-1 text-xs text-slate-500">Milestone photos will appear here as soon as they are uploaded.</p>
                </div>
            ) : (
              feed.map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{row.title}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{row.sub}</p>
                    </div>
                    <span className="flex-shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                      {row.badge}
                    </span>
                </div>
              ))
            )}
          </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Add update</label>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  placeholder="Describe milestone or handoff for the team…"
                    className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/70"
                />
              </div>
              <button
                type="button"
                onClick={submitStaffNote}
                disabled={addingNote || !noteDraft.trim()}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-slate-950 px-4 text-xs font-black uppercase tracking-[0.1em] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-45"
              >
                {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Post update
              </button>
            </div>
          </div>
          </section>

          <aside className="space-y-5">
            <section className="qc-live-panel rounded-[24px] border border-slate-200/80 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    <Car size={13} />
                    Vehicle dossier
                  </div>
                  <h3 className="mt-1 text-base font-black tracking-tight text-slate-950">Overview</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-black text-slate-600">
                  {plateDisplay}
                </span>
              </div>
              <div className="mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {previewPhoto ? (
                <img src={previewPhoto} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                  <ImageIcon className="h-8 w-8 opacity-50" strokeWidth={1.25} />
                  <span className="text-xs font-medium">Vehicle preview</span>
                </div>
              )}
            </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                  <dt className="font-semibold text-slate-500">Assigned technician</dt>
                  <dd className="text-right font-black text-slate-900">{formatTitle(leadTech, '—')}</dd>
              </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold text-slate-500">Est. completion</dt>
                  <dd className="text-right font-black text-slate-900">
                  {(job as any).estimatedCompletion || 'End of service day'}
                </dd>
              </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold text-slate-500">Customer visibility</dt>
                  <dd className={visibilityFresh ? 'text-right font-black text-emerald-600' : 'text-right font-black text-amber-600'}>
                  {visibilityFresh ? 'Updated' : 'Pending sync'}
                </dd>
              </div>
            </dl>
            </section>

            <section className="qc-live-panel rounded-[24px] border border-slate-200/80 bg-white p-5">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${blockedByMissingMilestonePhoto || releaseBlockedByPhoto ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'}`}>
                  {blockedByMissingMilestonePhoto || releaseBlockedByPhoto ? <CircleAlert size={18} /> : <BadgeCheck size={18} />}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {blockedByMissingMilestonePhoto || releaseBlockedByPhoto ? 'Quality gate blocked' : 'Quality gate clear'}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    {blockedByMissingMilestonePhoto && photoGateStage
                      ? `${VEHICLE_MILESTONE_PHOTOS.find((x) => x.stage === photoGateStage)?.defenseLabel} photo is required before the next milestone.`
                      : releaseBlockedByPhoto
                        ? 'Ready for pickup photo is required before release.'
                        : 'Milestone evidence is ready for the next action.'}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>

      {/* Collapsible — customer photos + team */}
        <div className="qc-live-panel overflow-hidden rounded-[24px] border border-slate-200/80 bg-white">
        <button
          type="button"
          onClick={() => setPhotosOpen((o) => !o)}
            className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-black text-slate-800 hover:bg-slate-50/80"
        >
          <span className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-slate-500" />
            Pre-service: appointment note (optional)
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${photosOpen ? 'rotate-180' : ''}`} />
        </button>
        {photosOpen && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              Required vehicle photos for each progress point are in <strong className="text-slate-700">Milestone vehicle photos</strong>{' '}
              (always visible above). This section is only for an optional caption before service starts.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STAGE_PHOTO_UPLOAD_ROWS.filter((row) => row.stage === 'confirmed').map((row) => {
                const existing = mediaList.find((m) => m.stage === row.stage);
                return (
                  <div
                    key={row.stage}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200/90 bg-slate-50/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <row.Icon size={15} className="mt-0.5 shrink-0 text-slate-600" strokeWidth={1.85} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900">{row.label}</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{row.hint}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerPhotoPick(row.stage)}
                        disabled={!!uploadingStage}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {uploadingStage === row.stage ? <Loader2 size={12} className="animate-spin" /> : 'Upload'}
                      </button>
                    </div>
                    <textarea
                      value={stageNotes[row.stage] ?? ''}
                      onChange={(e) => setStageNotes((prev) => ({ ...prev, [row.stage]: e.target.value }))}
                      placeholder="Caption (customer-facing)"
                      rows={2}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    {row.stage === 'confirmed' && (
                      <button
                        type="button"
                        onClick={async () => {
                          setUploadingStage(row.stage);
                          await onUploadStagePhoto(job.id, {
                            stage: row.stage,
                            description: stageNotes[row.stage],
                            file: null,
                          });
                          setUploadingStage(null);
                        }}
                        disabled={!!uploadingStage || !stageNotes[row.stage]?.trim()}
                        className="self-start rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Save note only
                      </button>
                    )}
                    {existing?.photoUrl ? (
                      <img src={existing.photoUrl} alt="" className="max-h-24 w-full rounded-lg border border-slate-100 object-cover" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>

        <div className="qc-live-panel overflow-hidden rounded-[24px] border border-slate-200/80 bg-white">
        <button
          type="button"
          onClick={() => setStaffOpen((o) => !o)}
            className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-black text-slate-800 hover:bg-slate-50/80"
        >
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            Service team ({assignedCount}/4)
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${staffOpen ? 'rotate-180' : ''}`} />
        </button>
        {staffOpen && (
          <div className="space-y-3 border-t border-slate-100 px-5 py-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {staffSlots.map((slot) => (
                <StaffPicker
                  key={slot.slot}
                  slotLabel={slot.label}
                  value={slot.name}
                  onChange={(name, role) =>
                    setStaffSlots((prev) => prev.map((s) => (s.slot === slot.slot ? { ...s, name, role } : s)))
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveStaff}
              disabled={savingStaff}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {savingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Save team assignment
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

const ORDER_STATUSES_ACTIVE = ['approved', 'confirmed', 'assigned', 'received', 'in_progress', 'completed'];

export default function QCLiveTrackerView({
  jobs,
  loading,
  onAdvance,
  onSaveStaff,
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
  const activeJobs = jobs.filter((j) => ORDER_STATUSES_ACTIVE.includes((j as any).orderStatus || ''));
  const releasedJobs = jobs.filter((j) => (j as any).orderStatus === 'released');
  const avgProgress = activeJobs.length
    ? Math.round(
        activeJobs.reduce(
          (sum, job) => sum + enterpriseStepState((job as any).serviceTrackingStage as ServiceStage | null).progressPct,
          0
        ) / activeJobs.length
      )
    : 0;
  const qcGateJobs = activeJobs.filter((j) => (j as any).serviceTrackingStage === 'quality_check').length;
  const evidenceBlockedJobs = activeJobs.filter((j) => {
    const stage = (j as any).serviceTrackingStage as ServiceStage | undefined;
    if (!stage || !['received', 'in_progress', 'quality_check', 'ready_pickup'].includes(stage)) return false;
    return !hasStagePhoto(((j as any).trackerStageMedia || []) as { stage?: string; photoUrl?: string }[], stage);
  }).length;

  return (
    <div className="qc-live-shell space-y-6">
      <div className="qc-live-header overflow-hidden rounded-[28px] border border-slate-200/80 bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">
              <Radio size={13} strokeWidth={2.4} />
              Quality Control LiveOps
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-[2rem]">Live service tracker</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              Track active service orders, enforce photo evidence, and move vehicles through QC with a clear customer-facing trail.
            </p>
          </div>

          <div className="grid min-w-full grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[620px]">
            <div className="qc-live-header-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Active</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{activeJobs.length}</p>
            </div>
            <div className="qc-live-header-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Avg progress</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-blue-700">{avgProgress}%</p>
            </div>
            <div className="qc-live-header-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">At QC</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">{qcGateJobs}</p>
            </div>
            <div className="qc-live-header-stat rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Evidence due</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-amber-700">{evidenceBlockedJobs}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="qc-live-ops-strip flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
            <MapPin size={18} className="text-slate-700" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-950">Operations lane</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
              Start on arrival, capture each milestone photo, then complete QC or release handoff from the same card.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
            <BadgeCheck size={12} />
            QC enforced
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600 ring-1 ring-slate-200">
            <Images size={12} />
            4 photo gates
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-[28rem] animate-pulse rounded-2xl border border-slate-100 bg-slate-50/80" />
          ))}
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="qc-live-panel flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200/90 bg-white py-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
            <Radio size={26} strokeWidth={1.5} />
          </div>
          <p className="text-lg font-black text-slate-900">No active orders</p>
          <p className="mt-2 max-w-sm text-center text-sm text-slate-500">
            Approved bookings appear here for live tracking and QC handoffs.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {activeJobs.map((job) => (
            <JobTrackerCard
              key={job.id}
              job={job}
              onAdvance={onAdvance}
              onSaveStaff={onSaveStaff}
              onUploadStagePhoto={onUploadStagePhoto}
              onAddStaffNote={onAddStaffNote}
            />
          ))}
        </div>
      )}

      {releasedJobs.length > 0 && (
        <div className="pt-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-slate-500">
              <CheckCircle2 size={14} className="text-slate-600" strokeWidth={2} />
              Released — {releasedJobs.length}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {releasedJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-600">
                  <Flag size={16} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{job.jobId}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle} ·{' '}
                    {job.customer}
                  </p>
                </div>
                <span className="flex-shrink-0 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                  Released
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
