import React, { useState, useRef, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Car,
  ChevronDown,
  Clock,
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
} from 'lucide-react';
import type { QCJob } from '@/hooks/useQCData';
import type { ServiceStage } from './QCServiceControlPanel';
import { SERVICE_STAFF_ROSTER } from './QCServiceControlPanel';
import { toast } from 'sonner';

/** Five enterprise display steps (Option A: labels map to existing backend stages). */
const ENTERPRISE_STEPS = [
  'Vehicle Received',
  'Inspection',
  'Repair In Progress',
  'Quality Review',
  'Ready for Pickup',
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
    label: 'Vehicle Received',
    sub: 'Received at workshop',
    Icon: Car,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#e2e8f0',
    dot: '#0f172a',
  },
  {
    id: 'in_progress',
    label: 'Repair In Progress',
    sub: 'Work in progress',
    Icon: Wrench,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#e2e8f0',
    dot: '#0f172a',
  },
  {
    id: 'quality_check',
    label: 'Quality Review',
    sub: 'QC inspection',
    Icon: ShieldCheck,
    color: '#0f172a',
    bg: '#f8fafc',
    border: '#e2e8f0',
    dot: '#0f172a',
  },
  {
    id: 'ready_pickup',
    label: 'Ready for Pickup',
    sub: 'Customer notified',
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

/** Stepper: which indices are done vs current (5 UI steps). */
function enterpriseStepState(stage: ServiceStage | null | undefined): {
  doneMax: number;
  current: number;
  progressPct: number;
  statusLine: string;
} {
  const st = stage ?? null;
  if (!st || st === 'confirmed') {
    return { doneMax: -1, current: 0, progressPct: 8, statusLine: 'Awaiting vehicle intake' };
  }
  if (st === 'received') {
    return { doneMax: -1, current: 0, progressPct: 22, statusLine: 'Vehicle received' };
  }
  if (st === 'in_progress') {
    return { doneMax: 1, current: 2, progressPct: 58, statusLine: 'Repair in progress' };
  }
  if (st === 'quality_check') {
    return { doneMax: 2, current: 3, progressPct: 78, statusLine: 'Quality review' };
  }
  if (st === 'ready_pickup') {
    return { doneMax: 3, current: 4, progressPct: 100, statusLine: 'Ready for pickup' };
  }
  return { doneMax: -1, current: 0, progressPct: 5, statusLine: 'Scheduled' };
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
  { stage: 'received', pct: 25, defenseLabel: 'Vehicle arrive', sub: 'Photo of vehicle at intake', Icon: Car },
  { stage: 'in_progress', pct: 50, defenseLabel: 'Service in progress', sub: 'Photo during active work', Icon: Wrench },
  { stage: 'quality_check', pct: 75, defenseLabel: 'Quality check', sub: 'Photo at QC / inspection', Icon: ShieldCheck },
  { stage: 'ready_pickup', pct: 100, defenseLabel: 'Ready for pickup', sub: 'Photo before handoff', Icon: PackageCheck },
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
  const curIdx = stageIdx(currentStage);
  const nextStage = BACKEND_FLOW[curIdx + 1] as ServiceStage | undefined;
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
  const isPipelineComplete = !nextStage && currentStage === 'ready_pickup';

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
  const vehicleDisplay =
    [job.vehicleYear, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || job.vehicle || '—';
  const plateDisplay = job.plate?.length > 20 ? '—' : job.plate || '—';
  const leadTech = staffSlots.find((s) => s.name)?.name || job.technician || '—';

  const lastMediaAt = mediaList
    .map((m) => (m.uploadedAt ? new Date(m.uploadedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const visibilityFresh =
    lastMediaAt && Date.now() - lastMediaAt < 24 * 60 * 60 * 1000;

  const getStepCircle = (i: number) => {
    const done = i <= stepState.doneMax;
    const current = i === stepState.current;
    if (done) {
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-sm sm:h-10 sm:w-10">
          <CheckCircle2 className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2} />
        </div>
      );
    }
    if (current) {
      return (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-900 bg-white text-xs font-bold text-slate-900 shadow-sm sm:h-10 sm:w-10">
          {i + 1}
        </div>
      );
    }
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400 sm:h-10 sm:w-10">
        {i + 1}
      </div>
    );
  };

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
            <span>Advance to {nextCfg.label}</span>
          )}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={hiddenPhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onHiddenPhotoChange}
      />

      {/* Top — Service order summary */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Service order</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{job.jobId}</h2>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">{vehicleDisplay}</span>
              {plateDisplay !== '—' && (
                <span className="ml-2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                  {plateDisplay}
                </span>
              )}
              <span className="mx-2 text-slate-300">·</span>
              <span>{job.customer}</span>
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Progress</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">{stepState.progressPct}%</p>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Current status</p>
              <p className="text-xs font-semibold text-emerald-900">{stepState.statusLine}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Middle — Service progress */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
        <h3 className="text-sm font-semibold text-slate-900">Service progress</h3>
        <div className="mt-6 overflow-x-auto pb-2">
          <div className="flex min-w-[640px] items-start justify-between gap-0 px-1">
            {ENTERPRISE_STEPS.map((label, idx) => (
              <React.Fragment key={label}>
                <div className="flex max-w-[120px] flex-1 flex-col items-center gap-2">
                  {getStepCircle(idx)}
                  <p
                    className={`text-center text-[10px] font-medium leading-tight sm:text-[11px] ${
                      idx <= stepState.doneMax || idx === stepState.current ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {label}
                  </p>
                </div>
                {idx < ENTERPRISE_STEPS.length - 1 && (
                  <div
                    className={`mx-1 mt-[18px] h-0.5 min-w-[8px] flex-1 rounded-full sm:mt-[20px] ${
                      idx <= stepState.doneMax ? 'bg-slate-900' : 'bg-slate-200'
                    }`}
                    aria-hidden
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Milestone vehicle photos — panel requirement: photo at 25 / 50 / 75 / 100% */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Milestone vehicle photos</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Upload here for each progress point — <strong className="font-medium text-slate-700">25% vehicle arrive</strong>,{' '}
              <strong className="font-medium text-slate-700">50% service in progress</strong>,{' '}
              <strong className="font-medium text-slate-700">75% quality check</strong>,{' '}
              <strong className="font-medium text-slate-700">100% ready for pickup</strong>. A photo is required before you can
              advance past that stage (and before final release).
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {VEHICLE_MILESTONE_PHOTOS.map((m) => {
            const existing = mediaList.find((x) => x.stage === m.stage && x.photoUrl);
            const isActiveMilestone = photoGateStage === m.stage;
            return (
              <div
                key={m.stage}
                className={`flex flex-col rounded-xl border p-3 ${
                  isActiveMilestone ? 'border-slate-900/25 bg-slate-50/80 ring-1 ring-slate-900/10' : 'border-slate-200/90 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                      {m.pct}%
                    </span>
                    {hasStagePhoto(mediaList, m.stage) ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Photo uploaded" />
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Required</span>
                    )}
                  </div>
                  <m.Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-900">{m.defenseLabel}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{m.sub}</p>
                <div className="mt-2 aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-100">
                  {existing?.photoUrl ? (
                    <img src={existing.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => triggerPhotoPick(m.stage)}
                      disabled={!!uploadingStage}
                      className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-400 transition hover:bg-slate-200/40 hover:text-slate-600 disabled:opacity-50"
                    >
                      {uploadingStage === m.stage ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-6 w-6 opacity-60" />
                          <span className="text-[10px] font-semibold uppercase tracking-wide">Tap to upload</span>
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
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Replace photo
                  </button>
                ) : null}
                <textarea
                  value={stageNotes[m.stage] ?? ''}
                  onChange={(e) => setStageNotes((prev) => ({ ...prev, [m.stage]: e.target.value }))}
                  placeholder="Short caption (optional, customer-facing)"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom grid — updates + overview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Latest service updates</h3>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Repair milestones</span>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {feed.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No notes yet. Use <strong className="font-medium text-slate-700">Milestone vehicle photos</strong> above for
                required stage photos; post updates here for team notes.
              </p>
            ) : (
              feed.map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{row.sub}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {row.badge}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Add update</label>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  placeholder="Describe milestone or handoff for the team…"
                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <button
                type="button"
                onClick={submitStaffNote}
                disabled={addingNote || !noteDraft.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-45"
              >
                {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Post update
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
            <h3 className="text-sm font-semibold text-slate-900">Vehicle overview</h3>
            <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
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
              <div className="flex justify-between gap-2 border-t border-slate-100 pt-3">
                <dt className="text-slate-500">Assigned technician</dt>
                <dd className="font-semibold text-slate-900">{leadTech}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Est. completion</dt>
                <dd className="font-semibold text-slate-900">
                  {(job as any).estimatedCompletion || 'End of service day'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Customer visibility</dt>
                <dd className={visibilityFresh ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-600'}>
                  {visibilityFresh ? 'Updated' : 'Pending sync'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Primary CTA — enterprise placement */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {isPipelineComplete ? (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                Pipeline complete — confirm release when the customer has left.
              </div>
            ) : null}
            {primaryCta()}
            {blockedByMissingMilestonePhoto && photoGateStage ? (
              <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-800">
                Upload the{' '}
                <strong className="font-semibold">
                  {VEHICLE_MILESTONE_PHOTOS.find((x) => x.stage === photoGateStage)?.pct}% —{' '}
                  {VEHICLE_MILESTONE_PHOTOS.find((x) => x.stage === photoGateStage)?.defenseLabel}
                </strong>{' '}
                photo in <strong className="font-semibold">Milestone vehicle photos</strong> before advancing.
              </p>
            ) : null}
            {isPipelineComplete && releaseBlockedByPhoto ? (
              <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-800">
                Upload the <strong className="font-semibold">100% — Ready for pickup</strong> milestone photo before marking
                released.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Collapsible — customer photos + team */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          onClick={() => setPhotosOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50/80"
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

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          onClick={() => setStaffOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50/80"
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/60 pb-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.65rem]">Live service tracker</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Enterprise view for quality checkers — order progress, milestones, and customer-facing tracker media.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400/40 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-800" />
          </span>
          <span className="text-[13px] font-medium tabular-nums text-slate-800">
            {activeJobs.length} active {activeJobs.length === 1 ? 'order' : 'orders'}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:gap-4 sm:px-5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          <MapPin size={17} className="text-slate-700" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Operations</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Start tracking when the vehicle arrives, advance each milestone, post updates for the shop floor, and keep
            customer photos current.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-[28rem] animate-pulse rounded-2xl border border-slate-100 bg-slate-50/80" />
          ))}
        </div>
      ) : activeJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white py-24">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
            <Radio size={26} strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-semibold text-slate-900">No active orders</p>
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
